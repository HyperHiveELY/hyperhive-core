import type {Sql} from './db.js';
import {config} from './config.js';
/** Check heartbeat freshness and role-specific liveness independently of permission to trade. */
export function serviceAlive(service:{role:string;updated_at:number;details?:any},now=Date.now()){
 const details=service.details??{};
 if(now-Number(service.updated_at)>(service.role==='worker'?180000:90000))return false;
 if(details.cycleStartedAt&&now-Number(details.cycleStartedAt)>900000)return false;
 return service.role!=='signer'||details.mode===config.SIGNER_MODE;
}
/** Check liveness and require explicit live enablement for execution readiness. */
export function serviceHealthy(service:{role:string;updated_at:number;details?:any},now=Date.now()){
 return serviceAlive(service,now)&&(service.role!=='signer'||service.details?.liveEnabled===true);
}
/** Read worker and signer heartbeats and return individual service readiness checks. */
export async function runtimeHealth(db:Sql){
 const services=(await db.query<{role:string;updated_at:number;details:any}>('SELECT role,updated_at,details FROM heartbeats')).rows;
 const checks=['worker','signer'].map(role=>({id:role,ok:services.some(s=>s.role===role&&serviceHealthy(s))}));
 const metering=!(await db.query('SELECT id FROM ai_metering_alerts WHERE resolved_at IS NULL LIMIT 1')).rows.length;
 checks.push({id:'ai-metering',ok:metering});return {ok:checks.every(c=>c.ok),checks};
}
