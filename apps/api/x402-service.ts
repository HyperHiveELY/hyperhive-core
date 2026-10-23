import {x402ResourceServer,HTTPFacilitatorClient} from '@x402/core/server';
import {ExactEvmScheme} from '@x402/evm/exact/server';
import type {PaymentPayload,PaymentRequirements} from '@x402/core/types';
import {integrationSettings,facilitatorToken} from '../../packages/core/integration-settings.js';
import {BASE_USDC} from '../../packages/core/contract-abis.js';
import {hash} from '../../packages/core/domain.js';
let cached:{key:string;server:Promise<x402ResourceServer>}|undefined;
/** Initialize and cache the x402 facilitator client for the current URL and authentication settings. */
export async function paymentServer(){
 const settings=await integrationSettings(),token=await facilitatorToken();if(!settings.x402PayTo||!settings.x402Facilitator)throw Object.assign(Error('Configure the x402 recipient and facilitator in Connections'),{statusCode:503});
 const key=hash({url:settings.x402Facilitator,token:token??''});
 if(cached?.key!==key){const server=new x402ResourceServer(new HTTPFacilitatorClient({url:settings.x402Facilitator,...(token?{createAuthHeaders:async()=>({verify:{Authorization:'Bearer '+token},settle:{Authorization:'Bearer '+token},supported:{Authorization:'Bearer '+token}})}:{})})).register('eip155:8453',new ExactEvmScheme());const ready=server.initialize().then(()=>server);cached={key,server:ready};ready.catch(()=>{if(cached?.key===key)cached=undefined;});}
 return {server:await cached!.server,settings};
}
/** Build an exact USDC payment requirement for the specified Base recipient and amount. */
export async function requirementsFor(amount:string,payTo:string){const {server}=await paymentServer();const requirements=await server.buildPaymentRequirements({scheme:'exact',network:'eip155:8453',payTo,price:{amount,asset:BASE_USDC,extra:{name:'USD Coin',version:'2'}},maxTimeoutSeconds:120});return requirements[0];}
/** Reject a signed payload that changes the accepted chain, asset or payment requirements. */
export function validatePayment(payload:PaymentPayload,expected:PaymentRequirements){if(payload.x402Version!==2||hash(payload.accepted)!==hash(expected)||expected.asset.toLowerCase()!==BASE_USDC.toLowerCase()||expected.network!=='eip155:8453')throw Error('Payment requirements changed');}
