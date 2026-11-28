import {CONTRACT_CHAIN_ID} from './chain.js';
import {createPublicClient,http,parseUnits,formatUnits,type Hex} from 'viem';
import {config} from './config.js';
import {integrationSettings} from './integration-settings.js';
import {tokenAbi} from './contract-abis.js';
import {type Sql} from './db.js';
import {type Crew,subscriptionKey} from './domain.js';
const cache=new Map<string,{at:number;value:Awaited<ReturnType<typeof readBenefit>>}>();
async function readBenefit(owner:string){
 const s=await integrationSettings();if(!s.token||!s.tokenThreshold)return {configured:false,eligible:false,token:s.token??null,threshold:s.tokenThreshold??'100000',balance:null,decimals:18,symbol:'HIVE'};
 const rpc=createPublicClient({transport:http(config.ELYSIUM_RPC)});if(await rpc.getChainId()!==CONTRACT_CHAIN_ID)throw Error('Token benefits require Elysium mainnet');
 const [decimals,balance,symbol]=await Promise.all([rpc.readContract({address:s.token as Hex,abi:tokenAbi,functionName:'decimals'}),rpc.readContract({address:s.token as Hex,abi:tokenAbi,functionName:'balanceOf',args:[owner as Hex]}),rpc.readContract({address:s.token as Hex,abi:tokenAbi,functionName:'symbol'})]);
 return {configured:true,eligible:balance>=parseUnits(s.tokenThreshold,decimals),token:s.token,threshold:s.tokenThreshold,balance:formatUnits(balance,decimals),decimals,symbol};
}
/** Read and cache whether the owner meets the configured on-chain HIVE threshold. */
export async function tokenBenefit(owner:string,refresh=false){const settings=await integrationSettings(),key=[settings.token,settings.tokenThreshold,owner].join(':');const prior=cache.get(key);if(!refresh&&prior&&Date.now()-prior.at<30000)return prior.value;const value=await readBenefit(owner);cache.set(key,{at:Date.now(),value});if(cache.size>200)cache.delete(cache.keys().next().value!);return value;}
/** Return the builder fee in tenths of a basis point with the default rate on lookup failure. */
export async function builderFeeFor(owner:string){try{return (await tokenBenefit(owner)).eligible?20:30;}catch{return 30;}}
/** Look up the crew selected to receive the owner's token-holder benefit. */
export async function benefitCrew(db:Sql,owner:string){return (await db.query<{crew_id:string}>('SELECT crew_id FROM benefit_assignments WHERE owner=$1',[owner])).rows[0]?.crew_id??null;}
/** Resolve stored payment and token-holder entitlements for the selected crew. */
export async function supplementalExpiry(db:Sql,crew:Crew){
 const paid=(await db.query<{expires_at:number}>('SELECT expires_at FROM paid_entitlements WHERE key=$1 AND owner=$2 AND plan=$3',[subscriptionKey(crew.policy),crew.owner,crew.policy.plan])).rows[0];
 if(Number(paid?.expires_at??0)>Date.now())return Number(paid!.expires_at);
 if(crew.policy.plan==='crew'&&await benefitCrew(db,crew.owner)===crew.id&&(await tokenBenefit(crew.owner)).eligible)return Math.max(paid?.expires_at??0,Date.now()+60000);
 return Number(paid?.expires_at??0);
}
