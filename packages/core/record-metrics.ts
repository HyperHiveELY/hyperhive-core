import type {Database} from './db.js';
import {hash,type Crew} from './domain.js';
import {info} from './venue.js';
/** Compute the largest observed decline from a prior cumulative profit peak. */
export function pnlDrawdown(series:readonly (readonly [number,number])[]){
 if(!series.length)return null;const sorted=[...series].sort((a,b)=>a[0]-b[0]);let peak=sorted[0][1],drawdown=0;
 for(const [,pnl] of sorted){if(!Number.isFinite(pnl))throw Error('Invalid P&L history');peak=Math.max(peak,pnl);drawdown=Math.max(drawdown,peak-pnl);}return drawdown;
}
/** Persist publicly observable performance and funding measurements for a crew. */
export async function collectRecordMetrics(db:Database,crew:Crew){
 const previous=(await db.query<{funding_through:number;updated_at:number}>('SELECT * FROM metric_state WHERE crew_id=$1',[crew.id])).rows[0];if(previous&&Date.now()-previous.updated_at<300000)return;
 let from=Number(previous?.funding_through??crew.created_at),end=Date.now();
 // Process bounded daily windows. Do not advance a saturated timestamp or claim complete coverage.
 for(let page=0;page<20&&from<end;page++){
  const until=Math.min(end,from+86400000),rows=await info.userFunding({user:crew.account,startTime:from,endTime:until});
  for(const f of rows){if(!Number.isFinite(Number(f.delta.usdc))||f.time<from||f.time>until)throw Error('Invalid funding response');await db.query('INSERT INTO funding VALUES($1,$2,$3,$4) ON CONFLICT(crew_id,event_hash) DO NOTHING',[crew.id,hash(f),JSON.stringify(f),f.time]);}
  if(rows.length>=500){const next=Math.max(...rows.map(f=>f.time));if(next<=from)throw Error('Funding pagination saturated at a timestamp');from=next;}else from=until+1;
 }
 const portfolio=await info.portfolio({user:crew.account}),history=portfolio.find(([p])=>p==='perpAllTime')?.[1];
 if(history){const equities=new Map(history.accountValueHistory.map(([time,value])=>[time,Number(value)]));for(const [time,value] of history.pnlHistory){const equity=equities.get(time);if(equity==null||!Number.isFinite(Number(value))||!Number.isFinite(equity))continue;await db.query('INSERT INTO account_history VALUES($1,$2,$3,$4) ON CONFLICT(crew_id,time) DO UPDATE SET equity=excluded.equity,cumulative_pnl=excluded.cumulative_pnl',[crew.id,time,equity,Number(value)]);}}
 await db.query('INSERT INTO metric_state VALUES($1,$2,$3) ON CONFLICT(crew_id) DO UPDATE SET funding_through=excluded.funding_through,updated_at=excluded.updated_at',[crew.id,Math.min(from,end),Date.now()]);
}
/** Read the crew's recorded performance, observation history and funding metrics. */
export async function recordMetrics(db:Database,id:string){
 const state=(await db.query<{funding_through:number;updated_at:number}>('SELECT * FROM metric_state WHERE crew_id=$1',[id])).rows[0];
 const funding=(await db.query<{net:string}>('SELECT coalesce(sum((body->\'delta\'->>\'usdc\')::numeric),0)::text net FROM funding WHERE crew_id=$1',[id])).rows[0];
 const history=(await db.query<{time:number;cumulative_pnl:string}>('SELECT time,cumulative_pnl FROM account_history WHERE crew_id=$1 ORDER BY time',[id])).rows;
 return {netFunding:state?Number(funding.net):null,fundingThrough:state?.funding_through??null,maxDrawdownUsd:pnlDrawdown(history.map(x=>[x.time,Number(x.cumulative_pnl)])),drawdownFrom:history[0]?.time??null,drawdownThrough:history.at(-1)?.time??null,updatedAt:state?.updated_at??null};
}
