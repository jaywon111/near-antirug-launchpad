import { setupWalletSelector } from '@near-wallet-selector/core';
import { setupModal } from '@near-wallet-selector/modal-ui';
import '@near-wallet-selector/modal-ui/styles.css';
import { setupNearWallet } from '@near-wallet-selector/near-wallet';

export type Launch = {
  token_id: string; name: string; symbol: string; creator: string; cap: string; circulating: string;
  locked_reserve: string; base_price: string; slope: string; mint_renounced: boolean; liquidity_locked: boolean;
  vesting_beneficiary: string; vesting_total: string; vesting_claimed: string; vesting_cliff_ns: number;
  vesting_duration_ns: number; accrued_fees: string; fee_index: string; contract_id: string;
};

const env = import.meta.env;
export const network = env.VITE_NEAR_NETWORK || 'testnet';
export const contractId = env.VITE_CONTRACT_ID || 'steadfast-jay.testnet';
export const nodeUrl = env.VITE_NEAR_NODE_URL || 'https://rpc.testnet.near.org';
export const config = network === 'sandbox'
  ? { networkId: 'local', nodeUrl, walletUrl: 'http://127.0.0.1:3030', helperUrl: 'http://127.0.0.1:3030', explorerUrl: '', indexerUrl: '' }
  : { networkId: 'testnet', nodeUrl: 'https://rpc.testnet.near.org', walletUrl: 'https://testnet.mynearwallet.com', helperUrl: 'https://helper.testnet.near.org', explorerUrl: 'https://testnet.nearblocks.io', indexerUrl: 'https://testnet-api.kitwallet.app' };
let selectorPromise: ReturnType<typeof setupWalletSelector> | undefined;
let modalInstance: ReturnType<typeof setupModal> | undefined;
export let activeAccount = '';

export async function walletSelector() {
  if (!selectorPromise) selectorPromise = setupWalletSelector({ network: config as never, modules: [setupNearWallet()] as never });
  return selectorPromise;
}
export async function openWalletModal() {
  const selector = await walletSelector();
  if (!modalInstance) modalInstance = setupModal(selector, { contractId: contractId || undefined, description: 'Connect to trade and create on the anti-rug curve.', theme: 'dark' });
  modalInstance.show();
  return new Promise<string>((resolve) => {
    const sub = selector.store.observable.subscribe((state: { accounts: { accountId: string }[] }) => {
      if (state.accounts.length) { activeAccount = state.accounts[0].accountId; sub.unsubscribe(); resolve(activeAccount); }
    });
  });
}
export function formatNear(yocto: string | number | bigint, digits = 3) {
  const n = Number(yocto) / 1e24;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 })} NEAR`;
}
export function rawError(err: unknown) {
  if (err && typeof err === 'object' && 'message' in err) return String((err as {message: unknown}).message).replace(/\s+/g, ' ').slice(0, 600);
  return String(err).replace(/\s+/g, ' ').slice(0, 600);
}
