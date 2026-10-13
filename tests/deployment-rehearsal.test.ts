import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {it,expect} from 'vitest';
import {createPublicClient,createWalletClient,http,type Hex} from 'viem';
import {buildDeployment} from '../packages/core/deployment.js';
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
  const changed=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'anvil_setCode',params:[plan.addresses.BuyBurn,'0x00']})});
  expect((await changed.json()).error).toBeUndefined();
  await expect(verifyDeployment(saved)).rejects.toThrow('BuyBurn deployed code differs');
 }finally{
  config.ELYSIUM_RPC=previous;
  if(node.pid&&node.exitCode===null&&node.signalCode===null){const exited=once(node,'exit');node.kill();await exited;}
 }
},30000);
