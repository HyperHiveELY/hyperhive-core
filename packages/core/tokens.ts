import {randomUUID} from 'node:crypto';
import {parseUnits,type Hex} from 'viem';
import type {Database,Sql} from './db.js';
import {integrationSettings} from './integration-settings.js';
import {info} from './venue.js';
import {verifyCreditTransfer} from './elysium-checkout.js';
import {Address} from './domain.js';

// Integer accounting: 1,000 units = one Token; 1,000 Tokens = one USDC.
export const TOKEN_UNITS_PER_USDC=1_000_000;
/** Convert measured AI cost and markup to the integer units used by the credit ledger. */
export function chargeUnits(costUsd:number,markupBps:number){
 if(!Number.isFinite(costUsd)||costUsd<0||!Number.isInteger(markupBps)||markupBps<0||markupBps>10000)throw Error('Invalid AI usage price');
 const units=Math.ceil(costUsd*TOKEN_UNITS_PER_USDC*(10000+markupBps)/10000);
 if(!Number.isSafeInteger(units))throw Error('AI usage price is out of range');return units;
}
/** Read the owner's available and reserved AI credits in display units. */
export async function tokenBalance(db:Sql,owner:string){const a=(await db.query<{available:string;reserved:string}>('SELECT available,reserved FROM token_accounts WHERE owner=$1',[owner])).rows[0];return {available:Number(a?.available??0)/1000,reserved:Number(a?.reserved??0)/1000};}
// Operator-managed access, never supplied by a browser or request body.
/** Return whether the owner has an explicit metering exemption for testing. */
export async function aiTestingExempt(db:Sql,owner:string){
 return (await db.query<{enabled:boolean}>('SELECT enabled FROM ai_billing_exemptions WHERE owner=$1',[owner.toLowerCase()])).rows[0]?.enabled===true;
}
/** Check whether credits or a testing exemption permit a new inference reservation. */
export async function aiCreditAccess(db:Sql,owner:string){return await aiTestingExempt(db,owner)||(await tokenBalance(db,owner)).available>0;}
/** Persist the operator's explicit decision about an owner's testing exemption. */
export async function setAiTestingAccess(db:Database,owner:string,enabled:boolean){
 const address=Address.parse(owner);if(address==='0x'+'0'.repeat(40))throw Error('Use a real owner wallet');
 await db.transaction(async q=>{
  if(!(await q.query('SELECT id FROM crews WHERE owner=$1 LIMIT 1',[address])).rows.length)throw Error('This owner has no registered crew');
  await q.query('INSERT INTO ai_billing_exemptions(owner,enabled,updated_at) VALUES($1,$2,$3) ON CONFLICT(owner) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at',[address,enabled,Date.now()]);
  await q.query('INSERT INTO events(crew_id,kind,message,created_at) VALUES(NULL,$1,$2,$3)',['ai_testing_access',`AI testing access ${enabled?'enabled':'disabled'} for ${address}`,Date.now()]);
 });
 return {owner:address,testingExempt:await aiTestingExempt(db,address)};
}
/** Check for unresolved metering alerts that prevent new billed inference. */
export async function meteringReady(db:Sql){return !(await db.query('SELECT id FROM ai_metering_alerts WHERE resolved_at IS NULL LIMIT 1')).rows.length;}
/** Ensure the account exists and serialize balance changes within a transaction. */
export async function lockTokenAccount(db:Sql,owner:string){
 await db.query('INSERT INTO token_accounts(owner) VALUES($1) ON CONFLICT DO NOTHING',[owner]);
 return (await db.query<{available:string;reserved:string}>('SELECT available,reserved FROM token_accounts WHERE owner=$1 FOR UPDATE',[owner])).rows[0];
}
// Called in the same transaction as the per-crew daily budget reservation.
/** Reserve credits for one inference request before calling the provider. */
export async function reserveTokens(db:Sql,args:{id:string;owner:string;crewId:string;model:string;ceiling:number;markupBps:number}){
 if(!await meteringReady(db))throw Error('AI usage metering needs operator review; exits continue');
 const ceilingUnits=chargeUnits(args.ceiling,args.markupBps),exempt=await aiTestingExempt(db,args.owner),units=exempt?0:ceilingUnits,a=await lockTokenAccount(db,args.owner);
 if(Number(a.available)<units)throw Error('Not enough Tokens for the next AI scan. Add Tokens; exits continue.');
 await db.query('UPDATE token_accounts SET available=available-$2,reserved=reserved+$2 WHERE owner=$1',[args.owner,units]);
 await db.query('INSERT INTO token_usage(id,owner,crew_id,model,reserved,markup_bps,created_at,billing_exempt,cost_ceiling_usd) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[args.id,args.owner,args.crewId,args.model,units,args.markupBps,Date.now(),exempt,args.ceiling]);
}
/** Settle a reserved usage record against measured cost and release unused credits. */
export async function settleTokens(db:Database,id:string,costUsd:number|null,basis='catalog',alert?:string){
 return db.transaction(async q=>{
  const u=(await q.query<any>('SELECT * FROM token_usage WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!u)throw Error('Unknown AI reservation');
  if(u.status!=='RESERVED')return;
  await lockTokenAccount(q,u.owner);
  const requested=costUsd===null?0:chargeUnits(costUsd,u.markup_bps),charged=u.billing_exempt?0:Math.min(Number(u.reserved),requested);
  const maximum=u.cost_ceiling_usd==null?Number(u.reserved):chargeUnits(Number(u.cost_ceiling_usd),u.markup_bps);
  if(requested>maximum)alert='AI usage exceeded its reserved maximum. Review model pricing before resuming.';
  await q.query('UPDATE token_accounts SET available=available+$2,reserved=reserved-$3 WHERE owner=$1',[u.owner,Number(u.reserved)-charged,u.reserved]);
  await q.query('UPDATE token_usage SET charged=$2,status=$3,cost_usd=$4,cost_basis=$5,finished_at=$6 WHERE id=$1',[id,charged,costUsd===null?'REFUNDED':'SETTLED',costUsd,basis,Date.now()]);
  await q.query('UPDATE budgets SET actual=$2 WHERE id=$1',[id,costUsd??0]);
  if(alert)await q.query('INSERT INTO ai_metering_alerts VALUES($1,$2,$3,NULL) ON CONFLICT DO NOTHING',[id,alert,Date.now()]);
 });
}
/** Reconcile interrupted inference reservations using the recorded billing state. */
export async function recoverTokenReservations(db:Database){
 // Requests have a 45-second deadline. After ten minutes an interrupted call is refunded,
 // and further paid inference stops until the operator reviews the missing accounting.
 const rows=(await db.query<{id:string}>("SELECT id FROM token_usage WHERE status='RESERVED' AND created_at<$1",[Date.now()-600000])).rows;
 for(const {id} of rows)await settleTokens(db,id,null,'interrupted','An interrupted AI request was refunded. Review usage accounting before resuming.');
}
export type TokenInvoice={network?:'hypercore'|'elysium';id:string;owner:string;amount:string;pay_to:string;units:string;nonce:number;status:string;tx:string|null;created_at:number;expires_at:number};
/** Create an owner-bound purchase quote with a receiving wallet, expiry and amount. */
export async function createTokenInvoice(db:Database,owner:string,amount:number,payTo:string,now=Date.now(),elysiumNonce?:number){
 if(!Number.isInteger(amount)||amount<5||amount>500)throw Error('Choose a whole USDC amount from 5 to 500');
 if(!/^0x[\da-f]{40}$/.test(payTo)||payTo==='0x'+'0'.repeat(40)||payTo===owner)throw Error('A different receiving wallet must be configured');
 return db.transaction(async q=>{
  await lockTokenAccount(q,owner);
  const network=elysiumNonce===undefined?'hypercore':'elysium';
  const pending=(await q.query<TokenInvoice>("SELECT * FROM token_invoices WHERE owner=$1 AND status='OPEN' AND expires_at>$2 AND network=$3 ORDER BY created_at DESC LIMIT 1",[owner,now,network])).rows[0];
  if(pending){if(Number(pending.amount)!==amount)throw Error('Finish the open purchase or wait for it to expire before changing the amount');return pending;}
  const row={network:network as NonNullable<TokenInvoice['network']>,id:randomUUID(),owner,amount:String(amount),pay_to:payTo,units:String(amount*TOKEN_UNITS_PER_USDC),nonce:elysiumNonce??now,status:'OPEN',tx:null,created_at:now,expires_at:now+900000};
  await q.query('INSERT INTO token_invoices(id,owner,amount,pay_to,units,nonce,created_at,expires_at,network) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[row.id,owner,row.amount,payTo,row.units,row.nonce,now,row.expires_at,network]);return row;
 });
}
type Ledger=Awaited<ReturnType<typeof info.userNonFundingLedgerUpdates>>;
/** Validate a venue ledger entry against the invoice amount, parties, time and fee. */
export function matchesTokenPayment(invoice:TokenInvoice,entry:Ledger[number]){
 const d=entry.delta;
 return /^0x[\da-f]{64}$/i.test(entry.hash)&&entry.time>=Number(invoice.created_at)&&entry.time<Number(invoice.expires_at)&&d.type==='internalTransfer'&&d.user.toLowerCase()===invoice.owner&&d.destination.toLowerCase()===invoice.pay_to&&/^\d+(\.\d{1,6})?$/.test(d.usdc)&&/^\d+(\.\d{1,6})?$/.test(d.fee)&&parseUnits(d.usdc,6)===parseUnits(invoice.amount,6)&&parseUnits(d.fee,6)===0n;
}
async function ledgerFor(invoice:TokenInvoice,user:Hex){
 const out:Ledger=[];let startTime=Number(invoice.created_at);
 for(let page=0;page<20;page++){
  const rows=await info.userNonFundingLedgerUpdates({user,startTime,endTime:Number(invoice.expires_at)-1});out.push(...rows);
  if(rows.length<500)return out;
  const last=Math.max(...rows.map(r=>r.time));if(last<=startTime)throw Error('Transfer history is too dense. Retry confirmation later.');startTime=last;
 }throw Error('Transfer history is still loading. Retry confirmation later.');
}
/** Cross-check both account ledgers before idempotently crediting a token purchase. */
export async function confirmTokenInvoice(db:Database,owner:string,id:string,tx?:string,readLedger=ledgerFor){
 const invoice=(await db.query<TokenInvoice>('SELECT * FROM token_invoices WHERE id=$1 AND owner=$2',[id,owner])).rows[0];if(!invoice)throw Error('Purchase not found');
 if(invoice.status==='PAID'){if(tx&&tx.toLowerCase()!==invoice.tx)throw Error('Purchase was credited from a different transfer');return invoice;}
 let hash: string;
 if (invoice.network === 'elysium') {
  if (!tx || !/^0x[\da-f]{64}$/i.test(tx)) throw Error('Enter the Elysium transaction hash to check this payment');
  hash = await verifyCreditTransfer(invoice, tx as Hex);
 } else {
  hash = await hypercorePaymentHash(invoice, tx, readLedger);
 }
 return db.transaction(async q=>{
  const row=(await q.query<TokenInvoice>('SELECT * FROM token_invoices WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(row.status==='PAID'){if(row.tx!==hash)throw Error('Purchase already credited');return row;}
  await lockTokenAccount(q,owner);
  // tx has a unique index across ALL customers and invoices; both writes roll back together.
  await q.query("UPDATE token_invoices SET status='PAID',tx=$2 WHERE id=$1",[id,hash]);
  await q.query('UPDATE token_accounts SET available=available+$2 WHERE owner=$1',[owner,row.units]);
  return {...row,status:'PAID',tx:hash};
 });
}
async function hypercorePaymentHash(invoice:TokenInvoice,tx:string|undefined,readLedger:typeof ledgerFor){
 // Never accept a client-supplied receipt. Query Hyperliquid mainnet independently.
 const [sent,received]=await Promise.all([readLedger(invoice,invoice.owner as Hex),readLedger(invoice,invoice.pay_to as Hex)]);
 const candidates=[...new Map(sent.filter(e=>matchesTokenPayment(invoice,e)&&(!tx||e.hash.toLowerCase()===tx.toLowerCase())&&received.some(r=>r.hash.toLowerCase()===e.hash.toLowerCase()&&matchesTokenPayment(invoice,r))).map(e=>[e.hash.toLowerCase(),e])).values()];
 if(candidates.length!==1)throw Error(candidates.length?'Multiple transfers match. Enter the transfer hash to recover this purchase.':'Transfer not yet verified. Check again; do not send a second payment.');
 return candidates[0].hash.toLowerCase();
}
const receiverCache=new Map<string,{time:number;ready:boolean}>();
/** Check whether the designated receiving account is active on Hyperliquid. */
export async function receiverReady(address:string){
 const cached=receiverCache.get(address);if(cached&&Date.now()-cached.time<15000)return cached.ready;
 try{const ready=(await info.userRole({user:address as Hex})).role==='user';receiverCache.set(address,{time:Date.now(),ready});return ready;}catch{return false;}
}
/** Report checkout bounds, token conversion, markup and current receiver readiness. */
export async function tokenPricing(){const s=await integrationSettings();return {elysiumPayTo:s.elysiumCreditPayTo??null,elysiumCheckoutReady:Boolean(s.elysiumCreditPayTo),tokensPerUsdc:1000,markupBps:s.aiMarkupBps,payTo:s.tokenPayTo??null,checkoutReady:Boolean(s.tokenPayTo)&&await receiverReady(s.tokenPayTo!),minimumUsdc:5,maximumUsdc:500};}
