import type {Database} from '../core/db.js';
/** Atomically acquire one scan slot for the crew, market and lens at its configured cadence. */
export async function claimScan(db:Database,crewId:string,lens:string,market:string,cadenceMs:number,now=Date.now()){
  const r=await db.query(`INSERT INTO scout_runs(crew_id,lens,market,next_at) VALUES($1,$2,$3,$4)
    ON CONFLICT(crew_id,lens,market) DO UPDATE SET next_at=excluded.next_at
    WHERE scout_runs.next_at<=$5 RETURNING crew_id`,[crewId,lens,market,now+cadenceMs,now]);
  return r.rows.length===1;
}
