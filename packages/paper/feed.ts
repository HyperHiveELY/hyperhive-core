import {snapshot,info} from '../core/venue.js';
import {atr,type Candle} from '../eko/indicators.js';
import type {PaperSnapshot} from './strategies.js';
const history=new Map<string,{at:number;rows:Candle[]}>();
/** Paper-only provenance for the closed-bar strategy gates. Mainnet snapshots are unchanged. */
export async function paperSnapshot(market:string):Promise<PaperSnapshot>{
 const now=Date.now();let cached=history.get(market);
 if(!cached||now-cached.at>15000){
  const rows=await info.candleSnapshot({coin:market,interval:'1h',startTime:now-80*3600000,endTime:now});
  const closed=rows.filter(c=>c.T<=now).sort((a,b)=>a.t-b.t).map(c=>({time:c.t/1000,open:+c.o,high:+c.h,low:+c.l,close:+c.c,volume:+c.v}));
  cached={at:now,rows:closed};history.set(market,cached);
 }
 return {...await snapshot(market),atr:atr(cached.rows).at(-1)!,closes:cached.rows.map(c=>c.close),hourly:cached.rows};
}
