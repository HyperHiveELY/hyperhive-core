import {ema,type Candle} from '../eko/indicators.js';
import {type Snapshot,type Card} from '../core/domain.js';
import {PAPER_FEE,PAPER_SLIPPAGE} from './account.js';
export const PAPER_REVIEW_VERSION='paper-v2';
export const HOUR=3600000;
export type PaperSnapshot=Snapshot&{hourly?:Candle[]};
export const STRATEGIES={
 trend:{name:'Trend continuation',cadence:60*60000,horizon:24,instructions:'Follow an established hourly trend, not a counter-trend bounce. Require aligned EMA8/EMA21, a rising/falling EMA8 and confirming recent closes. Do not chase more than 2 ATR from EMA8.'},
 crowding:{name:'Funding reversal',cadence:30*60000,horizon:24,instructions:'Fade extreme current funding only after a two-close reversal and EMA8 confirmation. Positive hourly funding crowds longs: consider shorts; negative funding crowds shorts: consider longs. Current open interest alone is not evidence of changing positioning.'},
 levels:{name:'Range breakout',cadence:15*60000,horizon:12,instructions:'Trade a completed hourly close outside the preceding 20-close range by at least 0.1 ATR, confirmed by the current quote. A bounce inside the range does not qualify. Levels use closing prices, not intrabar high/low claims.'},
 reversion:{name:'Mean reversion',cadence:30*60000,horizon:8,instructions:'Require a previous close at least 2 ATR away from EMA21, followed by two closes toward the mean with room remaining. Do not treat an unconfirmed falling price as a reversal.'},
 volbreak:{name:'Volatility impulse',cadence:60*60000,horizon:8,instructions:'Require a completed one-hour directional move of at least 1.5 ATR and a current quote that holds the move. This measures price impulse, not volume or order-book imbalance.'},
} as const;
export type Lens=keyof typeof STRATEGIES;
export type Check={id:string;label:string;ok:boolean};
export type Evidence={market:string;lens:Lens;strategy:string;version:string;timestamp:number;lastClosedAt:number;metrics:Record<string,number>;sides:{side:Card['side'];checks:Check[];invalidationPx:number}[];eligible:Card[];problems:string[]};
const finitePositive=(n:number)=>Number.isFinite(n)&&n>0;
/** Compute closed-bar evidence and side-specific checks for the selected paper strategy. */
export function strategyEvidence(m:PaperSnapshot,lens:Lens,now=Date.now()):Evidence{
 const e:Evidence={market:m.market,lens,strategy:STRATEGIES[lens].name,version:PAPER_REVIEW_VERSION,timestamp:m.timestamp,lastClosedAt:0,metrics:{},sides:[],eligible:[],problems:[]};
 const h=m.hourly??[];
 if(![m.mark,m.atr,m.rv,m.oiUsd].every(finitePositive)||!Number.isFinite(m.funding))e.problems.push('Invalid price, ATR, volatility, open interest or funding');
 if(!Number.isFinite(m.timestamp)||now-m.timestamp>10000||m.timestamp>now+1000)e.problems.push('Stale quote');
 if(h.length<30||h.some((c,i)=>![c.open,c.high,c.low,c.close].every(finitePositive)||c.high<Math.max(c.open,c.close,c.low)||c.low>Math.min(c.open,c.close)||!Number.isFinite(c.time)||c.time*1000%HOUR!==0||(i>0&&(c.time-h[i-1].time)*1000!==HOUR)))e.problems.push('Missing, invalid or discontinuous closed hourly candles');
 e.lastClosedAt=h.length?h.at(-1)!.time*1000+HOUR:0;
 if(e.lastClosedAt>now||now-e.lastClosedAt>=HOUR)e.problems.push('Hourly history is stale or contains an unfinished candle');
 if(e.problems.length)return e;
 const closes=h.map(c=>c.close),fast=ema(closes,8),slow=ema(closes,21),last=closes.at(-1)!,prev=closes.at(-2)!,prev2=closes.at(-3)!,f=fast.at(-1)!,s=slow.at(-1)!;
 const prior=closes.slice(-21,-1),top=Math.max(...prior),bottom=Math.min(...prior),change3=last/closes.at(-4)!-1;
 e.metrics={mark:m.mark,atr:m.atr,ema8:f,ema21:s,ema8Slope3:f-fast.at(-4)!,lastClose:last,previousClose:prev,thirdLastClose:prev2,rangeHigh20:top,rangeLow20:bottom,return3h:change3,return24h:last/closes.at(-25)!-1,fundingHourly:m.funding,realizedVolatility:m.rv};
 for(const side of ['long','short'] as const){
  const sign=side==='long'?1:-1,check=(id:string,label:string,ok:boolean)=>({id,label,ok});let checks:Check[]=[];
  let invalidationPx=side==='long'?Math.min(...h.slice(-5).map(c=>c.low))-.1*m.atr:Math.max(...h.slice(-5).map(c=>c.high))+.1*m.atr;
  if(lens==='trend')checks=[check('ema_alignment','EMA8 / EMA21 align with the proposed side',sign*(f-s)>0),check('trend_slope','EMA8 has moved with the trend over three hours',sign*(f-fast.at(-4)!)>0),check('trend_confirmation','Latest close, quote and three-hour momentum confirm the EMA8 side',sign*(last-f)>0&&sign*(m.mark-f)>0&&sign*change3>0),check('not_extended','Quote is no more than 2 ATR from EMA8',Math.abs(m.mark-f)<=2*m.atr)];
  if(lens==='crowding')checks=[check('funding_extreme','Hourly funding is at least 1 basis point against the proposed side',sign*m.funding<=-.0001),check('reversal_closes','Two completed hourly closes confirm a reversal',sign*(last-prev)>0&&sign*(prev-prev2)>0),check('reversal_ema','Last close and current quote hold the reversal side of EMA8',sign*(last-f)>0&&sign*(m.mark-f)>0)];
  if(lens==='levels'){const level=side==='long'?top:bottom;invalidationPx=level-sign*.8*m.atr;checks=[check('range_break','Completed close breaks the prior 20-close range by at least 0.1 ATR',sign*(last-level)>=.1*m.atr),check('break_holds','Current quote still holds beyond the broken range',sign*(m.mark-level)>0)];}
  if(lens==='reversion')checks=[check('mean_extension','Third-last close was at least 2 ATR beyond its EMA21',sign*(slow.at(-3)!-prev2)>=2*m.atr),check('mean_reversal','Two completed closes move back toward the mean',sign*(last-prev)>0&&sign*(prev-prev2)>0),check('mean_room','Current quote confirms recovery with at least 0.5 ATR to EMA21',sign*(m.mark-prev)>0&&sign*(s-m.mark)>=.5*m.atr)];
  if(lens==='volbreak'){invalidationPx=prev-sign*.1*m.atr;checks=[check('impulse','Latest completed one-hour move is at least 1.5 ATR',sign*(last-prev)>=1.5*m.atr),check('impulse_holds','Current quote holds the impulse close',sign*(m.mark-last)>=0)];}
  e.sides.push({side,checks,invalidationPx});
  if(checks.every(c=>c.ok))e.eligible.push({market:m.market,side,invalidationPx,horizonH:STRATEGIES[lens].horizon,why:STRATEGIES[lens].name+' signal confirmed by completed hourly candles.'});
 }
 return e;
}
/** Calculate the candidate's stop distance and related market risk measurements. */
export function riskFacts(card:Card,m:Snapshot){
 const sign=card.side==='long'?1:-1,distance=sign*(m.mark-card.invalidationPx),ratio=distance/m.atr,entry=m.mark*(1+sign*PAPER_SLIPPAGE),stopDistance=Math.max(sign*(entry-card.invalidationPx),1.2*m.atr);
 const stop=entry-sign*stopDistance,target=entry+sign*3*stopDistance,estimatedCosts=2*entry*(PAPER_FEE+PAPER_SLIPPAGE);
 const metrics={mark:m.mark,atr:m.atr,invalidation:card.invalidationPx,invalidationDistance:distance,invalidationAtr:ratio,minimumInvalidationAtr:.8,expectedEntry:entry,effectiveStop:stop,target,stopDistance,plannedGrossRR:3,estimatedNetRR:(3*stopDistance-estimatedCosts)/(stopDistance+estimatedCosts)};
 const checks:Check[]=[{id:'finite_risk',label:'Risk inputs are finite and positive',ok:[m.mark,m.atr,card.invalidationPx].every(finitePositive)&&Object.values(metrics).every(Number.isFinite)},{id:'loss_side',label:'Invalidation is on the loss side',ok:distance>0},{id:'minimum_atr',label:'Invalidation distance is at least 0.8 ATR',ok:Number.isFinite(ratio)&&ratio+1e-12>=.8},{id:'positive_bracket',label:'Planned stop and target remain positive',ok:stop>0&&target>0}];
 return {metrics,checks,ok:checks.every(c=>c.ok)};
}
/** Evaluate the proposed paper trade against the strategy evidence and risk checks. */
export function candidateChecks(card:Card,m:PaperSnapshot,lens:Lens,now=Date.now()){
 const evidence=strategyEvidence(m,lens,now),risk=riskFacts(card,m),side=evidence.sides.find(s=>s.side===card.side);
 return {evidence,risk,ok:card.market===m.market&&!evidence.problems.length&&!!side?.checks.every(c=>c.ok)&&risk.ok,reasons:[...evidence.problems,...(side?.checks.filter(c=>!c.ok).map(c=>c.label)??['Strategy evidence unavailable']),...risk.checks.filter(c=>!c.ok).map(c=>c.label)]};
}
