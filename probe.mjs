import fs from 'fs';
import { DEFAULT_ACCOUNT_ID, DEFAULT_PRIVATE_KEY } from 'near-sandbox';
import * as nearAPI from 'near-api-js';
const rpc='http://127.0.0.1:43235';
const keyStore=new nearAPI.keyStores.InMemoryKeyStore();
await keyStore.setKey('sandbox',DEFAULT_ACCOUNT_ID,nearAPI.utils.KeyPair.fromString(DEFAULT_PRIVATE_KEY));
const near=await nearAPI.connect({networkId:'sandbox',nodeUrl:rpc,keyStore});
const owner=await near.account(DEFAULT_ACCOUNT_ID);
const wasm=fs.readFileSync('contract/target/wasm32-unknown-unknown/release/near_antirug_launchpad_contract.wasm');
const cid='probe3.sandbox';
const kp=nearAPI.utils.KeyPair.fromRandom('ed25519');
await owner.createAndDeployContract(cid,kp.publicKey,wasm,nearAPI.utils.format.parseNearAmount('20'));
const c=await near.account(cid); await keyStore.setKey('sandbox',cid,kp);
const contract=new nearAPI.Contract(c,cid,{viewMethods:['get_launch','get_balance'],changeMethods:['create_token']});
// view call on missing launch should panic with message
try { await contract.get_launch({token_id:'nope'}); console.log('no panic?!'); }
catch(e){ console.log('view panic msg:', (e.message||'').split('\n')[0].slice(0,200)); }
// minimal create with tiny values
try{
  await contract.create_token({name:'AB',symbol:'AB',supply:'1000',initial_reserve:'1',base_price:'1',slope:'1',dev_vesting_bps:1,vesting_cliff_ns:1,vesting_duration_ns:2},undefined,nearAPI.utils.format.parseNearAmount('0.1'));
  console.log('minimal create ok');
}catch(e){ console.log('create panic:',(e.message||'').split('\n')[0].slice(0,300)); }
process.exit(0);
