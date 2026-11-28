import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {creditPaymentNonce} from '../../packages/core/elysium-checkout.js';
import type {Hex} from 'viem';
import type {Database} from '../../packages/core/db.js';
import {integrationSettings,saveIntegrationSettings} from '../../packages/core/integration-settings.js';
import {tokenPricing,tokenBalance,aiTestingExempt,meteringReady,createTokenInvoice,confirmTokenInvoice,receiverReady} from '../../packages/core/tokens.js';
import {claimHiveDrop,hiveDropConfig,hiveDropStatus} from '../../packages/core/hive-drops.js';
/** Install private usage, purchase and confirmation routes and operator-only metering settings. */
export function registerTokens(app:FastifyInstance,db:Database,owner:(r:FastifyRequest)=>Promise<string>,local:(r:FastifyRequest)=>void){
 const dropLimit=app.createRateLimit({max:10,timeWindow:'1 minute'});
 /** Return public checkout readiness, purchase limits and the AI markup. */
 app.get('/api/tokens/pricing',async()=>({...await tokenPricing(),meteringReady:await meteringReady(db),hive:await hiveDropConfig()}));
 async function account(who:string){return {...await tokenBalance(db,who),hive:await hiveDropStatus(db,who),hiveDrops:(await db.query("SELECT week,units,created_at,'$HIVE holder drop' AS label FROM hive_drop_claims WHERE owner=$1 ORDER BY created_at DESC LIMIT 100",[who])).rows,testingExempt:await aiTestingExempt(db,who),invoices:(await db.query('SELECT * FROM token_invoices WHERE owner=$1 ORDER BY created_at DESC LIMIT 100',[who])).rows,usage:(await db.query('SELECT id,crew_id,model,reserved,charged,status,billing_exempt,cost_basis,created_at,finished_at FROM token_usage WHERE owner=$1 ORDER BY created_at DESC LIMIT 100',[who])).rows};}
 /** Read the owner's private credit balance, invoices and usage history. */
 app.get('/api/tokens',async req=>{
  const who=await owner(req);
  return account(who);
 });
 /** Credit one weekly holder drop to the authenticated wallet only. */
 app.post('/api/tokens/hive-drop',async(req,reply)=>{
  const who=await owner(req);z.strictObject({}).parse(req.body??{});
  const limit=await dropLimit(req);if(!limit.isAllowed&&limit.isExceeded){reply.header('Retry-After',limit.ttlInSeconds);throw Object.assign(Error('Too many claim attempts. Try again in a minute.'),{statusCode:429});}
  await claimHiveDrop(db,who);return account(who);
 });
 /** Create a credit purchase invoice for the signed-in owner and configured receiver. */
 app.post('/api/tokens/invoices',async req=>{
  const who=await owner(req),{amount,network}=z.strictObject({amount:z.number().int().min(5).max(500),network:z.enum(['hypercore','elysium']).default('hypercore')}).parse(req.body),s=await integrationSettings();
  if(network==='elysium'){
   if(!s.elysiumCreditPayTo)throw Error('Elysium checkout is awaiting a receiving wallet');
   return createTokenInvoice(db,who,amount,s.elysiumCreditPayTo,Date.now(),await creditPaymentNonce(who as Hex));
  }
  if(!s.tokenPayTo)throw Error('Token checkout is awaiting a receiving wallet from the operator');
  if(!await receiverReady(s.tokenPayTo))throw Error('The receiving wallet must be active on Hyperliquid before checkout opens');
  return createTokenInvoice(db,who,amount,s.tokenPayTo);
 });
 /** Reconcile an owned purchase against sender and recipient venue ledgers. */
 app.post<{Params:{id:string}}>('/api/tokens/invoices/:id/confirm',async req=>{
  const who=await owner(req),id=z.string().uuid().parse(req.params.id),{tx}=z.strictObject({tx:z.string().regex(/^0x[\da-fA-F]{64}$/).optional()}).parse(req.body);
  return confirmTokenInvoice(db,who,id,tx);
 });
 /** Read checkout configuration and unresolved metering alerts in local setup. */
 app.get('/api/setup/tokens',async req=>{local(req);return {pricing:await tokenPricing(),alerts:(await db.query('SELECT * FROM ai_metering_alerts WHERE resolved_at IS NULL ORDER BY created_at')).rows};});
 /** Validate the receiving wallet and markup and persist the operator's checkout settings. */
 app.post('/api/setup/tokens',async req=>{
  local(req);const {payTo,markupBps,network}=z.strictObject({network:z.enum(['hypercore','elysium']).default('hypercore'),payTo:z.string().regex(/^0x[\da-fA-F]{40}$/),markupBps:z.number().int().min(0).max(10000)}).parse(req.body);
  await saveIntegrationSettings({...await integrationSettings(),...(network==='elysium'?{elysiumCreditPayTo:payTo}:{tokenPayTo:payTo}),aiMarkupBps:markupBps});return tokenPricing();
 });
 /** Acknowledge reviewed metering alerts from local operator setup. */
 app.post('/api/setup/tokens/metering',async req=>{local(req);const {reviewed}=z.strictObject({reviewed:z.literal(true)}).parse(req.body);if(reviewed)await db.query('UPDATE ai_metering_alerts SET resolved_at=$1 WHERE resolved_at IS NULL',[Date.now()]);return {ok:true};});
}
