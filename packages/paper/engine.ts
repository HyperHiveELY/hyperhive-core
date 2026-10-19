import type {Database} from '../core/db.js';
import {hash,type Crew} from '../core/domain.js';
import {analyzePaper} from './review.js';
import {candidateChecks,STRATEGIES,PAPER_REVIEW_VERSION,type Lens,type PaperSnapshot} from './strategies.js';
import {aiCreditAccess,meteringReady} from '../core/tokens.js';
import {mutatePaper,readPaper,markPaper,openPaper,paperEvent} from './account.js';
export class PaperEngine {
 private scans=new Map<string,Promise<void>>();
 /** Bind the paper worker to its database and injected market-data source. */
 constructor(private db:Database,private quote:(market:string)=>Promise<PaperSnapshot>,private analyst=analyzePaper){}
 /** Evaluate the next eligible paper scan and update simulated account state. */
 async tick(crew:Crew){
  let a=await readPaper(this.db,crew.id);if(!a)return;
  if(!crew.paused){await mutatePaper(this.db,crew.id,async a=>{a.running=false;a.revision++;a.error='Mainnet crew must remain paused';});return;}
  if(a.strategyVersion!==PAPER_REVIEW_VERSION)await mutatePaper(this.db,crew.id,async (state,tx)=>{state.strategyVersion=PAPER_REVIEW_VERSION;state.nextScan={};state.revision++;await paperEvent(tx,crew.id,'strategy_update',{message:'Paper strategy checks updated; balances and history retained',version:PAPER_REVIEW_VERSION});});
  const quotes=await Promise.all(a.positions.map(p=>this.quote(p.market)));
  await mutatePaper(this.db,crew.id,async (a,tx)=>{for(const fill of markPaper(a,quotes))await paperEvent(tx,crew.id,'exit',fill);});
  a=await readPaper(this.db,crew.id);if(!a?.running||this.scans.has(crew.id))return;
  const job=this.scan(crew).catch(async e=>{await mutatePaper(this.db,crew.id,async (a,tx)=>{a.error=(e as Error).message.slice(0,250);await paperEvent(tx,crew.id,'error',{message:a.error});});}).finally(()=>this.scans.delete(crew.id));this.scans.set(crew.id,job);
 }
 /** Wait for outstanding paper analysis work before shutting down the service. */
 async drain(){await Promise.all(this.scans.values());}
 private async scan(crew:Crew){
  const lenses:Lens[]=crew.policy.plan==='pro'?['trend','crowding','levels','reversion','volbreak']:['trend','crowding','levels'];
  for(const lens of lenses){
   const claim=await mutatePaper(this.db,crew.id,async a=>{if(!a.running||(a.nextScan[lens]??0)>Date.now())return null;const revision=a.revision;a.nextScan[lens]=Date.now()+STRATEGIES[lens].cadence;return revision;});if(claim===null)continue;
   if(!await aiCreditAccess(this.db,crew.owner)||!await meteringReady(this.db))throw Error('AI billing is not ready');
   const pack=await Promise.all([...new Set(crew.policy.markets)].slice(0,3).map(this.quote));
   const result=await this.analyst(this.db,crew,pack,lens);
   const fresh=result.verdict==='PASS'&&result.card?await this.quote(result.card.market):null;
   await mutatePaper(this.db,crew.id,async (a,tx)=>{
    a.lastScan=Date.now();a.error=null;
    await paperEvent(tx,crew.id,'decision',result);
    if(!result.card||!fresh||!a.running||a.revision!==claim)return;
    const current=(await tx.query<Crew>('SELECT * FROM crews WHERE id=$1',[crew.id])).rows[0];
    if(!current?.paused||hash(current.policy)!==hash(crew.policy)){await paperEvent(tx,crew.id,'skipped',{message:'Crew policy or execution mode changed during review',decision:result.id,code:'POLICY_CHANGED'});return;}
    const recheck=candidateChecks(result.card,fresh,lens);
    if(!recheck.ok){await paperEvent(tx,crew.id,'skipped',{message:recheck.reasons.join('; '),decision:result.id,risk:recheck.risk,code:'FRESH_EVIDENCE_FAILED'});return;}
    // Keep the production anti-churn limit, using only paper decisions/fills.
    const recent=(await tx.query<{n:string}>("SELECT count(*)::text n FROM paper_events WHERE crew_id=$1 AND kind='entry' AND body->>'market'=$2 AND body->>'side'=$3 AND created_at>$4",[crew.id,result.card.market,result.card.side,Date.now()-86400000])).rows[0];
    try{if(Number(recent.n)>=2)throw Error('Daily same-direction entry limit reached');await paperEvent(tx,crew.id,'entry',openPaper(a,crew,result.card,fresh,result.id));}catch(e){await paperEvent(tx,crew.id,'skipped',{message:(e as Error).message,decision:result.id});}
   });
  }
 }
}
