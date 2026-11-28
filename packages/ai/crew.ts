import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Decision, hash, type Crew, type Snapshot } from '../core/domain.js';
import { Database, event } from '../core/db.js';
import { config } from '../core/config.js';
import {reserveTokens,settleTokens} from '../core/tokens.js';
import {integrationSettings} from '../core/integration-settings.js';
import {signCard} from '../core/card-signing.js';
import type {Hex} from 'viem';
import {SCOUT,SKEPTIC,Scout,meteredInference} from './inference.js';
/** Reserve a crew's daily inference budget and its optional token charge atomically before inference. */
export async function reserve(db:Database,crew:Crew,max:number,billing?:{model:string;markupBps:number}){
  const day=new Date().toISOString().slice(0,10),cap=crew.policy.plan==='pro'?.70:.40,id=randomUUID();
  return db.transaction(async tx=>{
    await tx.query('SELECT id FROM crews WHERE id=$1 FOR UPDATE',[crew.id]);
    const r=await tx.query<{total:string}>('SELECT coalesce(sum(greatest(reserved,coalesce(actual,0))),0)::text total FROM budgets WHERE crew_id=$1 AND day=$2',[crew.id,day]);
    if(Number(r.rows[0].total)+max>cap)throw Error('Daily AI budget exhausted; exits continue');
    if(billing)await reserveTokens(tx,{id,owner:crew.owner,crewId:crew.id,model:billing.model,ceiling:max,markupBps:billing.markupBps});
    await tx.query('INSERT INTO budgets(id,crew_id,day,reserved,created_at) VALUES($1,$2,$3,$4,$5)',[id,crew.id,day,max,Date.now()]);return id;
  });
}
/** Construct metered inference access for the crew's configured models and spending limits. */
export async function inference(db:Database,crew:Crew){
  return meteredInference({
    reserve:async(model,ceiling)=>reserve(db,crew,ceiling,{model,markupBps:(await integrationSettings()).aiMarkupBps}),
    settle:async(id,cost,status)=>settleTokens(db,id,status==='catalog'?cost:null,status,status==='unmetered'?'AI returned incomplete usage. Review model metering before resuming.':undefined),
  });
}
/** Evaluate a candidate with the scout and skeptic under the crew's signed policy. */
export async function analyze(db:Database,crew:Crew,market:Snapshot|Snapshot[],lens:string){
  const pack=Array.isArray(market)?market:[market];if(!pack.length||pack.length>3)throw Error('Scouts accept at most three pre-screened markets');
  const {scout,skeptic,call}=await inference(db,crew);
  const suggestion=await call(scout,SCOUT,{lens,markets:pack},Scout);
  const card=(suggestion.value as z.infer<typeof Scout>).card;if(!card)return;
  const m=pack.find(m=>m.market===card.market);if(!m)throw Error('Scout selected an unauthorized market');
  const duplicates=(await db.query<{n:string}>("SELECT count(*)::text n FROM cards WHERE crew_id=$1 AND lens=$2 AND body->'card'->>'market'=$3 AND body->'card'->>'side'=$4 AND created_at>$5",[crew.id,lens,card.market,card.side,Date.now()-86400000])).rows[0];
  if(Number(duplicates.n)>=2)return;
  const criticism=await call(skeptic,SKEPTIC,{card,market:m},Decision);
  const verdict=Decision.parse(criticism.value),now=Date.now();
  const body={card,model:suggestion.model,skepticModel:criticism.model,skepticPromptHash:criticism.promptHash,timings:{scout:{startedAt:suggestion.startedAt,finishedAt:suggestion.finishedAt},skeptic:{startedAt:criticism.startedAt,finishedAt:criticism.finishedAt}},promptHash:suggestion.promptHash,inputsHash:hash(pack),policyHash:hash(crew.policy)};
  const id=hash({crew:crew.id,body,now});
  return {id,body,verdict,market:m,now};
}
/** Persist the reviewed trade card and its decision evidence for the execution worker. */
export async function think(db:Database,crew:Crew,market:Snapshot|Snapshot[],lens:string){
  const result=await analyze(db,crew,market,lens);if(!result)return;
  const {id,body,verdict,market:m,now}=result;
  // The worker's card key lets the signer reject rows that were written or edited outside this code path.
  const attestation=config.CARD_SIGNING_KEY?await signCard(config.CARD_SIGNING_KEY as Hex,{id,crewId:crew.id,body,verdict,createdAt:now}):null;
  await db.transaction(async tx=>{
    await tx.query('SELECT id FROM crews WHERE id=$1 FOR UPDATE',[crew.id]);
    if(verdict.verdict==='PASS'&&(await tx.query("SELECT id FROM cards WHERE crew_id=$1 AND body->>'source'='owner' AND status IN ('READY','SENDING') LIMIT 1",[crew.id])).rows.length)return;
    await tx.query('INSERT INTO cards(id,crew_id,body,lens,evidence,verdict,status,reason,created_at,updated_at,attestation) VALUES($1,$2,$3,$4,$5,$6,$7,NULL,$8,$8,$9)',[id,crew.id,JSON.stringify(body),lens,JSON.stringify({market:m,scout:body.model,skeptic:body.skepticModel,skepticPromptHash:body.skepticPromptHash}),JSON.stringify(verdict),verdict.verdict==='PASS'?'READY':'KILLED',now,attestation&&JSON.stringify(attestation)]);
    await event(tx,crew.id,verdict.verdict==='PASS'?'idea':'rejected',`${m.market}: ${verdict.reasons.join('; ')}`);
  });
}
