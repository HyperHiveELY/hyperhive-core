import {assertProductionConfig} from '../../packages/core/production.js';
import {config} from '../../packages/core/config.js';
import {collectRecordMetrics} from '../../packages/core/record-metrics.js';
import {accessStatus} from '../../packages/core/access.js';
import {localMode} from '../../packages/core/local-mode.js';
import { Database, event, heartbeat } from '../../packages/core/db.js';
import { type Crew, verifyPolicy } from '../../packages/core/domain.js';
import { snapshot,markets } from '../../packages/core/venue.js';
import {aiCreditAccess,meteringReady,recoverTokenReservations} from '../../packages/core/tokens.js';
import { think } from '../../packages/ai/crew.js';
import { claimScan } from '../../packages/ai/schedule.js';
import { auditCrew, archiveHour, storeRecord } from './auditor.js';
assertProductionConfig(config);
const isLocal=localMode();
const db=await new Database().init();const release=await db.lock('hyperhive/worker');if(!release)throw Error('Worker already running');
let cycleStartedAt=0,crewCount=0;
const pulse=setInterval(()=>{heartbeat(db,'worker',{crews:crewCount,cycleStartedAt}).catch(()=>{});},30000);pulse.unref();
let stop=false;let wake:()=>void=()=>{};
function shutdown(){stop=true;wake();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
async function idle(){if(stop)return;await new Promise<void>(resolve=>{const timer=setTimeout(resolve,60000);wake=()=>{clearTimeout(timer);resolve();};});wake=()=>{};}
try{while(!stop){
  cycleStartedAt=Date.now();
  await recoverTokenReservations(db);
  const crews=(await db.query<Crew>('SELECT * FROM crews ORDER BY created_at')).rows;
  crewCount=crews.length;
  for(const crew of crews){
    try{await auditCrew(db,crew);await storeRecord(db,crew.id);}catch(e){await event(db,crew.id,'audit_error',(e as Error).message);}
    try{await collectRecordMetrics(db,crew);}catch(e){await event(db,crew.id,'metrics_error',(e as Error).message);}
    if(!(await accessStatus(db,crew.owner)).eligible||crew.paused||!await verifyPolicy(crew.policy,crew.signature))continue;
    if(!await meteringReady(db)||!await aiCreditAccess(db,crew.owner))continue;
    if((await db.query('SELECT crew_id FROM paper_accounts WHERE crew_id=$1',[crew.id])).rows.length)continue;
    const lenses=crew.policy.plan==='pro'?['trend','crowding','levels','reversion','volbreak']:['trend','crowding','levels'];
    for(const lens of lenses){
      const spent=Number((await db.query<{spent:string}>('SELECT coalesce(sum(greatest(reserved,coalesce(actual,0))),0)::text spent FROM budgets WHERE crew_id=$1 AND day=$2',[crew.id,new Date().toISOString().slice(0,10)])).rows[0].spent);
      const remaining=1-spent/(crew.policy.plan==='pro'?.7:.4);if(remaining<.2)break;
      const cadence=(lens==='levels'?900000:lens==='trend'||lens==='volbreak'?3600000:1800000)*(remaining<.5?2:1);
      if(!await claimScan(db,crew.id,lens,'*',cadence))continue;
      try{
        const score=(m:Awaited<ReturnType<typeof markets>>[number])=>lens==='crowding'?Math.abs(Number(m.funding))*Number(m.openInterest):lens==='volbreak'?Number(m.dayNtlVlm)/Math.max(1,Number(m.openInterest)*Number(m.markPx)):Math.abs(Number(m.markPx)/Number(m.prevDayPx)-1)*Math.log1p(Number(m.dayNtlVlm));
        const selected=(await markets()).filter(m=>crew.policy.markets.includes(m.name)).sort((a,b)=>score(b)-score(a)).slice(0,3);
        if(selected.length)await think(db,crew,await Promise.all(selected.map(m=>snapshot(m.name))),lens);
      }catch(e){await event(db,crew.id,'scout_error',(e as Error).message);}
    }
  }
  try{await archiveHour(db);}catch(e){await event(db,null,'archive_error',(e as Error).message);}cycleStartedAt=0;await heartbeat(db,'worker',{crews:crews.length,cycleStartedAt});await idle();
}}finally{clearInterval(pulse);await release();await db.close();}
