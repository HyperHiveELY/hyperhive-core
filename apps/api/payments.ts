import type {FastifyInstance,FastifyRequest} from 'fastify';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {createPublicClient,http,parseAbi,parseEventLogs,type Hex} from 'viem';
import {base} from 'viem/chains';
import {decodePaymentSignatureHeader,encodePaymentRequiredHeader,encodePaymentResponseHeader} from '@x402/core/http';
import type {PaymentPayload} from '@x402/core/types';
import {Database} from '../../packages/core/db.js';
import {verifyRecord} from '../worker/auditor.js';
import {hash,subscriptionKey,type Crew} from '../../packages/core/domain.js';
import {config} from '../../packages/core/config.js';
import {BASE_USDC} from '../../packages/core/contract-abis.js';
import {paymentServer,requirementsFor,validatePayment} from './x402-service.js';
const rpc=createPublicClient({chain:base,transport:http()});
/** Verify Base confirmations, USDC transfer and the payer-bound authorization nonce before credit. */
export async function confirmInvoiceReceipt(invoice:any,tx:Hex){
 const receipt=await rpc.waitForTransactionReceipt({hash:tx,confirmations:2,timeout:30000});if(receipt.status!=='success'||await rpc.getBlockNumber()-receipt.blockNumber<1n)throw Error('Wait for two Base confirmations');
 const logs=receipt.logs.filter(l=>l.address.toLowerCase()===BASE_USDC.toLowerCase());
 const transfers=parseEventLogs({abi:parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']),logs});
 const authorizations=parseEventLogs({abi:parseAbi(['event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)']),logs});
 const auth=invoice.payment_payload?.payload?.authorization;
 if(!auth||auth.from.toLowerCase()!==invoice.owner||!authorizations.some(l=>l.args.authorizer.toLowerCase()===invoice.owner&&l.args.nonce.toLowerCase()===String(auth.nonce).toLowerCase())||!transfers.some(l=>l.args.from.toLowerCase()===invoice.owner&&l.args.to.toLowerCase()===invoice.pay_to&&l.args.value===BigInt(invoice.amount)))throw Error('Receipt does not match this invoice and signed authorization');
}
/** Apply a confirmed legacy subscription settlement once, inside a database transaction. */
export async function creditInvoice(db:Database,id:string,tx:string){tx=tx.toLowerCase();return db.transaction(async q=>{
 const row=(await q.query<any>('SELECT * FROM x402_invoices WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)throw Error('Invoice not found');
 if(row.status==='PAID'){if(row.tx!==tx)throw Error('Invoice already has another settlement');return {id:row.id,tx:row.tx,status:row.status};}
 const crew=(await q.query<Crew>('SELECT * FROM crews WHERE id=$1',[row.crew_id])).rows[0];if(!crew)throw Error('Crew not found');
 const key=subscriptionKey({...crew.policy,plan:row.plan});
 await q.query("UPDATE x402_invoices SET status='PAID',tx=$2 WHERE id=$1",[id,tx.toLowerCase()]);
 const expiry=(await q.query<{expires_at:number}>("INSERT INTO paid_entitlements(key,owner,plan,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(key) DO UPDATE SET expires_at=greatest(paid_entitlements.expires_at,$5)+$6 RETURNING expires_at",[key,row.owner,row.plan,Date.now()+30*86400000,Date.now(),30*86400000])).rows[0].expires_at;
 return {id,tx,paidUntil:expiry,status:'PAID'};
});}
function verificationInvoice(payload:PaymentPayload,requirements:any){return {owner:String((payload.payload as any)?.authorization?.from??'').toLowerCase(),pay_to:requirements.payTo.toLowerCase(),amount:requirements.amount,payment_payload:payload};}
/** Install paid public record verification and recovery for existing payment authorizations. */
export function registerPaidVerification(app:FastifyInstance,db:Database,owner:(req:FastifyRequest)=>Promise<Hex>){
 /** Issue an x402 challenge or settle a signed authorization for a public record. */
 app.get<{Params:{id:string}}>('/api/verify/:id',async(req,reply)=>{
  // Check the crew exists cheaply; the full signature re-check only runs once a payment has been verified.
  const id=z.string().uuid().parse(req.params.id);if(!(await db.query('SELECT id FROM crews WHERE id=$1',[id])).rows.length)throw Object.assign(Error('Record not found'),{statusCode:404});
  const {server,settings}=await paymentServer(),requirements=await requirementsFor('10000',settings.x402PayTo!);
  const encoded=req.headers['payment-signature'];if(typeof encoded!=='string'){const required=await server.createPaymentRequiredResponse([requirements],{url:new URL(req.url,config.PUBLIC_ORIGIN).toString(),description:'HyperHive record verification',mimeType:'application/json'});return reply.code(402).header('PAYMENT-REQUIRED',encodePaymentRequiredHeader(required)).send(required);}
  const payload=decodePaymentSignatureHeader(encoded);validatePayment(payload,requirements);const key=hash(payload);
  await db.query('INSERT INTO verification_payments(payment_hash,crew_id,payment_payload,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(payment_hash) DO NOTHING',[key,id,JSON.stringify(payload),Date.now()]);
  const saved=(await db.query<any>('SELECT * FROM verification_payments WHERE payment_hash=$1',[key])).rows[0];if(saved.crew_id!==id)throw Error('Payment belongs to another verification');
  const result=async()=>({...await verifyRecord(db,id),checkedAt:Date.now(),network:'hyperliquid-mainnet',paymentNetwork:'base-mainnet',paymentTx:saved.tx});
  if(saved.status==='PAID')return result();
  if(saved.tx){await confirmInvoiceReceipt(verificationInvoice(payload,requirements),saved.tx);await db.query("UPDATE verification_payments SET status='PAID' WHERE payment_hash=$1",[key]);return result();}
  const lease=await db.query("UPDATE verification_payments SET status='SETTLING' WHERE payment_hash=$1 AND status IN ('OPEN','RETRY') RETURNING payment_hash",[key]);if(!lease.rows.length)throw Error('Verification settlement is pending. Recover it with its Base transaction hash.');
  try{const verified=await server.verifyPayment(payload,requirements);if(!verified.isValid)throw Error('Authorization rejected');const settled=await server.settlePayment(payload,requirements);if(!settled.success)throw Error('Settlement not confirmed');saved.tx=settled.transaction.toLowerCase();await db.query('UPDATE verification_payments SET tx=$2 WHERE payment_hash=$1',[key,saved.tx]);await confirmInvoiceReceipt(verificationInvoice(payload,requirements),saved.tx);await db.query("UPDATE verification_payments SET status='PAID' WHERE payment_hash=$1",[key]);return reply.header('PAYMENT-RESPONSE',encodePaymentResponseHeader(settled)).send(result());}
  catch{await db.query("UPDATE verification_payments SET status='RETRY' WHERE payment_hash=$1 AND status<>'PAID'",[key]);throw Error('Verification payment is pending. Retry the same request or recover it with its Base transaction hash.');}
 });
 /** Recover paid verification by checking its saved payload and Base receipt. */
 app.post<{Params:{id:string}}>('/api/verify/:id/recover',async req=>{const {payload,tx}=z.strictObject({payload:z.any(),tx:z.string().regex(/^0x[0-9a-fA-F]{64}$/)}).parse(req.body),key=hash(payload),saved=(await db.query<any>('SELECT * FROM verification_payments WHERE payment_hash=$1 AND crew_id=$2',[key,req.params.id])).rows[0];if(!saved)throw Error('Signed verification payment not found');if(saved.tx&&saved.tx!==tx.toLowerCase())throw Error('Transaction differs from the existing settlement');const requirements=saved.payment_payload.accepted;await confirmInvoiceReceipt(verificationInvoice(saved.payment_payload,requirements),tx as Hex);await db.query("UPDATE verification_payments SET tx=$2,status='PAID' WHERE payment_hash=$1",[key,tx.toLowerCase()]);return {...await verifyRecord(db,req.params.id),checkedAt:Date.now(),paymentTx:tx.toLowerCase()};});
 /** Return HTTP 410 for creation of retired monthly subscription invoices. */
 app.post('/api/payments/invoices',async()=>{throw Object.assign(Error('Monthly plans have been replaced by Tokens'),{statusCode:410});});
 /** List the signed-in owner's historical monthly subscription invoices. */
 app.get('/api/payments/invoices',async req=>({invoices:(await db.query('SELECT id,crew_id,plan,amount,status,tx,created_at FROM x402_invoices WHERE owner=$1 ORDER BY created_at DESC LIMIT 20',[await owner(req)])).rows}));
 /** Challenge or reconcile a signed payment authorization for an existing owned invoice. */
 app.get<{Params:{id:string}}>('/api/payments/invoices/:id',async(req,reply)=>{
  const who=await owner(req),invoice=(await db.query<any>('SELECT * FROM x402_invoices WHERE id=$1 AND owner=$2',[req.params.id,who])).rows[0];if(!invoice)throw Error('Invoice not found');if(invoice.status==='PAID')return {id:invoice.id,status:'PAID',tx:invoice.tx};
  const {server}=await paymentServer(),encoded=req.headers['payment-signature'];
  if(typeof encoded!=='string'){if(invoice.expires_at<Date.now())throw Error('Invoice expired. Create a new invoice.');const required=await server.createPaymentRequiredResponse([invoice.requirements],{url:new URL(req.url,config.PUBLIC_ORIGIN).toString(),description:'HyperHive '+invoice.plan+' · 30 days',mimeType:'application/json'});return reply.code(402).header('PAYMENT-REQUIRED',encodePaymentRequiredHeader(required)).send(required);}
  const payload=decodePaymentSignatureHeader(encoded);validatePayment(payload,invoice.requirements);
  if((payload.payload as any)?.authorization?.from?.toLowerCase()!==who)throw Error('Pay from the signed-in owner wallet');
  if(invoice.payment_payload&&hash(invoice.payment_payload)!==hash(payload))throw Error('Invoice already has a signed authorization. Recover its existing payment.');
  if(!invoice.payment_payload&&invoice.expires_at<Date.now())throw Error('Invoice expired');
  const lease=await db.query("UPDATE x402_invoices SET status='SETTLING',payment_payload=$2 WHERE id=$1 AND status IN ('OPEN','RETRY') RETURNING id",[invoice.id,JSON.stringify(payload)]);if(!lease.rows.length)throw Error('Settlement is pending. Check the transaction or recover it with its hash.');
  try{const verified=await server.verifyPayment(payload,invoice.requirements);if(!verified.isValid)throw Error('Payment authorization rejected');const settled=await server.settlePayment(payload,invoice.requirements);if(!settled.success)throw Error('Settlement was not confirmed. Use the same invoice for recovery.');const full={...invoice,payment_payload:payload};await db.query('UPDATE x402_invoices SET tx=$2 WHERE id=$1',[invoice.id,settled.transaction.toLowerCase()]);await confirmInvoiceReceipt(full,settled.transaction as Hex);const credit=await creditInvoice(db,invoice.id,settled.transaction);return reply.header('PAYMENT-RESPONSE',encodePaymentResponseHeader(settled)).send(credit);}catch(e){await db.query("UPDATE x402_invoices SET status='RETRY' WHERE id=$1 AND status<>'PAID'",[invoice.id]);throw Error('Payment not yet credited. Recover this invoice with its Base transaction hash; do not pay again.');}
 });
 /** Verify the Base receipt before crediting an existing owned invoice. */
 app.post<{Params:{id:string}}>('/api/payments/invoices/:id/recover',async req=>{const who=await owner(req),{tx}=z.strictObject({tx:z.string().regex(/^0x[0-9a-fA-F]{64}$/)}).parse(req.body),invoice=(await db.query<any>('SELECT * FROM x402_invoices WHERE id=$1 AND owner=$2',[req.params.id,who])).rows[0];if(!invoice)throw Error('Invoice not found');await confirmInvoiceReceipt(invoice,tx as Hex);return creditInvoice(db,invoice.id,tx);});
}
