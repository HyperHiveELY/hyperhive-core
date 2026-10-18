import {beforeAll,afterAll,it,expect} from 'vitest';
import {Database} from '../packages/core/db.js';
import {createTokenInvoice,confirmTokenInvoice,matchesTokenPayment,tokenBalance,reserveTokens,settleTokens,recoverTokenReservations,meteringReady,chargeUnits} from '../packages/core/tokens.js';
import {reserve} from '../packages/ai/crew.js';
import {usageCost,type Model} from '../packages/ai/models.js';
import {crew} from './fixtures.js';
let db:Database;
const owner='0x'+'11'.repeat(20),merchant='0x'+'22'.repeat(20),other='0x'+'33'.repeat(20),time=1800000000000;
const hash=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
beforeAll(async()=>{db=await new Database('memory').init();});afterAll(async()=>db.close());
const transfer=(i:any,tx=hash(1))=>({time:Number(i.created_at)+1000,hash:tx,delta:{type:'internalTransfer',user:i.owner,destination:i.pay_to,usdc:i.amount,fee:'0'}} as any);
it('reuses a pending checkout and validates amount and recipient',async()=>{
 const a=await createTokenInvoice(db,owner,25,merchant,time),b=await createTokenInvoice(db,owner,25,merchant,time+1);expect(b.id).toBe(a.id);
 await expect(createTokenInvoice(db,owner,10,merchant,time+2)).rejects.toThrow('open purchase');
 for(const amount of [0,1,5.5,501,Infinity])await expect(createTokenInvoice(db,other,amount,merchant,time)).rejects.toThrow();
 await expect(createTokenInvoice(db,other,5,other,time)).rejects.toThrow('different');
});
it('requires the sender, recipient, amount, asset, fee and invoice time window to match',async()=>{
 const i=await createTokenInvoice(db,owner,25,merchant,time),e=transfer(i);expect(matchesTokenPayment(i,e)).toBe(true);
 for(const delta of [{user:other},{destination:other},{usdc:'24.999999'},{usdc:'25.0000001'},{type:'deposit'},{type:'spotTransfer'},{fee:'1'}])expect(matchesTokenPayment(i,{...e,delta:{...e.delta,...delta}})).toBe(false);
 for(const t of [time-1,time+900000])expect(matchesTokenPayment(i,{...e,time:t})).toBe(false);
});
it('credits verified payments once under concurrent confirmations and permits later recovery',async()=>{
 const i=await createTokenInvoice(db,owner,25,merchant,time),read=async()=>[transfer(i)];
 await Promise.all([confirmTokenInvoice(db,owner,i.id,undefined,read),confirmTokenInvoice(db,owner,i.id,undefined,read)]);
 expect(await tokenBalance(db,owner)).toEqual({available:25000,reserved:0});
 await expect(confirmTokenInvoice(db,other,i.id,undefined,read)).rejects.toThrow('not found');
 await expect(confirmTokenInvoice(db,owner,i.id,hash(2),read)).rejects.toThrow('different transfer');
});
it('rejects client hashes without ledger evidence on both sides and prevents cross-invoice replay',async()=>{
 const i=await createTokenInvoice(db,owner,10,merchant,time+1000000);
 await expect(confirmTokenInvoice(db,owner,i.id,hash(2),async()=>[])).rejects.toThrow('not yet verified');
 await expect(confirmTokenInvoice(db,owner,i.id,undefined,async(_i,user)=>user===owner?[transfer(i,hash(2))]:[])).rejects.toThrow('not yet verified');
 await expect(confirmTokenInvoice(db,owner,i.id,undefined,async()=>[transfer(i)])).rejects.toThrow();
 expect((await tokenBalance(db,owner)).available).toBe(25000);
 const result=await confirmTokenInvoice(db,owner,i.id,hash(2),async()=>[transfer(i,hash(2))]);expect(result.status).toBe('PAID');
});
it('requires an explicit hash when multiple eligible transfers match',async()=>{
 const i=await createTokenInvoice(db,other,5,merchant,time),read=async()=>[transfer(i,hash(3)),transfer(i,hash(4))];
 await expect(confirmTokenInvoice(db,other,i.id,undefined,read)).rejects.toThrow('Multiple transfers');
 await confirmTokenInvoice(db,other,i.id,hash(3),read);expect((await tokenBalance(db,other)).available).toBe(5000);
});
it('reserves one shared balance atomically across concurrent crews and settles/refunds once',async()=>{
 await db.query('UPDATE token_accounts SET available=10000 WHERE owner=$1',[other]);
 const hold=(id:string)=>db.transaction(q=>reserveTokens(q,{id,owner:other,crewId:id,model:'test/scout',ceiling:.004,markupBps:2500}));
 const outcomes=await Promise.allSettled([hold('a'),hold('b'),hold('c')]);expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(2);
 expect(await tokenBalance(db,other)).toEqual({available:0,reserved:10});
 await Promise.all([settleTokens(db,'a',.002),settleTokens(db,'a',.002)]);
 await settleTokens(db,'b',null,'failed');await settleTokens(db,'b',null,'failed');
 expect(await tokenBalance(db,other)).toEqual({available:7.5,reserved:0});
});
it('rolls back both daily and Token reservations when credit is insufficient',async()=>{
 const c=await crew();await db.query('INSERT INTO crews(id,owner,account,policy,signature,created_at) VALUES($1,$2,$3,$4,$5,$6)',[c.id,c.owner,c.account,JSON.stringify(c.policy),c.signature,Date.now()]);
 await expect(reserve(db,c,.01,{model:'test/scout',markupBps:2500})).rejects.toThrow('Not enough Tokens');
 expect((await db.query('SELECT id FROM budgets WHERE crew_id=$1',[c.id])).rows).toHaveLength(0);
});
it('caps a charge at the reserved maximum and stops further inference after a metering overrun',async()=>{
 await db.transaction(q=>reserveTokens(q,{id:'overrun',owner,crewId:'any',model:'test/scout',ceiling:.01,markupBps:2500}));
 const before=(await tokenBalance(db,owner)).available;await settleTokens(db,'overrun',.05);
 expect((await tokenBalance(db,owner)).available).toBe(before);expect(await meteringReady(db)).toBe(false);
 await expect(db.transaction(q=>reserveTokens(q,{id:'blocked',owner,crewId:'any',model:'test/scout',ceiling:.01,markupBps:2500}))).rejects.toThrow('operator review');
 await db.query('UPDATE ai_metering_alerts SET resolved_at=$1',[Date.now()]);
});
it('recovers interrupted reservations without double refunds and requires metering review',async()=>{
 await db.transaction(q=>reserveTokens(q,{id:'interrupted',owner,crewId:'any',model:'test/scout',ceiling:.01,markupBps:2500}));
 await db.query('UPDATE token_usage SET created_at=$2 WHERE id=$1',['interrupted',Date.now()-700000]);
 await recoverTokenReservations(db);const before=await tokenBalance(db,owner);await recoverTokenReservations(db);
 expect(await tokenBalance(db,owner)).toEqual(before);expect(await meteringReady(db)).toBe(false);
});
it('charges catalog usage with the configured markup and rejects unverifiable usage',()=>{
 const model:Model={id:'test',name:'test',type:'chat',owned_by:'test',supported_parameters:[],pricing:{type:'per_token',currency:'USD',input_per_1M_tokens:1.055,output_per_1M_tokens:2.11}};
 const cost=usageCost(model,{inputTokens:1000,outputTokens:100,costUsd:.001});expect(cost).toBeCloseTo(.001266);
 expect(chargeUnits(cost,2500)).toBe(1583);expect(chargeUnits(0,2500)).toBe(0);
 expect(()=>usageCost(model,{inputTokens:null,outputTokens:100})).toThrow('missing');expect(()=>chargeUnits(NaN,2500)).toThrow();
});
