import {z} from 'zod';
import {Address} from './domain.js';
import {info} from './venue.js';

const numeric=z.string().trim().regex(/^-?\d+(\.\d+)?$/).transform(Number).pipe(z.number());
const positive=numeric.pipe(z.number().positive()),nonnegative=numeric.pipe(z.number().nonnegative());
const stateSchema=z.object({marginSummary:z.object({accountValue:numeric}),assetPositions:z.array(z.object({position:z.object({
  coin:z.string().min(1),szi:numeric,entryPx:nonnegative,positionValue:nonnegative,unrealizedPnl:numeric,
  leverage:z.object({value:z.number().positive()}),liquidationPx:nonnegative.nullable(),
})}))});
const ordersSchema=z.array(z.object({coin:z.string(),side:z.enum(['A','B']),reduceOnly:z.boolean(),isTrigger:z.boolean(),
  isPositionTpsl:z.boolean(),orderType:z.string(),triggerPx:nonnegative,sz:nonnegative}));
const fundingSchema=z.array(z.object({time:z.number().int().nonnegative(),hash:z.string(),delta:z.object({coin:z.string(),usdc:numeric})}));
const WEEK=7*24*60*60*1000;
export const WALLET_CHECK_TTL=30_000;

/** Gross funding paid per coin over seven days, including closed positions; incoming payments do not offset it. */
async function fundingByCoin(user:`0x${string}`,endTime:number,signal:AbortSignal){
  const startTime=endTime-WEEK,paid=new Map<string,number>(),seen=new Set<string>();let cursor=startTime;
  for(let page=0;page<20;page++){
    const rows=fundingSchema.parse(await info.userFunding({user,startTime:cursor,endTime},signal));
    for(const row of rows){
      const key=`${row.hash}:${row.delta.coin}:${row.time}`;
      if(seen.has(key)||row.time<startTime||row.time>endTime)continue;
      seen.add(key);paid.set(row.delta.coin,(paid.get(row.delta.coin)??0)+Math.max(0,-row.delta.usdc));
    }
    if(rows.length<500)return paid;
    const last=Math.max(...rows.map(row=>row.time));
    if(last<=cursor)throw Error('Funding history could not be completed');
    cursor=last;
  }
  throw Error('Funding history could not be completed');
}

