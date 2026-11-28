import {config} from './config.js';
import type {Database,Sql} from './db.js';
import {Address} from './domain.js';
import {tokenBenefit} from './entitlements.js';
import {integrationSettings} from './integration-settings.js';
import {lockTokenAccount} from './tokens.js';

/** ISO weeks begin Monday at midnight UTC, including across calendar years. */
export function hiveDropWeek(now=Date.now()){
 const monday=new Date(now);monday.setUTCHours(0,0,0,0);monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
 const thursday=new Date(monday);thursday.setUTCDate(thursday.getUTCDate()+3);
 const year=thursday.getUTCFullYear(),week=Math.ceil(((thursday.getTime()-Date.UTC(year,0,1))/86400000+1)/7);
 return {week:`${year}-W${String(week).padStart(2,'0')}`,nextDropAt:new Date(monday.getTime()+7*86400000).toISOString()};
}
/** Public holder requirements, shared by signed-out and signed-in views. */
export async function hiveDropConfig(){const s=await integrationSettings();return {configured:Boolean(s.token),threshold:s.tokenThreshold,weeklyCredits:config.HIVE_WEEKLY_CREDITS};}
async function spentThisWeek(db:Sql,week:string){return Number((await db.query<{units:string}>('SELECT COALESCE(SUM(units),0) AS units FROM hive_drop_claims WHERE week=$1',[week])).rows[0].units);}
/** Keep credit history available when the on-chain balance cannot be checked. */
export async function hiveDropStatus(db:Sql,owner:string,now=Date.now()){
 const who=Address.parse(owner),settings=await hiveDropConfig(),{week,nextDropAt}=hiveDropWeek(now);
 const [claim,spent,benefit]=await Promise.all([
  db.query('SELECT units FROM hive_drop_claims WHERE owner=$1 AND week=$2',[who,week]),spentThisWeek(db,week),
  tokenBenefit(who).then(b=>({balance:b.balance,eligible:b.eligible,error:null as string|null})).catch(()=>({balance:null,eligible:false,error:'Could not check your $HIVE balance. Try again.'})),
 ]);
 return {...settings,...benefit,claimedThisWeek:claim.rows.length>0,nextDropAt,budgetLeft:Math.max(0,config.HIVE_WEEKLY_CREDIT_BUDGET-spent/1000)};
}
/** Fresh holdings, one immutable credit entry per owner/week, and a shared weekly lock. */
export async function claimHiveDrop(db:Database,owner:string){
 const who=Address.parse(owner);
 const benefit=await tokenBenefit(who,true).catch(()=>{throw Object.assign(Error('Could not check your $HIVE balance. Try again.'),{statusCode:503});});
 return db.transaction(async q=>{
  // Resolve the week after waiting for the connection; all claimers lock in this order.
  const now=Date.now(),{week}=hiveDropWeek(now),units=config.HIVE_WEEKLY_CREDITS*1000;
  await q.query('INSERT INTO hive_drop_weeks(week) VALUES($1) ON CONFLICT DO NOTHING',[week]);
  await q.query('SELECT week FROM hive_drop_weeks WHERE week=$1 FOR UPDATE',[week]);
  const existing=(await q.query('SELECT week,units,created_at FROM hive_drop_claims WHERE owner=$1 AND week=$2',[who,week])).rows[0];
  if(existing)return existing;
  if(!benefit.configured)throw Error('$HIVE holder drops are not set up yet.');
  if(!benefit.eligible)throw Error(`Hold at least ${benefit.threshold} $HIVE to claim the weekly drop.`);
  if(await spentThisWeek(q,week)+units>config.HIVE_WEEKLY_CREDIT_BUDGET*1000)throw Object.assign(Error('This week’s free Tokens have all been claimed. Try again Monday.'),{statusCode:409});
  await lockTokenAccount(q,who);
  const claim=(await q.query('INSERT INTO hive_drop_claims(owner,week,units,created_at) VALUES($1,$2,$3,$4) RETURNING week,units,created_at',[who,week,units,now])).rows[0];
  await q.query('UPDATE token_accounts SET available=available+$2 WHERE owner=$1',[who,units]);
  await q.query('INSERT INTO events(crew_id,kind,message,created_at) VALUES(NULL,$1,$2,$3)',['hive_holder_drop','$HIVE holder drop',now]);
  return claim;
 });
}
