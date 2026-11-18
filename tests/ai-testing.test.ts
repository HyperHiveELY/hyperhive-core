import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {Database} from '../packages/core/db.js';
import {aiTestingExempt,aiCreditAccess,setAiTestingAccess,reserveTokens,settleTokens,tokenBalance,meteringReady,recoverTokenReservations} from '../packages/core/tokens.js';
import {reserve} from '../packages/ai/crew.js';
import {crew} from './fixtures.js';
let db:Database,c:Awaited<ReturnType<typeof crew>>;
const other='0x'+'22'.repeat(20);
beforeAll(async()=>{db=await new Database('memory').init();c=await crew();await db.query('INSERT INTO crews(id,owner,account,policy,signature,created_at) VALUES($1,$2,$3,$4,$5,$6)',[c.id,c.owner,c.account,JSON.stringify(c.policy),c.signature,Date.now()]);});
beforeEach(async()=>{for(const table of ['ai_billing_exemptions','token_usage','token_accounts','budgets','ai_metering_alerts'])await db.query('DELETE FROM '+table);});
afterAll(async()=>db.close());
const hold=(id:string,owner:string=c.owner)=>db.transaction(q=>reserveTokens(q,{id,owner,crewId:c.id,model:'test/scout',ceiling:.02,markupBps:2500}));
it('is off by default, normalized by owner, and grants only a registered wallet',async()=>{
 expect(await aiCreditAccess(db,c.owner)).toBe(false);
 await expect(setAiTestingAccess(db,other,true)).rejects.toThrow('no registered crew');
 await expect(setAiTestingAccess(db,'0x'+'0'.repeat(40),true)).rejects.toThrow('real owner');
 await setAiTestingAccess(db,c.owner.toUpperCase().replace('0X','0x'),true);
 expect(await aiTestingExempt(db,c.owner)).toBe(true);expect(await aiCreditAccess(db,c.owner)).toBe(true);expect(await aiCreditAccess(db,other)).toBe(false);
 await expect(hold('other',other)).rejects.toThrow('Not enough Tokens');
 expect((await db.query("SELECT id FROM events WHERE kind='ai_testing_access'")).rows.length).toBeGreaterThan(0);
});
it('runs with a zero Token balance and records actual provider costs without minting credits',async()=>{
 await setAiTestingAccess(db,c.owner,true);
 const id=await reserve(db,c,.02,{model:'test/scout',markupBps:2500});
 expect(await tokenBalance(db,c.owner)).toEqual({available:0,reserved:0});
 await Promise.all([settleTokens(db,id,.008),settleTokens(db,id,.008)]);
 const u=(await db.query<any>('SELECT * FROM token_usage WHERE id=$1',[id])).rows[0];
 expect(u.billing_exempt).toBe(true);expect(Number(u.charged)).toBe(0);expect(Number(u.cost_usd)).toBe(.008);expect(u.status).toBe('SETTLED');
 expect(Number((await db.query<any>('SELECT actual FROM budgets WHERE id=$1',[id])).rows[0].actual)).toBe(.008);
 expect(await tokenBalance(db,c.owner)).toEqual({available:0,reserved:0});expect(await meteringReady(db)).toBe(true);
});
it('does not consume existing purchased Tokens and keeps in-flight sponsorship after revocation',async()=>{
 await db.query('INSERT INTO token_accounts(owner,available) VALUES($1,100000)',[c.owner]);await setAiTestingAccess(db,c.owner,true);await hold('free');
 await setAiTestingAccess(db,c.owner,false);await settleTokens(db,'free',.01);
 expect(await tokenBalance(db,c.owner)).toEqual({available:100,reserved:0});
 await hold('paid');expect(await tokenBalance(db,c.owner)).toEqual({available:75,reserved:25});
});
it('does not retroactively change paid reservations when testing is enabled',async()=>{
 await db.query('INSERT INTO token_accounts(owner,available) VALUES($1,100000)',[c.owner]);await hold('paid');await setAiTestingAccess(db,c.owner,true);await settleTokens(db,'paid',.01);
 expect(await tokenBalance(db,c.owner)).toEqual({available:87.5,reserved:0});
});
it('still enforces the shared daily provider budget with concurrent free scans',async()=>{
 await setAiTestingAccess(db,c.owner,true);
 const results=await Promise.allSettled(Array.from({length:3},()=>reserve(db,c,.2,{model:'test/scout',markupBps:2500})));
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(2);expect(await tokenBalance(db,c.owner)).toEqual({available:0,reserved:0});
});
it('preserves metering-overrun protection for free scans',async()=>{
 await setAiTestingAccess(db,c.owner,true);await hold('overrun');await settleTokens(db,'overrun',.03);
 expect(await meteringReady(db)).toBe(false);expect(await tokenBalance(db,c.owner)).toEqual({available:0,reserved:0});await expect(hold('blocked')).rejects.toThrow('operator review');
});
it('recovers interrupted free requests without a phantom refund and stops unmetered inference',async()=>{
 await setAiTestingAccess(db,c.owner,true);await hold('interrupted');await db.query('UPDATE token_usage SET created_at=$1',[Date.now()-700000]);await recoverTokenReservations(db);await recoverTokenReservations(db);
 expect(await tokenBalance(db,c.owner)).toEqual({available:0,reserved:0});expect(await meteringReady(db)).toBe(false);
});
it('revocation restores the credit requirement, independent of any client-supplied flag',async()=>{
 await setAiTestingAccess(db,c.owner,true);await setAiTestingAccess(db,c.owner,false);
 expect(await aiCreditAccess(db,c.owner)).toBe(false);
 await expect(db.transaction(q=>reserveTokens(q,{id:'spoof',owner:c.owner,crewId:c.id,model:'test/scout',ceiling:.01,markupBps:2500,billing_exempt:true} as any))).rejects.toThrow('Not enough Tokens');
});