/** Main Hyperliquid perp market only. mark is the current mid, so liquidation distance is an estimate. */
export async function readWalletCheck(user:`0x${string}`){
  const checkedAt=Date.now(),signal=AbortSignal.timeout(12_000);
  const [rawState,rawOrders,rawMids,paid]=await Promise.all([
    info.clearinghouseState({user},signal),info.frontendOpenOrders({user},signal),info.allMids({},signal),fundingByCoin(user,checkedAt,signal),
  ]);
  const state=stateSchema.parse(rawState),orders=ordersSchema.parse(rawOrders);
  const positions=state.assetPositions.filter(({position:p})=>p.szi!==0).map(({position:p})=>{
    const size=Math.abs(p.szi),side=p.szi>0?'Long' as const:'Short' as const,mark=positive.parse(rawMids[p.coin]);
    const liquidationPx=p.liquidationPx;
    // Signed distance keeps a price already beyond liquidation at zero, never falsely far away.
    const distanceToLiquidationPct=liquidationPx===null?null:Math.max(0,(side==='Long'?mark-liquidationPx:liquidationPx-mark)/mark*100);
    const exits=orders.filter(o=>o.coin===p.coin&&o.reduceOnly&&o.isTrigger&&o.side===(side==='Long'?'A':'B')&&o.triggerPx>0);
    // Pending child orders are not active exits. A partial-size exit alone is not a full-position stop.
    const fullExit=(kind:'Stop'|'Take Profit')=>{
      const matching=exits.filter(o=>o.orderType.startsWith(kind+' ')&&(kind==='Stop'
        ?(side==='Long'?o.triggerPx<mark&&(liquidationPx===null||o.triggerPx>liquidationPx):o.triggerPx>mark&&(liquidationPx===null||o.triggerPx<liquidationPx))
        :(side==='Long'?o.triggerPx>mark:o.triggerPx<mark)));
      return matching.some(o=>o.isPositionTpsl)||matching.reduce((sum,o)=>sum+o.sz,0)>=size*(1-1e-9);
    };
    return {coin:p.coin,side,size,notional:p.positionValue,entry:p.entryPx,mark,leverage:p.leverage.value,liquidationPx,distanceToLiquidationPct,
      hasStop:fullExit('Stop'),hasTakeProfit:fullExit('Take Profit'),unrealizedPnl:p.unrealizedPnl,funding7d:paid.get(p.coin)??0};
  });
  const accountValue=state.marginSummary.accountValue,totalNotional=positions.reduce((sum,p)=>sum+p.notional,0);
  const effectiveLeverage=totalNotional===0?0:accountValue>0?totalNotional/accountValue:null;
  const positionsWithoutStop=positions.filter(p=>!p.hasStop).length;
  const closestToLiquidation=positions.filter(p=>p.distanceToLiquidationPct!==null).sort((a,b)=>a.distanceToLiquidationPct!-b.distanceToLiquidationPct!)[0]??null;
  // At risk: <=10% from liquidation, or open positions with nonpositive equity.
  // Needs attention: no full stop, >5x effective leverage, or no liquidation estimate. Otherwise Healthy.
  const atRisk=positions.length>0&&(accountValue<=0||(closestToLiquidation?.distanceToLiquidationPct??Infinity)<=10);
  const attention=positionsWithoutStop>0||(effectiveLeverage??0)>5||positions.some(p=>p.liquidationPx===null);
  const status=atRisk?'At risk':attention?'Needs attention':'Healthy';
  const explanation=atRisk?(accountValue<=0?'Open positions have no positive account value.':'A position is within 10% of its estimated liquidation price.')
    :positionsWithoutStop>0?`${positionsWithoutStop} ${positionsWithoutStop===1?'position needs':'positions need'} a stop for its full size.`
    :(effectiveLeverage??0)>5?'Open positions are more than 5 times the account value.'
    :attention?'A position has no liquidation estimate. Review it on Hyperliquid.'
    :positions.length?'Stops are set, leverage is at most 5×, and liquidation estimates are more than 10% away.':'No open positions found in the main perp market.';
  return {checkedAt,scope:'Hyperliquid main perp market',positions,summary:{accountValue,totalNotional,effectiveLeverage,positionsWithoutStop,
    closestToLiquidation:closestToLiquidation?{coin:closestToLiquidation.coin,side:closestToLiquidation.side,distanceToLiquidationPct:closestToLiquidation.distanceToLiquidationPct}:null,
    totalFundingPaid7d:[...paid.values()].reduce((sum,n)=>sum+n,0),status,explanation}};
}
export type WalletCheckReport=Awaited<ReturnType<typeof readWalletCheck>>;

/** Bounded, case-insensitive, in-flight cache; timers delete addresses even when no further requests arrive. */
export function createWalletCheckCache(read=readWalletCheck){
  const entries=new Map<string,{value:Promise<WalletCheckReport>;timer:ReturnType<typeof setTimeout>}>();
  const remove=(key:string)=>{const entry=entries.get(key);if(entry)clearTimeout(entry.timer);entries.delete(key);};
  return {
    get(address:string){
      const user=Address.parse(address),existing=entries.get(user);if(existing)return existing.value;
      if(entries.size>=1000)remove(entries.keys().next().value!);
      const value=Promise.resolve().then(()=>read(user));
      const entry={value,timer:setTimeout(()=>{if(entries.get(user)===entry)remove(user);},WALLET_CHECK_TTL)};
      entry.timer.unref();entries.set(user,entry);
      void value.catch(()=>{if(entries.get(user)===entry)remove(user);});return value;
    },
    close(){for(const key of entries.keys())remove(key);},
  };
}
