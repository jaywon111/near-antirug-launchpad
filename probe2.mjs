import fs from 'fs';
import { DEFAULT_ACCOUNT_ID, DEFAULT_PRIVATE_KEY } from 'near-sandbox';
import * as nearAPI from 'near-api-js';
const rpc='http://127.0.0.1:43235';
const keyStore=new nearAPI.keyStores.InMemoryKeyStore();
await keyStore.setKey('sandbox',DEFAULT_ACCOUNT_ID,nearAPI.utils.KeyPair.fromString(DEFAULT_PRIVATE_KEY));
const near=await nearAPI.connect({networkId:'sandbox',nodeUrl:rpc,keyStore});
const owner=await near.account(DEFAULT_ACCOUNT_ID);
const wasm=fs.readFileSync('/tmp/hello-near/target/wasm32-unknown-unknown/release/hello_near.wasm');
const cid='hello6.sandbox';
const kp=nearAPI.utils.KeyPair.fromRandom('ed25519');
await owner.createAndDeployContract(cid,kp.publicKey,wasm,nearAPI.utils.format.parseNearAmount('10'));
const c=await near.account(cid); await keyStore.setKey('sandbox',cid,kp);
// call hello
const provider=new nearAPI.providers.JsonRpcProvider(rpc);
// use functionCall via account
const res=await c.functionCall({contractId:cid,methodName:'hello',args:{}});
console.log('hello result:', JSON.stringify(res.receipts_outcome?.[0]?.outcome?.status||res.status).slice(0,150));
try { await c.functionCall({contractId:cid,methodName:'boom',args:{}}); } catch(e){ console.log('boom:',(e.message||'').split('\n')[0].slice(0,150)); }
process.exit(0);
