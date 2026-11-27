import {readFile} from 'node:fs/promises';
import {createPublicClient,http,keccak256,stringToHex,parseUnits,type Hex} from 'viem';
import {CONTRACT_CHAIN_ID} from './chain.js';
import {config} from './config.js';
import {reviewedDeployment} from './deployment.js';

/** Immutable bytes are constructor values, checked separately by public getters below. */
export function runtimeMatches(actual:Hex,artifact:{evm:{deployedBytecode:{object:string;immutableReferences?:Record<string,{start:number;length:number}[]>}}}){
 const expected=artifact.evm.deployedBytecode.object.toLowerCase(),received=actual.slice(2).toLowerCase();
 if(!expected||received.length!==expected.length)return false;
 const a=received.split(''),b=expected.split('');
 for(const entries of Object.values(artifact.evm.deployedBytecode.immutableReferences??{}))for(const {start,length} of entries){
  if(start<0||length<=0||(start+length)*2>a.length)throw Error('Invalid compiler immutable references');
  a.fill('0',start*2,(start+length)*2);b.fill('0',start*2,(start+length)*2);
 }
 return a.join('')===b.join('');
}
/** Rebuild the deployment plan and check receipts, runtime code, roles and constructor links. */
export async function verifyDeployment(saved:any){
 if(saved?.chainId!==CONTRACT_CHAIN_ID)throw Error('Deployment is not for Elysium');
 const plan=await reviewedDeployment(saved.input,saved.transactions?.[0]?.nonce);
 const rpc=createPublicClient({transport:http(config.ELYSIUM_RPC)});
 if(await rpc.getChainId()!==CONTRACT_CHAIN_ID)throw Error('RPC is not Elysium mainnet');
 const artifacts=new Map<string,any>();
 const confirmed: {name:typeof plan.transactions[number]['name'];address:Hex;transaction:Hex;blockNumber:string;runtimeHash:Hex}[]=[];
 for(const [index,step] of plan.transactions.entries()){
  const tx=saved.receipts?.[index]?.tx;if(!/^0x[\da-fA-F]{64}$/.test(tx??''))throw Error(`Missing ${step.name} transaction receipt`);
  const [receipt,transaction,code]=await Promise.all([rpc.getTransactionReceipt({hash:tx}),rpc.getTransaction({hash:tx}),rpc.getCode({address:step.expectedAddress})]);
  if(receipt.status!=='success'||receipt.contractAddress?.toLowerCase()!==step.expectedAddress.toLowerCase()||transaction.to!==null||transaction.chainId!==CONTRACT_CHAIN_ID||transaction.from.toLowerCase()!==step.from||transaction.nonce!==step.nonce||transaction.input.toLowerCase()!==step.data.toLowerCase()||transaction.value!==0n)throw Error(`${step.name} deployment transaction does not match the reviewed plan`);
  const artifact=JSON.parse(await readFile(new URL('../../contracts/out/'+step.name+'.json',import.meta.url),'utf8'));artifacts.set(step.name,artifact);
  if(!code||!runtimeMatches(code,artifact))throw Error(`${step.name} deployed code differs from the local build`);
  confirmed.push({name:step.name,address:step.expectedAddress,transaction:tx,blockNumber:String(receipt.blockNumber),runtimeHash:keccak256(code)});
 }
 const a=plan.addresses,i=plan.input;
 const deployed=new Map(confirmed.map(c=>[c.name,c.address]));
 const read=async(name:typeof confirmed[number]['name'],fn:string,args:unknown[]=[])=>rpc.readContract({address:deployed.get(name)!,abi:artifacts.get(name).abi,functionName:fn,args}) as Promise<any>;
 const equal=(value:unknown,expected:unknown,label:string)=>{if(String(value).toLowerCase()!==String(expected).toLowerCase())throw Error(label+' differs from the reviewed plan');};
 for(const name of ['MeasurementRegistry','SlipRoot'] as const)equal(await read(name,'owner'),a.Governance,name+' owner');
 equal(await read('Governance','getMinDelay'),172800n,'Governance delay');
 for(const [role,account] of [['PROPOSER_ROLE',i.governanceProposer],['CANCELLER_ROLE',i.governanceProposer],['EXECUTOR_ROLE','0x'+'0'.repeat(40)],['DEFAULT_ADMIN_ROLE',a.Governance]]){
  const roleId=role==='DEFAULT_ADMIN_ROLE'?('0x'+'0'.repeat(64)):keccak256(stringToHex(role));
  equal(await read('Governance','hasRole',[roleId,account]),true,role);
 }
 equal(await read('MeasurementRegistry','guardian'),i.guardian,'Guardian');
 equal(await read('SlipRoot','registry'),a.MeasurementRegistry,'Root measurement registry');
 if ('phase' in i || !('HHIV' in a)) {
  return {phase:'core',chainId:CONTRACT_CHAIN_ID,checkedAt:new Date().toISOString(),contracts:confirmed,
   auditorWired:false,deploymentVerified:true,launchReady:false};
 }
 equal(await read('BuyBurn','owner'),a.Governance,'BuyBurn owner');
 equal(await read('HHIV','totalSupply'),parseUnits(i.hhivSupply,18),'HHIV supply');
 for(const [fn,value] of [['token',a.HHIV],['roots',a.SlipRoot],['rewardToken',i.usdc],['minimum',parseUnits(i.minimumAuditorStake,18)]])equal(await read('AuditorStake',String(fn)),value,'Auditor '+fn);
 for(const [fn,value] of [['token',i.usdc],['workers',i.workers],['treasury',i.treasury],['auditors',a.AuditorStake],['burnVault',a.BuyBurn]])equal(await read('FeeSplitter',fn),value,'Fee splitter '+fn);
 equal(await read('BuyBurn','usdc'),i.usdc,'Buy/burn USDC');equal(await read('BuyBurn','hhiv'),a.HHIV,'Buy/burn HHIV');
 const auditor=await read('SlipRoot','auditor');
 if(auditor!=='0x'+'0'.repeat(40))equal(auditor,a.AuditorStake,'Root auditor');
 return {chainId:CONTRACT_CHAIN_ID,checkedAt:new Date().toISOString(),contracts:confirmed,auditorWired:auditor.toLowerCase()===a.AuditorStake.toLowerCase(),deploymentVerified:true,launchReady:false};
}
