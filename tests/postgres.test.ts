import {describe,it,expect} from 'vitest';
import {Database} from '../packages/core/db.js';
import {crew} from './fixtures.js';
import {reserve} from '../packages/ai/crew.js';
import {reserveTokens,settleTokens,tokenBalance,setAiTestingAccess,aiCreditAccess} from '../packages/core/tokens.js';
import {paperControl,mutatePaper,readPaper} from '../packages/paper/account.js';
import {archiveHour} from '../apps/worker/auditor.js';
describe.skipIf(!process.env.HYPERHIVE_TEST_DATABASE_URL)('real Postgres coordination',()=>{
 it('reserves concurrent inference spend atomically and releases leadership',async()=>{
  const url=process.env.HYPERHIVE_TEST_DATABASE_URL!,a=await new Database(url).init(),b=await new Database(url).init();
  try{const c=await crew();await a.query('INSERT INTO crews(id,owner,account,policy,signature,created_at) VALUES($1,$2,$3,$4,$5,$6)',[c.id,c.owner,c.account,JSON.stringify(c.policy),c.signature,Date.now()]);
   const results=await Promise.allSettled(Array.from({length:10},(_,i)=>reserve(i%2?a:b,c,.1)));expect(results.filter(r=>r.status==='fulfilled').length).toBe(4);
   await a.query('INSERT INTO token_accounts(owner,available) VALUES($1,$2)',[c.owner,10000]);
   const holds=await Promise.allSettled(Array.from({length:10},(_,i)=>(i%2?a:b).transaction(q=>reserveTokens(q,{id:'pg-token-'+i,owner:c.owner,crewId:c.id,model:'test/model',ceiling:.004,markupBps:2500}))));
   expect(holds.filter(x=>x.status==='fulfilled')).toHaveLength(2);expect(await tokenBalance(a,c.owner)).toEqual({available:0,reserved:10});
   const held=(await a.query<{id:string}>("SELECT id FROM token_usage WHERE status='RESERVED'")).rows;
   await Promise.all(held.flatMap(u=>[settleTokens(a,u.id,null),settleTokens(b,u.id,null)]));expect(await tokenBalance(a,c.owner)).toEqual({available:10,reserved:0});
   await setAiTestingAccess(a,c.owner,true);expect(await aiCreditAccess(b,c.owner)).toBe(true);
   await b.transaction(q=>reserveTokens(q,{id:'pg-free',owner:c.owner,crewId:c.id,model:'test/model',ceiling:.01,markupBps:2500}));
   await Promise.all([settleTokens(a,'pg-free',.005),settleTokens(b,'pg-free',.005)]);expect(await tokenBalance(a,c.owner)).toEqual({available:10,reserved:0});
   await setAiTestingAccess(b,c.owner,false);
   await Promise.all([paperControl(a,c.id,'start'),paperControl(b,c.id,'start')]);
   await Promise.all(Array.from({length:10},(_,i)=>mutatePaper(i%2?a:b,c.id,async state=>{state.cash-=1;})));
   expect((await readPaper(a,c.id))?.cash).toBe(90);
   await paperControl(b,c.id,'pause');expect((await readPaper(a,c.id))?.running).toBe(false);
   const first=await a.lock('test/signer');expect(first).not.toBeNull();expect(await b.lock('test/signer')).toBeNull();await first!();const second=await b.lock('test/signer');expect(second).not.toBeNull();await second!();
   await expect(a.transaction(async tx=>{await tx.query("INSERT INTO heartbeats VALUES('rollback',1,'{}')");throw Error('rollback');})).rejects.toThrow('rollback');expect((await a.query("SELECT * FROM heartbeats WHERE role='rollback'")).rows).toHaveLength(0);
   await archiveHour(a);expect((await a.query('SELECT * FROM roots')).rows).toHaveLength(1);
  }finally{await a.close();await b.close();}
 });
});
