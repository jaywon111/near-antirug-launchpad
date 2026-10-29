import { useEffect, useMemo, useState } from 'react';
import { config, contractId, network, openWalletModal, walletSelector, activeAccount, type Launch, formatNear, rawError } from './near';

type Toast = { kind: 'ok' | 'bad' | 'info'; text: string };
const yocto = 10n ** 24n;
const toYocto = (near: string) => (BigInt(Math.max(0, Math.round(Number(near) * 1e6))) * (yocto / 1_000_000n)).toString();
const ns = (seconds: string) => String(Math.max(0, Math.round(Number(seconds) * 1e9)));
const errorText = (e: unknown) => rawError(e).replace(/^Error: /, '');

async function rpcView<T>(methodName: string, args: Record<string, unknown>): Promise<T> {
  if (!contractId) throw new Error('Contract ID is not configured yet. Set VITE_CONTRACT_ID to your deployed account.');
  const endpoint = config.nodeUrl;
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'launchpad', method: 'query', params: { request_type: 'call_function', account_id: contractId, method_name: methodName, args_base64: btoa(JSON.stringify(args)), finality: 'final' } }) });
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.data || payload.error.message || 'RPC view failed');
  const bytes: number[] = payload.result.result;
  return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as T;
}
async function sign(methodName: string, args: Record<string, unknown>, deposit = '0') {
  const selector = await walletSelector();
  const state = selector.store.getState();
  if (!state.accounts.length) { await openWalletModal(); }
  const wallet = await selector.wallet();
  const selected = selector.store.getState().accounts[0];
  if (!selected) throw new Error('Connect a NEAR wallet first.');
  const yocto = BigInt(deposit);
  const gasTgas = 300n;
  const b64 = btoa(JSON.stringify(args));
  const action = { type: 'FunctionCall', params: { methodName, args: b64, gas: gasTgas.toString(), deposit: yocto.toString() } };
  return wallet.signAndSendTransaction({ receiverId: contractId, actions: [action] } as never);
}
function App() {
  const [route, setRoute] = useState<'home' | 'create' | 'launch'>('home');
  const [selectedId, setSelectedId] = useState('');
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [accountId, setAccountId] = useState(activeAccount);
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState(false);
  const [launchIdInput, setLaunchIdInput] = useState('launch-1');
  const [create, setCreate] = useState({ name: '', symbol: '', supply: '1000000', reserve: '10', base: '0.00001', slope: '0.0001', vesting: '20', cliff: '0', duration: '31536000' });
  const [amount, setAmount] = useState('100');
  const [quote, setQuote] = useState('');

  const note = (kind: Toast['kind'], text: string) => { setToast({ kind, text }); window.setTimeout(() => setToast(null), 6500); };
  const loadLaunch = async (id: string) => {
    setBusy(true);
    try { const data = await rpcView<Launch>('get_launch', { token_id: id }); setLaunch(data); setSelectedId(id); setRoute('launch'); setToast(null); history.replaceState({}, '', `#launch/${encodeURIComponent(id)}`); }
    catch (e) { note('bad', errorText(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    const hash = decodeURIComponent(location.hash);
    if (hash.startsWith('#launch/')) { const id = hash.slice(8); if (id) void loadLaunch(id); }
    const init = async () => { try { const selector = await walletSelector(); const state = selector.store.getState(); if (state.accounts[0]) setAccountId(state.accounts[0].accountId); selector.store.observable.subscribe((s) => setAccountId(s.accounts[0]?.accountId || '')); } catch { /* wallet setup stays lazy */ } };
    void init();
  }, []);
  const buyQuote = useMemo(() => quote, [quote]);
  const connect = async () => { try { const id = await openWalletModal(); setAccountId(id); note('ok', `connected ${id}`); } catch (e) { note('bad', errorText(e)); } };
  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      const supply = BigInt(create.supply).toString();
      const args = { name: create.name.trim(), symbol: create.symbol.toUpperCase().trim(), supply, initial_reserve: toYocto(create.reserve), base_price: toYocto(create.base), slope: toYocto(create.slope), dev_vesting_bps: Math.round(Number(create.vesting) * 100), vesting_cliff_ns: ns(create.cliff), vesting_duration_ns: ns(create.duration) };
      const result = await sign('create_token', args, '5000000000000000000000');
      const id = (result as { transaction_outcome?: { outcome?: { logs?: string[] } } })?.transaction_outcome?.outcome?.logs?.find((line) => line.startsWith('LAUNCH_ID:'))?.slice('LAUNCH_ID:'.length) || '';
      note('ok', id ? `launch created: ${id}` : 'create transaction submitted. open the launch by id after it confirms.');
      if (id) { setLaunchIdInput(id); void loadLaunch(id); }
    } catch (e) { note('bad', errorText(e)); }
    finally { setBusy(false); }
  };
  const updateQuote = async (value: string) => {
    setAmount(value); if (!selectedId || !value || Number(value) <= 0) { setQuote(''); return; }
    try { setQuote(await rpcView<string>('get_curve_quote', { token_id: selectedId, amount: String(Math.round(Number(value))) })); } catch { setQuote(''); }
  };
  const trade = async (side: 'buy' | 'sell') => {
    if (!launch) return; setBusy(true);
    try {
      const qty = String(Math.round(Number(amount)));
      if (side === 'buy') {
        if (!quote) throw new Error('Wait for the on-chain quote before buying.');
        const deposit = (BigInt(quote) + BigInt(quote) / 100n + 1n).toString();
        await sign('buy', { token_id: launch.token_id, amount: qty, min_out: qty }, deposit);
      } else await sign('sell', { token_id: launch.token_id, amount: qty, min_near_out: '0' });
      note('ok', `${side} transaction submitted`); await loadLaunch(launch.token_id);
    } catch (e) { note('bad', errorText(e)); }
    finally { setBusy(false); }
  };
  const simulateRug = async () => {
    const id = launch?.token_id || selectedId || launchIdInput.trim(); setBusy(true);
    try { await sign('rug_attempt', { token_id: id, amount: '1' }); note('bad', 'unexpectedly succeeded. inspect the contract deployment before using it.'); }
    catch (e) { note('ok', `on-chain rejection: ${errorText(e)}`); }
    finally { setBusy(false); }
  };
  const claimFees = async () => {
    if (!launch) return; setBusy(true);
    try { await sign('claim_fees', { token_id: launch.token_id }); note('ok', 'fee claim submitted'); }
    catch (e) { note('bad', errorText(e)); }
    finally { setBusy(false); }
  };
  const claimVested = async () => {
    if (!launch) return; setBusy(true);
    try { await sign('claim_vested', { token_id: launch.token_id }); note('ok', 'vesting claim submitted'); }
    catch (e) { note('bad', errorText(e)); }
    finally { setBusy(false); }
  };
  const go = (next: 'home' | 'create') => { setRoute(next); setLaunch(null); history.replaceState({}, '', next === 'home' ? location.pathname : '#create'); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return <div className="app-shell">
    <div className="ticker"><span>NO MINT KEY</span><i /> FIXED SUPPLY <i /> LIQUIDITY LOCKED <i /> BUILT ON NEAR <i /> NO MINT KEY <i /> FIXED SUPPLY <i /></div>
    <header className="topbar"><button className="wordmark" onClick={() => go('home')} aria-label="Steadfast home"><span className="mark">s.</span><span>steadfast</span></button><nav><button onClick={() => go('home')}>The idea</button><button onClick={() => go('create')}>Create</button><a href="#explore" onClick={() => go('home')}>Explore</a></nav><button className="connect" onClick={connect}>{accountId ? `${accountId.slice(0, 9)}…` : 'Connect wallet'}<span>↗</span></button></header>
    {route === 'home' && <>
      <main>
        <section className="hero">
          <div className="hero-copy"><p className="eyebrow"><span className="live-dot" /> A launchpad with the exits removed</p><h1>Make a token.<br /><em>Not a trapdoor.</em></h1><p className="hero-deck">Fixed supply, curve-based trading, and liquidity that can’t quietly walk away. The rules are on-chain, not in the founder’s group chat.</p><div className="hero-actions"><button className="button button-light" onClick={() => go('create')}>Create a token <span>↗</span></button><a className="button button-ghost" href="#explore" onClick={() => go('home')}>Explore launches <span>↓</span></a></div><div className="hero-foot"><span>BUILT ON NEAR</span><span>OPEN BY DESIGN</span></div></div>
          <div className="hero-art" aria-label="abstract green curve illustration"><div className="orbit orbit-a" /><div className="orbit orbit-b" /><div className="orbit orbit-c" /><div className="art-core"><span>NO</span><span>EXIT</span></div><span className="art-caption">THE SHAPE OF A SAFER LAUNCH</span><span className="art-index">01 / 03</span></div>
        </section>
        <section className="manifesto" id="explore"><div className="manifesto-label">THE PROMISE</div><div><h2>Trust is good.<br /><em>Constraints are better.</em></h2><p>Steadfast makes the important promises impossible to quietly undo. A supply cap is a cap. Locked liquidity has no withdrawal method. Vesting follows the clock, not a founder’s mood.</p><button className="text-link" onClick={() => { setRoute('launch'); setSelectedId(''); }}>Open a launch by ID <span>↗</span></button></div><div className="manifesto-stamp"><div className="stamp-ring">CODE OVER PROMISES · CODE OVER PROMISES ·</div><span>01</span></div></section>
        <section className="principles"><div className="section-label">PROTOCOL, IN THREE MOVES</div><div className="principle-row"><span className="principle-no">01</span><div><h3>No mint button.</h3><p>Supply is fixed at creation. There is no later mint entry point.</p></div><span className="principle-mark">↗</span></div><div className="principle-row"><span className="principle-no">02</span><div><h3>No liquidity escape hatch.</h3><p>Reserve stays in contract custody. The contract has no withdrawal method.</p></div><span className="principle-mark">↗</span></div><div className="principle-row"><span className="principle-no">03</span><div><h3>The curve is visible.</h3><p>Buy and sell quotes come from the same on-chain bonding curve.</p></div><span className="principle-mark">↗</span></div></section>
        <section className="explore-band"><div><p className="eyebrow">GO LOOK</p><h2>Read the chain<br /><em>for yourself.</em></h2><p>Paste a launch ID and load its live details directly from the contract.</p></div><form className="launch-lookup" onSubmit={(e) => { e.preventDefault(); void loadLaunch(launchIdInput.trim()); }}><label htmlFor="launch-id">LAUNCH ID</label><div className="lookup-input"><input id="launch-id" value={launchIdInput} onChange={(e) => setLaunchIdInput(e.target.value)} placeholder="launch-1" /><button type="submit" disabled={busy}>Open <span>↗</span></button></div><small>{contractId ? `reading ${contractId} on ${network}` : 'configure VITE_CONTRACT_ID to read live launches'}</small></form></section>
        <section className="simulation"><div className="sim-icon">!</div><div><p className="eyebrow">ON-CHAIN FIELD TEST</p><h2>Attempt a rug.<br /><em>Watch the chain say no.</em></h2><p>Call the contract’s rug_attempt method. It should reject with the live on-chain reason.</p></div><button className="button button-light" onClick={() => void simulateRug()} disabled={busy || !contractId}>{busy ? 'Calling…' : 'Run rug attempt'} <span>↗</span></button></section>
      </main>
    </>}
    {route === 'create' && <main className="workpage"><div className="work-heading"><p className="eyebrow"><span className="live-dot" /> NEW LAUNCH / ON-CHAIN</p><h1>A token that<br /><em>keeps its word.</em></h1><p>Set the rules once. The contract enforces them from block one.</p></div><form className="creation-form" onSubmit={submitCreate}><div className="form-topline"><span>01 — THE TOKEN</span><span>ALL FIELDS REQUIRED</span></div><div className="form-grid"><label className="wide">Token name<input required minLength={2} maxLength={32} placeholder="e.g. Night Garden" value={create.name} onChange={(e) => setCreate({...create, name:e.target.value})} /></label><label>Symbol<input required minLength={2} maxLength={10} pattern="[A-Za-z0-9]+" placeholder="NITE" value={create.symbol} onChange={(e) => setCreate({...create, symbol:e.target.value.toUpperCase()})} /></label><label>Fixed supply<input required type="number" min="1000" max="1000000000000000000" value={create.supply} onChange={(e) => setCreate({...create,supply:e.target.value})} /></label><label>Starting reserve <span className="unit">NEAR</span><input required type="number" min="0.000001" step="any" value={create.reserve} onChange={(e) => setCreate({...create,reserve:e.target.value})} /></label><label>Base price <span className="unit">NEAR / token</span><input required type="number" min="0.00000001" step="any" value={create.base} onChange={(e) => setCreate({...create,base:e.target.value})} /></label><label>Curve slope <span className="unit">NEAR</span><input required type="number" min="0.00000001" step="any" value={create.slope} onChange={(e) => setCreate({...create,slope:e.target.value})} /></label></div><div className="form-topline second"><span>02 — THE VESTING</span><span>LOCKED TO YOUR WALLET</span></div><div className="form-grid"><label>Founder allocation<input required type="number" min="1" max="50" value={create.vesting} onChange={(e) => setCreate({...create,vesting:e.target.value})} /><small>Percent of fixed supply, max 50%</small></label><label>Cliff <span className="unit">SECONDS</span><input required type="number" min="0" value={create.cliff} onChange={(e) => setCreate({...create,cliff:e.target.value})} /></label><label>Vesting duration <span className="unit">SECONDS</span><input required type="number" min="1" value={create.duration} onChange={(e) => setCreate({...create,duration:e.target.value})} /></label></div><div className="form-proof"><span className="proof-check">✓</span><p><strong>Safety rules are fixed in the contract.</strong><br />Mint is renounced at creation. Reserve has no withdrawal function. Founder tokens vest on the schedule above.</p></div><button className="button button-light submit-create" disabled={busy || !contractId || !accountId}>{busy ? 'Waiting for wallet…' : 'Create on NEAR'} <span>↗</span></button>{!accountId && <p className="form-footnote">Connect a NEAR wallet to sign the transaction. Creation attaches a 0.005 NEAR storage buffer.</p>}</form></main>}
    {route === 'launch' && <main className="workpage detail-page">{launch ? <><div className="detail-heading"><button className="back-link" onClick={() => go('home')}>← Back to steadfast</button><p className="eyebrow"><span className="live-dot" /> LIVE FROM THE CONTRACT</p><div className="token-title"><span className="token-avatar">{launch.symbol.slice(0,1)}</span><div><h1>{launch.name}<em> / {launch.symbol}</em></h1><p>{launch.token_id} <span>·</span> created by {launch.creator}</p></div></div></div><div className="safety-list"><div><b>✓</b><span><strong>Mint renounced</strong><small>verified from chain</small></span></div><div><b>✓</b><span><strong>Liquidity locked</strong><small>{formatNear(launch.locked_reserve)} in contract custody</small></span></div><div><b>◷</b><span><strong>Vesting enforced</strong><small>{formatNear(launch.vesting_claimed)} of {formatNear(launch.vesting_total)} claimed</small></span></div></div><div className="token-stats"><div><span>FIXED CAP</span><strong>{Number(launch.cap).toLocaleString()}</strong></div><div><span>CIRCULATING</span><strong>{Number(launch.circulating).toLocaleString()}</strong></div><div><span>ACCRUED FEES</span><strong>{formatNear(launch.accrued_fees)}</strong></div><div><span>CONTRACT</span><strong className="small-stat">{launch.contract_id}</strong></div></div><section className="trade-section"><div><p className="eyebrow">04 — THE CURVE</p><h2>Trade the<br /><em>same rules.</em></h2><p>Quotes and checks are enforced by the launch contract. Trades incur a 1% fee.</p><label className="amount-field">TOKEN AMOUNT<input type="number" min="1" step="1" value={amount} onChange={(e) => void updateQuote(e.target.value)} /></label><div className="quote-line"><span>BUY QUOTE, BEFORE FEE</span><strong>{buyQuote ? formatNear(buyQuote) : '—'}</strong></div><div className="trade-buttons"><button className="button button-light" onClick={() => void trade('buy')} disabled={busy || !accountId}>Buy <span>↗</span></button><button className="button button-ghost" onClick={() => void trade('sell')} disabled={busy || !accountId}>Sell <span>↗</span></button></div><button className="text-link claim-link" onClick={() => void claimFees()} disabled={!accountId}>Claim holder fees <span>↗</span></button>{launch.creator === accountId && <button className="text-link claim-link" onClick={() => void claimVested()}>Claim vested tokens <span>↗</span></button>}</div><div className="curve-art"><div className="curve-label">BONDING CURVE / NEAR</div><svg viewBox="0 0 500 320" role="img" aria-label="rising bonding curve"><path d="M30 280 C110 274 142 252 194 213 C253 169 271 133 312 91 C358 45 411 38 472 26" fill="none" stroke="currentColor" strokeWidth="3"/><path d="M30 280 C110 274 142 252 194 213 C253 169 271 133 312 91 C358 45 411 38 472 26 L472 290 L30 290Z" fill="url(#g)" opacity=".13"/><defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#c2e89b"/><stop offset="1" stopColor="#c2e89b" stopOpacity="0"/></linearGradient></defs><path d="M30 290H475M30 290V24" stroke="currentColor" opacity=".24" strokeDasharray="3 7"/></svg><div className="curve-axis"><span>SUPPLY →</span><span>PRICE ↑</span></div><button className="text-link" onClick={() => void simulateRug()} disabled={busy}>Try the rug attempt <span>↗</span></button></div></section><div className="detail-vesting"><div><p className="eyebrow">FOUNDER VESTING</p><h3>{Math.round(launch.vesting_duration_ns / 1e9 / 86400)} days, on-chain.</h3></div><p>Beneficiary <strong>{launch.vesting_beneficiary}</strong><br />Cliff: {Math.round(launch.vesting_cliff_ns / 1e9 / 86400)} days · Claimed: {Number(launch.vesting_claimed).toLocaleString()} / {Number(launch.vesting_total).toLocaleString()}</p></div></> : <div className="empty-launch"><p className="eyebrow">OPEN A LAUNCH</p><h1>Know the<br /><em>rules yourself.</em></h1><p>No on-chain listing index is exposed by the contract. Paste a token ID to fetch the exact launch view.</p><form className="launch-lookup" onSubmit={(e) => { e.preventDefault(); void loadLaunch(launchIdInput.trim()); }}><label>LAUNCH ID</label><div className="lookup-input"><input value={launchIdInput} onChange={(e) => setLaunchIdInput(e.target.value)} placeholder="launch-1"/><button disabled={busy}>Load <span>↗</span></button></div></form><button className="back-link" onClick={() => go('home')}>← Back to home</button></div>}</main>}
    <footer className="footer"><div className="footer-brand"><span className="mark">s.</span> steadfast</div><p>Built to make the rules hold.<br />Not to make promises louder.</p><span className="footer-network">{network.toUpperCase()} · {contractId ? contractId : 'CONTRACT NOT CONFIGURED'}</span></footer>
    {toast && <div className={`toast ${toast.kind}`} role="status"><span>{toast.kind === 'ok' ? '✓' : toast.kind === 'bad' ? '!' : 'i'}</span>{toast.text}<button onClick={() => setToast(null)} aria-label="Dismiss">×</button></div>}
  </div>;
}
export default App;
