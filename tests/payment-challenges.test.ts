import {expect,it,vi} from 'vitest';
import Fastify from 'fastify';
import {encodePaymentSignatureHeader} from '@x402/core/http';
import {registerPaidVerification} from '../apps/api/payments.js';
import {paymentServer,requirementsFor} from '../apps/api/x402-service.js';
import {BASE_USDC} from '../packages/core/contract-abis.js';
import {Database} from '../packages/core/db.js';
import {crew} from './fixtures.js';
const h=vi.hoisted(()=>({settings:vi.fn(),init:vi.fn(),verify:vi.fn(),build:vi.fn(),required:vi.fn()}));
vi.mock('../packages/core/integration-settings.js',()=>({integrationSettings:h.settings,facilitatorToken:async()=>undefined}));
vi.mock('@x402/core/server',()=>({HTTPFacilitatorClient:class{},x402ResourceServer:class{register(){return this}initialize=h.init;verifyPayment=h.verify;buildPaymentRequirements=h.build;createPaymentRequiredResponse=h.required;}}));
it('requires a signed authorization for both payment-bearing reads and keeps rejected invoices recoverable',async()=>{
 const c=await crew(),db=await new Database('memory').init(),app=Fastify();registerPaidVerification(app,db,async()=>c.owner);
 const to='0x'+'12'.repeat(20),requirements={scheme:'exact',network:'eip155:8453',asset:BASE_USDC,amount:'29000000',payTo:to,maxTimeoutSeconds:120,extra:{}};
 const payload=(from:string)=>({x402Version:2,accepted:requirements,payload:{authorization:{from}}});
 try{
  h.settings.mockResolvedValue({});await expect(paymentServer()).rejects.toThrow('Configure');
  h.settings.mockResolvedValue({x402PayTo:to,x402Facilitator:'https://fixture.invalid'});h.init.mockResolvedValue(undefined);h.build.mockResolvedValue([requirements]);h.required.mockResolvedValue({x402Version:2,accepts:[requirements]});
  expect(await requirementsFor(requirements.amount,to)).toEqual(requirements);
  await db.query('INSERT INTO crews(id,owner,account,policy,signature,created_at) VALUES($1,$2,$3,$4,$5,$6)',[c.id,c.owner,c.account,JSON.stringify(c.policy),c.signature,c.created_at]);
  const id=crypto.randomUUID();await db.query('INSERT INTO x402_invoices(id,owner,crew_id,plan,amount,pay_to,requirements,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,c.owner,c.id,'crew',requirements.amount,to,JSON.stringify(requirements),Date.now(),Date.now()+60000]);
  const url='/api/payments/invoices/'+id;expect((await app.inject({url})).statusCode).toBe(402);
  const get=(path:string,p:any)=>app.inject({url:path,headers:{'payment-signature':encodePaymentSignatureHeader(p)}});
  expect((await get(url,payload(to))).json().message).toMatch(/owner wallet/);expect(h.verify).not.toHaveBeenCalled();
  h.verify.mockResolvedValue({isValid:false});
  expect((await get(url,payload(c.owner))).json().message).toMatch(/not yet credited/);
  expect((await db.query<any>('SELECT status FROM x402_invoices WHERE id=$1',[id])).rows[0].status).toBe('RETRY');
  expect((await get('/api/verify/'+c.id,{...payload(c.owner),accepted:{...requirements,amount:'0'}})).json().message).toMatch(/requirements changed/);
  expect((await db.query('SELECT * FROM verification_payments')).rows).toHaveLength(0);
 }finally{await app.close();await db.close();}
});
