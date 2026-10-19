import type {Database,Sql} from '../core/db.js';
import {type Crew,type PositionState,type Snapshot,type Card,weekStart} from '../core/domain.js';
import {sizeTrade,nextExit} from '../core/risk.js';
export const PAPER_START=100, PAPER_FEE=.00045, PAPER_SLIPPAGE=.0002;
export interface PaperPosition extends PositionState {leverage:number;mark:number;quoteAt:number;entryFee:number}
export interface PaperAccount {version:1;strategyVersion?:string;running:boolean;cash:number;initial:number;positions:PaperPosition[];realizedLoss:number;week:number;revision:number;startedAt:number;updatedAt:number;nextScan:Record<string,number>;lastScan:number|null;error:string|null;closeRequested:boolean}
/** Initialize an unfunded simulation ledger at its configured starting paper balance. */
export const initialPaper=(now=Date.now()):PaperAccount=>({version:1,running:false,cash:PAPER_START,initial:PAPER_START,positions:[],realizedLoss:0,week:weekStart(now),revision:0,startedAt:now,updatedAt:now,nextScan:{},lastScan:null,error:null,closeRequested:false});
/** Append a timestamped event belonging only to the simulated account. */
export async function paperEvent(db:Sql,id:string,kind:string,body:unknown){await db.query('INSERT INTO paper_events(crew_id,kind,body,created_at) VALUES($1,$2,$3,$4)',[id,kind,JSON.stringify(body),Date.now()]);}
/** Read the current revision of a crew's persisted paper account. */
export async function readPaper(db:Sql,id:string){return (await db.query<{body:PaperAccount}>('SELECT body FROM paper_accounts WHERE crew_id=$1',[id])).rows[0]?.body??null;}
/** Persist simulated account state for the crew. */
export async function savePaper(db:Sql,id:string,a:PaperAccount){a.updatedAt=Date.now();await db.query('UPDATE paper_accounts SET body=$2 WHERE crew_id=$1',[id,JSON.stringify(a)]);}
/** Lock the paper account, apply the supplied update and persist it atomically. */
export async function mutatePaper<T>(db:Database,id:string,fn:(a:PaperAccount,tx:Sql)=>Promise<T>){return db.transaction(async tx=>{await tx.query('SELECT id FROM crews WHERE id=$1 FOR UPDATE',[id]);const row=(await tx.query<{body:PaperAccount}>('SELECT body FROM paper_accounts WHERE crew_id=$1 FOR UPDATE',[id])).rows[0];if(!row)throw Error('Paper account not created');const result=await fn(row.body,tx);await savePaper(tx,id,row.body);return result;});}
/** Mark simulated equity, margin and available balance from cash and open positions. */
export function totals(a:PaperAccount){const pnl=a.positions.reduce((n,p)=>n+(p.mark-p.entry)*p.size*(p.side==='long'?1:-1),0),margin=a.positions.reduce((n,p)=>n+p.entry*p.size/p.leverage,0);return {equity:a.cash+pnl,unrealized:pnl,realized:a.cash-a.initial,available:Math.max(0,a.cash+pnl-margin),margin};}
/** Apply an owner paper command while enforcing the live-execution interlock. */
export async function paperControl(db:Database,id:string,action:'start'|'pause'|'close'){
 return db.transaction(async tx=>{
  const c=(await tx.query<Crew>('SELECT * FROM crews WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!c)throw Error('Crew not found');
  if(!c.paused)throw Error('Pause the mainnet crew before paper testing');
  // An old resume is replayed by the signer. Reject any latest resume, even if already handled.
  const latest=(await tx.query<{action:string}>('SELECT action FROM controls WHERE crew_id=$1 ORDER BY issued_at DESC,nonce DESC LIMIT 1',[id])).rows[0];
  if(latest?.action==='resume')throw Error('Sign a mainnet Pause before enabling paper testing');
  if((await tx.query("SELECT id FROM cards WHERE crew_id=$1 AND status='SENDING' LIMIT 1",[id])).rows.length)throw Error('Wait for the in-flight mainnet entry to reconcile');
  if((await tx.query('SELECT market FROM positions WHERE crew_id=$1',[id])).rows.length)throw Error('Close existing mainnet positions before paper testing');
  await tx.query('INSERT INTO paper_accounts(crew_id,body) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,JSON.stringify(initialPaper())]);
  const a=(await tx.query<{body:PaperAccount}>('SELECT body FROM paper_accounts WHERE crew_id=$1 FOR UPDATE',[id])).rows[0].body;
  if(action==='start'){a.running=true;a.error=null;}else {a.running=false;a.revision++;}
  if(action==='close')a.closeRequested=true;
  await savePaper(tx,id,a);await paperEvent(tx,id,action,{message:action==='start'?'Paper scouts enabled':action==='pause'?'New paper entries paused; protective exits continue':'Closing paper positions at the next live quote'});return a;
 });
}
const rollWeek=(a:PaperAccount,now:number)=>{const week=weekStart(now);if(a.week!==week){a.week=week;a.realizedLoss=0;}};
/** Open a simulated position using the paper fee and slippage model. */
export function openPaper(a:PaperAccount,crew:Crew,card:Card,m:Snapshot,digest:PositionState['entryDigest'],now=Date.now()){
 if(!a.running)throw Error('Paper account paused');if(a.positions.some(p=>p.market===card.market))throw Error('A paper position already exists in this market');rollWeek(a,now);
 const sign=card.side==='long'?1:-1,fill=m.mark*(1+sign*PAPER_SLIPPAGE),quote={...m,mark:fill};
 const s=sizeTrade({policy:crew.policy,card,market:quote,freeMargin:totals(a).available,realizedLoss:a.realizedLoss,openRisk:a.positions.reduce((n,p)=>n+p.risk,0),positions:a.positions.length,herdNotional:0,takerFee:PAPER_FEE,builderFee:PAPER_SLIPPAGE,now});
 const fee=s.notional*PAPER_FEE;a.cash-=fee;a.realizedLoss+=fee;
 const p:PaperPosition={market:card.market,side:card.side,entry:fill,size:s.size,stop:s.stop,tp:s.tp,extreme:fill,openedAt:now,horizonH:card.horizonH,entryDigest:digest,lastModify:now,fundingStart:0,fundingPaid:0,risk:s.risk,leverage:s.leverage,mark:m.mark,quoteAt:m.timestamp,entryFee:fee};a.positions.push(p);return {market:p.market,side:p.side,size:p.size,price:fill,fee,stop:p.stop,tp:p.tp,leverage:p.leverage,decision:digest};
}
/** Apply fresh quotes to simulated positions and account for simulated exits. */
export function markPaper(a:PaperAccount,quotes:Snapshot[],now=Date.now()){
 rollWeek(a,now);const fills:Array<Record<string,unknown>>=[];
 for(const p of [...a.positions]){
  const m=quotes.find(m=>m.market===p.market);if(!m||!Number.isFinite(m.mark)||m.mark<=0||now-m.timestamp>10000||m.timestamp>now+1000)continue;
  p.mark=m.mark;p.quoteAt=m.timestamp;const sign=p.side==='long'?1:-1;
  const exit=nextExit(p,m,now),stop=sign*(m.mark-p.stop)<=0,target=sign*(m.mark-p.tp)>=0;
  const equity=totals(a).equity,maintenance=a.positions.reduce((n,p)=>n+p.mark*p.size*.1,0);
  const reason=a.closeRequested?'Requested close':stop?'Stop loss':target?'Take profit':equity<=maintenance?'Paper margin protection':exit.close;
  if(reason){const fill=m.mark*(1-sign*PAPER_SLIPPAGE),fee=fill*p.size*PAPER_FEE,pnl=(fill-p.entry)*p.size*sign-fee;a.cash+=pnl;a.realizedLoss+=Math.max(0,-pnl);a.positions=a.positions.filter(x=>x!==p);fills.push({market:p.market,side:p.side,size:p.size,price:fill,fee,pnl:pnl-p.entryFee,reason,entry:p.entry,openedAt:p.openedAt,decision:p.entryDigest});}
  else {p.extreme=exit.extreme;if(exit.stop!==undefined){p.stop=exit.stop;p.lastModify=now;}}
 }
 if(a.closeRequested&&!a.positions.length)a.closeRequested=false;return fills;
}
