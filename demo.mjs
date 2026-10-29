import fs from 'fs';
import { DEFAULT_ACCOUNT_ID, DEFAULT_PRIVATE_KEY } from 'near-sandbox';
import * as nearAPI from 'near-api-js';

const rpc = 'http://127.0.0.1:43235';
console.log('sandbox rpc', rpc);
const keyStore = new nearAPI.keyStores.InMemoryKeyStore();
const keyPair = nearAPI.utils.KeyPair.fromString(DEFAULT_PRIVATE_KEY);
await keyStore.setKey('sandbox', DEFAULT_ACCOUNT_ID, keyPair);
const near = await nearAPI.connect({ networkId: 'sandbox', nodeUrl: rpc, keyStore, walletUrl:'', helperUrl:'' });
const owner = await near.account(DEFAULT_ACCOUNT_ID);
const wasm = fs.readFileSync('contract/target/wasm32-unknown-unknown/release/near_antirug_launchpad_contract.wasm');

// create contract account
const cid = 'launchpad'+Date.now()+'.sandbox';
const kp = nearAPI.utils.KeyPair.fromRandom('ed25519');
await owner.createAndDeployContract(cid, kp.publicKey, wasm, nearAPI.utils.format.parseNearAmount('20'));
const c = owner;
const contract = new nearAPI.Contract(c, cid, { changeMethods: ['new','create_token','buy','sell','rug_attempt'], viewMethods: ['get_launch','get_balance'] });

const supply = '1000000'; // fixed cap; mock token unit count
const deposit = nearAPI.utils.format.parseNearAmount('0.005');
console.log('init...');await contract.new();console.log('creating token...');
await contract.create_token({ name:'JAY Coin', symbol:'JAYC', supply, initial_reserve:'10000000000000000', base_price:'1000', slope:'10000', dev_vesting_bps:2000, vesting_cliff_ns:100, vesting_duration_ns:1000 }, undefined, deposit);
const l = await contract.get_launch({ token_id: 'launch-1' });
console.log('token up:', l.name, 'mint_renounced:', l.mint_renounced, 'liquidity_locked:', l.liquidity_locked);

console.log('buying on curve...');
await contract.buy({ token_id:'launch-1', amount: '100', min_out: '100' }, undefined, nearAPI.utils.format.parseNearAmount('0.1'));
console.log('balance after buy:', JSON.stringify(await contract.get_balance({ token_id:'launch-1', account_id: DEFAULT_ACCOUNT_ID })));

console.log('attempting rug...');
try {
  await contract.rug_attempt({ token_id:'launch-1', amount: '1' });
  console.log('RUG SUCCEEDED (bad!)');
} catch (e) {
  console.log('RUG BLOCKED:', (e.message||'').split('\n')[0].slice(0,120));
}
process.exit(0);
