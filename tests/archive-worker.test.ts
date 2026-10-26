import {it,expect,vi} from 'vitest';
import {Database} from '../packages/core/db.js';
import {auditCrew,archiveHour,verifyRecord} from '../apps/worker/auditor.js';
import {signSlip,ackMessage} from '../packages/core/proof.js';
import {ZERO,hash} from '../packages/core/domain.js';
import {crew,wallet} from './fixtures.js';
const h=vi.hoisted(()=>({fills:vi.fn(),order:vi.fn()}));
vi.mock('../packages/core/venue.js',()=>({allFills:h.fills,info:{orderStatus:h.order}}));
it('reconciles signed fills and venue events, matures unmatched fills and archives completed hours once',async()=>{
 const c=await crew(),db=await new Database('memory').init();const now=Date.now(),at=(Math.floor(now/3600000)-2)*3600000+1;
 try{
  await db.query('INSERT INTO crews(id,owner,account,policy,signature,created_at) VALUES($1,$2,$3,$4,$5,$6)',[c.id,c.owner,c.account,JSON.stringify(c.policy),c.signature,at]);
  const slip=await signSlip({v:1,crewId:c.id,account:c.account,seq:1,previous:ZERO,kind:'ENTRY',policyHash:hash(c.policy),cardHash:ZERO,measurement:ZERO,agent:wallet.address,createdAt:at,expiresAt:at+30000,order:{market:'BTC',b:true,p:'100',s:'1'}},wallet);
  const response={filled:{oid:17}},signature=await wallet.signMessage({message:ackMessage(slip.digest,response)});
  await db.query('INSERT INTO slips VALUES($1,$2,1,$3,$4,$5,$6,$7,$8,$9)',[slip.digest,c.id,ZERO,JSON.stringify(slip.body),slip.signature,slip.signer,slip.cloid,JSON.stringify({response,signature}),at]);
  await expect(auditCrew(db,c)).rejects.toThrow('identity');
  await db.query('INSERT INTO identities VALUES($1,$2,$2,$3,0,$4,$5)',[c.id,wallet.address,'{}',ZERO,at]);
  const fill={oid:17,tid:1,time:at,side:'B',coin:'BTC',px:'100',sz:'1',fee:'0.1',closedPnl:'1',dir:'Open Long'};
  h.fills.mockResolvedValue([fill,{...fill,tid:2,oid:18,dir:'Liquidation'},{...fill,tid:3,oid:19},{...fill,tid:4,oid:20,time:now}]);h.order.mockResolvedValue({status:'unknownOid'});
  await auditCrew(db,c);await auditCrew(db,c);
  expect(await verifyRecord(db,c.id)).toMatchObject({status:'BROKEN',matched:1,unmatched:1,pending:1,venue:1});
  await archiveHour(db);await archiveHour(db);
  const {rows}=await db.query<any>('SELECT count,root FROM roots ORDER BY hour');expect(rows).toEqual([{count:1,root:slip.digest},{count:0,root:ZERO}]);
 }finally{await db.close();}
});
