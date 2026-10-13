import {CONTRACT_CHAIN_ID,ELYSIUM_USDC} from './chain.js';
import {readFile} from 'node:fs/promises';
import {createPublicClient,http,parseUnits,encodeDeployData,encodeFunctionData,getContractAddress,toHex,type Hex} from 'viem';
import {z} from 'zod';
import {Address,hash} from './domain.js';
import {config} from './config.js';
import {tokenAbi,rootsAbi} from './contract-abis.js';
const nonzero=Address.refine(s=>!/^0x0{40}$/.test(s),'Use a nonzero address');
const Amount=z.string().regex(/^\d+(\.\d{1,18})?$/).refine(s=>parseUnits(s,18)>0n);
export const DeploymentInput=z.strictObject({deployer:nonzero,governanceProposer:nonzero,guardian:nonzero,treasury:nonzero,workers:nonzero,tokenRecipient:nonzero,usdc:nonzero.refine(v=>v===ELYSIUM_USDC,'Use canonical USDC on Elysium'),hhivSupply:Amount,minimumAuditorStake:Amount}).refine(i=>parseUnits(i.minimumAuditorStake,18)*2n<=parseUnits(i.hhivSupply,18),'Supply must cover at least two minimum auditor bonds');
export const deploymentNames=['Governance','HHIV','MeasurementRegistry','SlipRoot','AuditorStake','BuyBurn','FeeSplitter'] as const;
/** Encode seven reviewed deployments and the delayed auditor wiring from a starting nonce. */
export async function buildDeployment(input:unknown,nonce:number){
 if(!Number.isSafeInteger(nonce)||nonce<0)throw Error('Invalid deployment nonce');
 const values=DeploymentInput.parse(input),names=deploymentNames;
 const addresses=Object.fromEntries(names.map((name,i)=>[name,getContractAddress({from:values.deployer,nonce:BigInt(nonce+i)})])) as Record<typeof names[number],Hex>;
 const args:Record<typeof names[number],unknown[]>={Governance:[[values.governanceProposer],['0x0000000000000000000000000000000000000000']],HHIV:[values.tokenRecipient,parseUnits(values.hhivSupply,18)],MeasurementRegistry:[addresses.Governance,values.guardian],SlipRoot:[addresses.Governance,addresses.MeasurementRegistry],AuditorStake:[addresses.HHIV,addresses.SlipRoot,parseUnits(values.minimumAuditorStake,18),values.usdc],BuyBurn:[addresses.Governance,values.usdc,addresses.HHIV],FeeSplitter:[values.usdc,values.workers,values.treasury,addresses.AuditorStake,addresses.BuyBurn]};
 const transactions=[];
 for(const [i,name] of names.entries()){const artifact=JSON.parse(await readFile(new URL('../../contracts/out/'+name+'.json',import.meta.url),'utf8'));transactions.push({name,expectedAddress:addresses[name],from:values.deployer,chainId:CONTRACT_CHAIN_ID,nonce:nonce+i,data:encodeDeployData({abi:artifact.abi,bytecode:`0x${artifact.evm.bytecode.object}`,args:args[name]}),value:'0'});}
 const governance={target:addresses.SlipRoot,value:'0',data:encodeFunctionData({abi:rootsAbi,functionName:'setAuditor',args:[addresses.AuditorStake]}),predecessor:toHex(0,{size:32}),salt:hash({purpose:'HyperHive/setAuditor',addresses}),delay:172800};
 return {version:1,chainId:CONTRACT_CHAIN_ID,createdAt:Date.now(),input:values,addresses,transactions,governance};
}
/** Check the chain and canonical USDC, then quote a plan using the pending deployer nonce. */
export async function prepareDeployment(input:unknown){
 const values=DeploymentInput.parse(input),rpc=createPublicClient({transport:http(config.ELYSIUM_RPC)});if(await rpc.getChainId()!==CONTRACT_CHAIN_ID)throw Error('Deployment requires Elysium mainnet');
 if(!await rpc.getCode({address:values.usdc})||await rpc.readContract({address:values.usdc,abi:tokenAbi,functionName:'decimals'})!==6)throw Error('USDC must be a deployed token with 6 decimals');
 const nonce=await rpc.getTransactionCount({address:values.deployer,blockTag:'pending'}),plan=await buildDeployment(values,nonce);
 return {...plan,balance:String(await rpc.getBalance({address:values.deployer})),gasPrice:String(await rpc.getGasPrice())};
}
