import { InfoClient, HttpTransport } from '@nktkas/hyperliquid';
import { atr, type Candle } from '../eko/indicators.js';
import type { Snapshot } from './domain.js';
export const transport=new HttpTransport({isTestnet:false,timeout:15000});
export const info=new InfoClient({transport});
let cached:{at:number;data:Awaited<ReturnType<typeof info.metaAndAssetCtxs>>}|undefined;
async function universe(){
  if(!cached||Date.now()-cached.at>5000)cached={at:Date.now(),data:await info.metaAndAssetCtxs()};
  const [meta,ctx]=cached.data;
  return meta.universe.map((m,asset)=>({...m,asset,...ctx[asset]}));
}
/** Return the liquid, listed entry universe ordered by daily notional volume. */
export async function markets(){return (await universe()).filter(m=>!m.isDelisted&&Number(m.markPx)>0).sort((a,b)=>Number(b.dayNtlVlm)-Number(a.dayNtlVlm)).slice(0,30);}
const snapshots=new Map<string,{at:number;value:Promise<Snapshot>}>();
/** Build a cached market snapshot from closed candles, venue metadata and current midprices. */
export async function snapshot(market:string):Promise<Snapshot>{
  const cached=snapshots.get(market);if(cached&&Date.now()-cached.at<4000)return cached.value;
  const value=loadSnapshot(market);snapshots.set(market,{at:Date.now(),value});
  try{return await value;}catch(e){snapshots.delete(market);throw e;}
}
async function loadSnapshot(market:string):Promise<Snapshot>{
  // Falling out of the entry universe must never disable exits for an existing position.
  const all=await universe();const m=all.find(x=>x.name===market);if(!m)throw Error('Market unavailable');
  const now=Date.now();
  const [hours,minutes,mids]=await Promise.all([
    info.candleSnapshot({coin:market,interval:'1h',startTime:now-80*3600000,endTime:now}),
    info.candleSnapshot({coin:market,interval:'1m',startTime:now-24*3600000,endTime:now}),info.allMids(),
  ]);
  const candles:Candle[]=hours.filter(c=>c.T<=now).sort((a,b)=>a.t-b.t).map(c=>({time:c.t/1000,open:+c.o,high:+c.h,low:+c.l,close:+c.c,volume:+c.v}));
  const closes=minutes.filter(c=>c.T<=now).sort((a,b)=>a.t-b.t).map(c=>+c.c);
  if(closes.length<60||candles.length<30)throw Error('Insufficient market history');
  let variance=0;for(let i=1;i<closes.length;i++)variance=.97*variance+.03*Math.log(closes[i]/closes[i-1])**2;
  return {market,asset:m.asset,mark:Number(mids[market]),atr:atr(candles).at(-1)!,rv:Math.sqrt(variance*365*24*60),oiUsd:Number(m.openInterest)*Number(m.markPx),funding:Number(m.funding),szDecimals:m.szDecimals,maxLeverage:m.maxLeverage,timestamp:Date.now(),closes:candles.map(c=>c.close)};
}
/** Read public margin and position state for the specified HyperCore account. */
export async function accountState(user:`0x${string}`){return info.clearinghouseState({user});}
/** Total funding the account paid since startTime (receipts are not netted), paging through the venue's 500-row limit. */
export async function fundingPaid(user:`0x${string}`,startTime:number){
  let paid=0,cursor=startTime;const seen=new Set<string>();
  for(let page=0;page<20;page++){
    const rows=await info.userFunding({user,startTime:cursor});
    for(const r of rows){const key=r.hash+':'+r.delta.coin+':'+r.time;if(seen.has(key))continue;seen.add(key);paid+=Math.max(0,-Number(r.delta.usdc));}
    if(rows.length<500)return paid;
    const last=Math.max(...rows.map(r=>r.time));if(last<=cursor)throw Error('Funding pagination cannot advance');cursor=last;
  }
  throw Error('Funding history exceeds bounded catch-up');
}
/** Page through venue fills, deduplicate the inclusive cursor and reject incomplete history. */
export async function allFills(user:`0x${string}`,startTime:number,endTime?:number){
  const out:Awaited<ReturnType<typeof info.userFillsByTime>>=[];let cursor=startTime;
  for(let page=0;page<10;page++){
    const rows=await info.userFillsByTime({user,startTime:cursor,...(endTime===undefined?{}:{endTime}),aggregateByTime:false});out.push(...rows);
    if(rows.length<2000)break;
    const last=Math.max(...rows.map(r=>r.time));if(last<=cursor)throw Error('Fill pagination cannot advance');cursor=last;
    if(page===9)throw Error('Fill history exceeds bounded catch-up; archival backfill required');
  }
  const unique=[...new Map(out.map(f=>[String(f.tid),f])).values()];
  if(unique.length>=10000)throw Error('Exchange history retention limit reached; completeness requires a separately retained archive');
  return unique;
}
