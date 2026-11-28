import type {Hex} from 'viem';
import type {Database} from '../core/db.js';
import {Card,hash,verifyPolicy,type Crew,type Snapshot} from '../core/domain.js';
import {OwnerTrade,verifyOwnerTrade,tradeReason} from '../core/owner-trade.js';
import {mutatePaper,openPaper,paperEvent} from './account.js';

/** Consume owner cards atomically in the simulation ledger, never in the live signer journal. */
export async function executeOwnerPaperTrade(db:Database,crew:Crew,quote:(market:string)=>Promise<Snapshot>){
 const row=(await db.query<{id:Hex;body:{card:Card;source:string;mode:string;policyHash:Hex;paperRevision:number;authorization:Omit<OwnerTrade,'card'>};verdict:{verdict:string};created_at:number}>("SELECT * FROM cards WHERE crew_id=$1 AND status='READY' AND body->>'source'='owner' AND body->>'mode'='paper' ORDER BY created_at LIMIT 1",[crew.id])).rows[0];
 if(!row)return;
 const m=await quote(row.body.card.market);
 await mutatePaper(db,crew.id,async(a,tx)=>{
  const claimed=await tx.query("UPDATE cards SET status='SENDING',updated_at=$2 WHERE id=$1 AND status='READY' RETURNING id",[row.id,Date.now()]);if(!claimed.rows.length)return;
  try{
   const current=(await tx.query<Crew>('SELECT * FROM crews WHERE id=$1',[crew.id])).rows[0],card=Card.parse(row.body.card);
   if(!current?.paused||current.broken_since||!a.running||a.closeRequested||a.revision!==row.body.paperRevision)throw Error('Paper crew settings changed. Place a new trade');
   if(current.owner!==current.policy.owner||current.account!==current.policy.account||current.id!==current.policy.crewId||hash(current.policy)!==row.body.policyHash||!await verifyPolicy(current.policy,current.signature))throw Error('Crew policy changed or expired');
   if(row.id!==hash({crew:crew.id,body:row.body,now:row.created_at})||row.verdict.verdict!=='PASS'||!await verifyOwnerTrade(current,'paper',OwnerTrade.parse({card,...row.body.authorization})))throw Error('Trade signature is invalid');
   if(Date.now()-row.created_at>900000)throw Error('Trade expired. Place a new trade');
   if(card.side==='long'?card.invalidationPx>=m.mark:card.invalidationPx<=m.mark)throw Error('Invalidation is on the wrong side');
   const recent=(await tx.query<{n:string}>("SELECT count(*)::text n FROM paper_events WHERE crew_id=$1 AND kind='entry' AND body->>'market'=$2 AND body->>'side'=$3 AND created_at>$4",[crew.id,card.market,card.side,Date.now()-86400000])).rows[0];
   if(Number(recent.n)>=2)throw Error('Daily entry limit for this market and side');
   const fill=openPaper(a,current,card,m,row.id);
   await paperEvent(tx,crew.id,'entry',fill);
   await tx.query("UPDATE cards SET status='FILLED',updated_at=$2 WHERE id=$1",[row.id,Date.now()]);
  }catch(error){await tx.query("UPDATE cards SET status='REJECTED',reason=$2,updated_at=$3 WHERE id=$1",[row.id,tradeReason(error),Date.now()]);}
 });
}
