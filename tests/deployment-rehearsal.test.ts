import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {it,expect} from 'vitest';
import {createPublicClient,createWalletClient,http,type Hex} from 'viem';
import {Database} from '../packages/core/db.js';
import {creditTransferData} from '../packages/core/credit-transfer.js';
import {createTokenInvoice,confirmTokenInvoice,tokenBalance} from '../packages/core/tokens.js';
import {readFile} from 'node:fs/promises';
import {buildDeployment,reviewedDeployment} from '../packages/core/deployment.js';
import {verifyDeployment} from '../packages/core/deployment-verification.js';
import {contractChain,ELYSIUM_USDC} from '../packages/core/chain.js';
import {config} from '../packages/core/config.js';

it.skipIf(process.env.HYPERHIVE_TEST_ANVIL!=='1')('verifies seven fresh deployments and rejects a substituted receipt and altered runtime',async()=>{
 const node=spawn('anvil',['--host','127.0.0.1','--port','0','--chain-id',String(contractChain.id),'--hardfork','cancun'],{stdio:['ignore','pipe','ignore']});
 const previous=config.ELYSIUM_RPC;
 try{
  const url=await new Promise<string>((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Local Anvil listener timed out')),10000);
   const fail=()=>{clearTimeout(timer);reject(Error('Local Anvil failed to start'));};
   node.once('error',fail);node.once('exit',fail);
   let output='';
   node.stdout.on('data',chunk=>{
    output=(output+chunk.toString()).slice(-4096);
    const match=output.match(/Listening on 127\.0\.0\.1:(\d+)/);
    if(match){clearTimeout(timer);resolve('http://127.0.0.1:'+match[1]);}
   });
  });
  config.ELYSIUM_RPC=url;
  const rpc=createPublicClient({chain:contractChain,transport:http(url),pollingInterval:50});
  const wallet=createWalletClient({chain:contractChain,transport:http(url)});
  const [deployer,guardian,treasury,workers]=await wallet.getAddresses();
  const input={deployer,governanceProposer:deployer,guardian,treasury,workers,tokenRecipient:treasury,usdc:ELYSIUM_USDC,hhivSupply:'1000000',minimumAuditorStake:'1000'};
  const plan=await buildDeployment(input,0),receipts:{tx:Hex}[]=[];
  for(const step of plan.transactions){
   const tx=await wallet.sendTransaction({account:deployer,data:step.data,nonce:step.nonce,gas:15000000n});
   expect((await rpc.waitForTransactionReceipt({hash:tx})).status).toBe('success');receipts.push({tx});
  }
  const saved={...plan,receipts};
  expect(await verifyDeployment(saved)).toMatchObject({deploymentVerified:true,launchReady:false,auditorWired:false,contracts:expect.arrayContaining(plan.transactions.map(t=>expect.objectContaining({name:t.name})))});
  await expect(verifyDeployment({...saved,receipts:[receipts[1],...receipts.slice(1)]})).rejects.toThrow('transaction does not match');
  const core=await reviewedDeployment({phase:'core',deployer,governanceProposer:deployer,guardian,usdc:ELYSIUM_USDC},7);
  expect(core.transactions.map(step=>step.name)).toEqual(['Governance','MeasurementRegistry','SlipRoot']);
  const coreReceipts=[];
  for(const step of core.transactions){
   const tx=await wallet.sendTransaction({account:deployer,data:step.data,nonce:step.nonce,gas:15000000n});
   await rpc.waitForTransactionReceipt({hash:tx});coreReceipts.push({tx});
  }
  expect(await verifyDeployment({...core,receipts:coreReceipts})).toMatchObject({phase:'core',deploymentVerified:true,auditorWired:false});
  // Install a real ERC-20 runtime and balances on this isolated node only.
  const hhiv=JSON.parse(await readFile('contracts/out/HHIV.json','utf8'));
  const sourceCode=await rpc.getCode({address:plan.addresses.HHIV});
  const devCall=async(method:string,params:unknown[])=>{
   const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
   expect((await response.json()).error).toBeUndefined();
  };
  await devCall('anvil_setCode',[ELYSIUM_USDC,sourceCode]);
  const {keccak256,encodeAbiParameters,toHex}=await import('viem');
  const slot=keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'}],[treasury,0n]));
  await devCall('anvil_setStorageAt',[ELYSIUM_USDC,slot,toHex(10000000n,{size:32})]);
  expect(await rpc.readContract({address:ELYSIUM_USDC,abi:hhiv.abi,functionName:'balanceOf',args:[treasury]})).toBe(10000000n);
  const db=await new Database('memory').init();
  try{
   const owner=treasury.toLowerCase(),nonce=await rpc.getTransactionCount({address:treasury});
   const invoice=await createTokenInvoice(db,owner,5,workers.toLowerCase(),Date.now(),nonce);
   const tx=await wallet.sendTransaction({account:treasury,to:ELYSIUM_USDC,data:creditTransferData(invoice),nonce,gas:100000n});
   await rpc.waitForTransactionReceipt({hash:tx});
   await devCall('anvil_mine',['0x80']);
   const paid=await confirmTokenInvoice(db,owner,invoice.id,tx);
   expect(paid.status).toBe('PAID');
   await confirmTokenInvoice(db,owner,invoice.id,tx);
   expect((await tokenBalance(db,owner)).available).toBe(5000);
   const next=await createTokenInvoice(db,owner,5,workers.toLowerCase(),Date.now(),nonce+1);
   await expect(confirmTokenInvoice(db,owner,next.id,tx)).rejects.toThrow('does not match');
  }finally{await db.close();}
  const changed=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'anvil_setCode',params:[plan.addresses.BuyBurn,'0x00']})});
  expect((await changed.json()).error).toBeUndefined();
  await expect(verifyDeployment(saved)).rejects.toThrow('BuyBurn deployed code differs');
 }finally{
  config.ELYSIUM_RPC=previous;
  if(node.pid&&node.exitCode===null&&node.signalCode===null){const exited=once(node,'exit');node.kill();await exited;}
 }
},30000);
