import {CONTRACT_CHAIN_ID} from './chain.js';
import {createPublicClient,http,parseAbi,type Hex} from 'viem';
import type {Sql} from './db.js';
import {integrationSettings} from './integration-settings.js';
import {supplementalExpiry} from './entitlements.js';
import {localMode} from './local-mode.js';
import {config} from './config.js';
import {subscriptionKey,type Crew,type Policy} from './domain.js';
export const billingAbi=parseAbi(['function expiresAt(bytes32) view returns(uint256)','function planOf(bytes32) view returns(uint8)']);
const cached=new Map<string,{at:number;expires:number;plan:number}>();
/** Read the legacy on-chain subscription expiry in milliseconds for the signed plan. */
export async function subscriptionExpiry(policy:Policy){
  const contract=(await integrationSettings()).billing;if(!contract)return 0;
  const key=subscriptionKey(policy),cacheKey=contract+key,prior=cached.get(cacheKey);
  if(prior&&Date.now()-prior.at<60000)return prior.plan===(policy.plan==='pro'?2:1)?prior.expires:0;
  const client=createPublicClient({transport:http(config.ELYSIUM_RPC)});if(await client.getChainId()!==CONTRACT_CHAIN_ID)throw Error('Subscription RPC is not Elysium mainnet');
  const [expires,plan]=await Promise.all([client.readContract({address:contract as Hex,abi:billingAbi,functionName:'expiresAt',args:[key]}),client.readContract({address:contract as Hex,abi:billingAbi,functionName:'planOf',args:[key]})]);
  cached.set(cacheKey,{at:Date.now(),expires:Number(expires)*1000,plan});
  return plan===(policy.plan==='pro'?2:1)?Number(expires)*1000:0;
}
/** Resolve supplemental entitlements before querying the legacy on-chain subscription. */
export async function effectiveExpiry(crew:Crew,db?:Sql){const extra=db?await supplementalExpiry(db,crew):0;if(extra>Date.now())return extra;return subscriptionExpiry(crew.policy);}
/** Check whether local operation or an unexpired entitlement permits subscription access. */
export async function hasSubscription(crew:Crew,db?:Sql){if(localMode())return true;return await effectiveExpiry(crew,db)>Date.now();}
