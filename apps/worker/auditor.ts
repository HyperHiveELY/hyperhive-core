import {recordMetrics} from '../../packages/core/record-metrics.js';
import { verifyMessage, type Hex } from 'viem';
import { Database, event } from '../../packages/core/db.js';
import { allFills, info } from '../../packages/core/venue.js';
import { type Crew, hash } from '../../packages/core/domain.js';
import { verifyChain, ackMessage, merkleRoot, type SignedSlip } from '../../packages/core/proof.js';
import {matchesFill,venueEvent} from '../../packages/core/matching.js';
type Row=SignedSlip&{ack?:{response:any;signature:Hex}};
/** Check signed intents and acknowledgements against venue fills and persist reconciliation classifications. */
export async function auditCrew(db:Database,crew:Crew){
  const slips=(await db.query<Row>('SELECT * FROM slips WHERE crew_id=$1 ORDER BY seq',[crew.id])).rows;
  if(!await verifyChain(slips))throw Error('Journal verification failed');
  const identity=(await db.query<{signer:string}>('SELECT signer FROM identities WHERE crew_id=$1',[crew.id])).rows[0];
  if(slips.length&&(!identity||slips.some(s=>s.signer.toLowerCase()!==identity.signer.toLowerCase())))throw Error('Journal signer does not match published identity');
  const byOid=new Map<number,Row>();
  for(const slip of slips){
    if(slip.ack){
      if(!await verifyMessage({address:slip.signer,message:ackMessage(slip.digest,slip.ack.response),signature:slip.ack.signature}))throw Error('Acknowledgement signature failed');
      const oid=slip.ack.response?.filled?.oid??slip.ack.response?.resting?.oid??slip.ack.response?.oid;
      if(oid)byOid.set(oid,slip);
    }
  }
  const previous=(await db.query<{last:number}>('SELECT max(created_at) last FROM fills WHERE crew_id=$1',[crew.id])).rows[0]?.last;
  const pending=(await db.query<{at:number|null}>("SELECT min(created_at) at FROM fills WHERE crew_id=$1 AND status='PENDING'",[crew.id])).rows[0]?.at;
  const fills=await allFills(crew.account,pending?Math.min(pending,previous??pending):previous?Math.max(crew.created_at,previous-300000):crew.created_at);
  for(const fill of fills){
    let slip=byOid.get(fill.oid);
    if(!slip){const status=await info.orderStatus({user:crew.account,oid:fill.oid});if(status.status==='order'&&status.order.order.cloid)slip=slips.find(s=>s.cloid===status.order.order.cloid);}
    let state='UNMATCHED';
    if(slip){
      const o=slip.body.order;
      const total=(await db.query<{size:string}>('SELECT coalesce(sum((body->>\'sz\')::numeric),0)::text size FROM fills WHERE crew_id=$1 AND digest=$2 AND tid<>$3',[crew.id,slip.digest,String(fill.tid)])).rows[0];
      const valid=matchesFill(slip,fill,Number(total.size));
      if(valid)state='MATCHED';
    }else if(venueEvent(fill))state='VENUE';
    if(state==='UNMATCHED'&&Date.now()-fill.time<3600000)state='PENDING';
    await db.query('INSERT INTO fills VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(crew_id,tid) DO UPDATE SET status=excluded.status,digest=excluded.digest',[crew.id,String(fill.tid),JSON.stringify(fill),state,slip?.digest??null,fill.time]);
    if(state==='UNMATCHED'){await db.query('UPDATE crews SET broken_since=least(coalesce(broken_since,$2),$2) WHERE id=$1',[crew.id,fill.time]);}
  }
}
/** Backfill up to 168 completed hourly Merkle roots without overwriting existing records. */
export async function archiveHour(db:Database){
  const lastHour=Math.floor(Date.now()/3600000)-1;
  const existing=(await db.query<{hour:string|null}>('SELECT max(hour)::text AS hour FROM roots')).rows[0]?.hour;
  const earliest=(await db.query<{at:number|null}>('SELECT min(created_at) AS at FROM slips')).rows[0]?.at;
  const first=existing?Number(existing)+1:earliest?Math.floor(earliest/3600000):lastHour;
  for(let hour=first;hour<=Math.min(lastHour,first+167);hour++){
  const rows=await db.query<{digest:Hex}>('SELECT digest FROM slips WHERE created_at >= $1 AND created_at < $2 ORDER BY digest',[hour*3600000,(hour+1)*3600000]);
  const root=merkleRoot(rows.rows.map(r=>r.digest));
  await db.query('INSERT INTO roots(hour,root,count) VALUES($1,$2,$3) ON CONFLICT(hour) DO NOTHING',[hour,root,rows.rows.length]);
  }
}
/** Summarize the signed journal, fill classifications and recorded performance for one public crew. */
export async function verifyRecord(db:Database,id:string){
  const crew=(await db.query<Crew>('SELECT * FROM crews WHERE id=$1',[id])).rows[0];if(!crew)throw Error('Record not found');
  const slips=(await db.query<Row>('SELECT * FROM slips WHERE crew_id=$1 ORDER BY seq',[id])).rows;
  const fills=(await db.query<{status:string;body:any}>('SELECT * FROM fills WHERE crew_id=$1 ORDER BY created_at',[id])).rows;
  const intact=await verifyChain(slips);
  const local=slips.some(s=>s.body.order.signerMode==='local');
  return {metrics:await recordMetrics(db,id),crewId:id,account:crew.account,createdAt:crew.created_at,status:crew.broken_since?'BROKEN':!slips.length?'AWAITING_TRADES':!intact?'INVALID':fills.some(f=>f.status==='PENDING')?'RECONCILING':local?'LOCAL_SIGNED':'SIGNED',brokenSince:crew.broken_since,slips:slips.length,matched:fills.filter(f=>f.status==='MATCHED').length,unmatched:fills.filter(f=>f.status==='UNMATCHED').length,pending:fills.filter(f=>f.status==='PENDING').length,venue:fills.filter(f=>f.status==='VENUE').length,pnl:fills.reduce((sum,f)=>sum+Number(f.body.closedPnl)-Number(f.body.fee),0),fees:fills.reduce((sum,f)=>sum+Number(f.body.fee),0),root:merkleRoot(slips.map(s=>s.digest)),verification:local?'Locally signed records and fill matches. No hardware attestation or on-chain anchoring.':'Signatures and fill matches; hardware attestation and chain anchoring are separate checks'};
}
