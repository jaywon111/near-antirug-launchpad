import { Account, KeyPair, keyStores, Near, providers } from 'near-api-js';
import fs from 'node:fs';
import path from 'node:path';

const root='/w/hosts/2/u/6ada478de56518fe37365d4c/workspace';
const rpcUrl='https://rpc.testnet.near.org';
const near=new Near({networkId:'testnet',nodeUrl:rpcUrl,walletUrl:'https://testnet.mynearwallet.com',helperUrl:'https://helper.testnet.near.org',keyStore:new keyStores.InMemoryKeyStore()});
const provider=new providers.JsonRpcProvider({url:rpcUrl});
async function run(project,id,wasmPath,initArgs,actions){
 const keyfile=path.join(root,project,'.near-local','testnet-credentials',`${id}.json`);
 const creds=JSON.parse(fs.readFileSync(keyfile,'utf8'));
 const keyPair=KeyPair.fromString(creds.private_key);
 await near.connection.signer.keyStore.setKey('testnet',id,keyPair);
 const account=new Account(near.connection,id,keyPair);
 const code=fs.readFileSync(wasmPath);
 const current=await provider.query({request_type:'view_account',finality:'final',account_id:id});
 const result={account:id,wasm_bytes:code.length,transactions:[]};
 if(current.code_hash==='11111111111111111111111111111111') { const deployed=await account.deployContract(code); result.transactions.push({stage:'deploy',hash:deployed.transaction.hash,status:deployed.status}); }
 else result.transactions.push({stage:'deploy',status:'already deployed'});
 let initialized; try { initialized=await account.functionCall({contractId:id,methodName:'new',args:initArgs,gas:30000000000000n,attachedDeposit:0n}); result.transactions.push({stage:'init',hash:initialized.transaction.hash,status:initialized.status}); } catch(e) { if(String(e).includes('already been initialized')) result.transactions.push({stage:'init',status:'already initialized'}); else throw e; }
 for (const action of actions) {
  const tx=await account.functionCall({contractId:id,methodName:action.method,args:action.args,gas:30000000000000n,attachedDeposit:BigInt(action.deposit||0)});
  result.transactions.push({stage:action.stage,hash:tx.transaction.hash,status:tx.status});
  if (action.view) result[`${action.stage}_view`]=await provider.query({request_type:'call_function',finality:'final',account_id:id,method_name:action.view.method,args_base64:Buffer.from(JSON.stringify(action.view.args)).toString('base64')});
 }
 console.log(JSON.stringify(result));
}
const task=process.argv[2];
if(task==='launchpad') await run('near-antirug-launchpad','steadfast-jay.testnet',path.join(root,'near-antirug-launchpad/contract/target/wasm32-unknown-unknown/release/near_antirug_launchpad_contract.wasm'),{},[
 {stage:'create_token',method:'create_token',args:{name:'Smoke Coin',symbol:'TCOIN',supply:'1000000',initial_reserve:'1000000000000000000000000',base_price:'1000000000000000000000',slope:'10000000000000000000000',dev_vesting_bps:2000,vesting_cliff_ns:0,vesting_duration_ns:1000000000},deposit:'10000000000000000000000'},
 {stage:'buy',method:'buy',args:{token_id:'launch-2',amount:'10',min_out:'10'},deposit:'200000000000000000000000',view:{method:'get_balance',args:{token_id:'launch-2',account_id:'steadfast-jay.testnet'}}}
]);
else if(task==='hearthold') await run('near-property-escrow','hearthold-jay.testnet',path.join(root,'near-property-escrow/contract/target/wasm32-unknown-unknown/release/hearthold_contract.wasm'),{allowed_token:'wrap.testnet',arbitrator:'hearthold-jay.testnet'},[
 {stage:'list_property',method:'list_property',args:{token:'wrap.testnet',rent_ngn:'1000000',description:'NEAR testnet smoke test property',move_in_at:1793300000000000000,dispute_window_ns:86400000000000},view:{method:'get_agreement',args:{id:1}}},
]);
else throw Error('task must be launchpad or hearthold');
