import {formatPrice} from '@nktkas/hyperliquid/utils';
import type {Snapshot} from './domain.js';

export type ExitKind='sl'|'tp';
export interface ExitPositionInput {coin:string;szi:string;entryPx:string|null;liquidationPx:string|null}
export interface ExitOpenOrder {coin:string;oid:number;side:string;reduceOnly:boolean;isTrigger:boolean;orderType:string;triggerPx:string;sz:string;isPositionTpsl:boolean;cloid?:string|null}
export interface ExistingExit {oid:number;price:number;size:number;wholePosition:boolean}
export interface ExitPosition {
 coin:string;side:'long'|'short';size:number;entry:number;liquidation:number|null;mark:number|null;
 asset:number|null;szDecimals:number|null;stopPrice:number|null;tpPrice:number|null;distancePct:number|null;maxLoss:number|null;tight:boolean;
 existing:{sl:ExistingExit[];tp:ExistingExit[]};error:string|null;
}
export interface ExitPlan {owner:string;checkedAt:number;positions:ExitPosition[]}
export function exitKind(order:ExitOpenOrder):ExitKind|null {
 if(!order.reduceOnly||!order.isTrigger||!Number.isFinite(Number(order.triggerPx))||Number(order.triggerPx)<=0)return null;
 return /^Stop (Market|Limit)$/.test(order.orderType)?'sl':/^Take Profit (Market|Limit)$/.test(order.orderType)?'tp':null;
}
/** Only active, closing-side orders count; unfilled entry children are not exits on the current position. */
export function existingExits(position:ExitPositionInput,orders:ExitOpenOrder[]){
 const found:{sl:ExistingExit[];tp:ExistingExit[]}={sl:[],tp:[]};
 for(const o of orders){const kind=exitKind(o);if(o.coin!==position.coin||o.side!==(Number(position.szi)>0?'A':'B')||!kind)continue;found[kind].push({oid:o.oid,price:Number(o.triggerPx),size:Number(o.sz),wholePosition:o.isPositionTpsl&&Number(o.sz)===0});}
 return found;
}
export function exitLoss(entry:number,stop:number,size:number,side:'long'|'short'){return Math.max(0,(entry-stop)*(side==='long'?1:-1)*size);}
/** Validate the actual rounded prices, including user edits, against the current mark and liquidation. */
export function validateExitPrices(p:Pick<ExitPosition,'side'|'mark'|'liquidation'>,stop:number|null,tp:number|null){
 const mark=p.mark,sign=p.side==='long'?1:-1;
 if(mark===null||!Number.isFinite(mark)||mark<=0)throw Error('Current price is unavailable. Refresh positions.');
 if(stop!==null){
  if(!Number.isFinite(stop)||stop<=0||(mark-stop)*sign<=0)throw Error('The stop must be on the loss side of the current price.');
  if(p.liquidation!==null){const room=(mark-p.liquidation)*sign;if(!Number.isFinite(room)||room<=0||(mark-stop)*sign>room/2+mark*1e-10)throw Error('Move the stop closer to the current price, before the halfway point to liquidation.');}
 }
 if(tp!==null&&(!Number.isFinite(tp)||tp<=0||(tp-mark)*sign<=0))throw Error('Take-profit must be on the profit side of the current price.');
}
/** Match the crew's 1.2 × hourly ATR and 3:1 target, with a conservative liquidation cap. */
export function planExit(position:ExitPositionInput,orders:ExitOpenOrder[],market?:Snapshot):ExitPosition {
 const size=Math.abs(Number(position.szi)),side=Number(position.szi)>0?'long':'short',sign=side==='long'?1:-1;
 const liquidation=position.liquidationPx===null||Number(position.liquidationPx)===0?null:Number(position.liquidationPx);
 const row:ExitPosition={coin:position.coin,side,size,entry:Number(position.entryPx),liquidation,mark:market?.mark??null,asset:market?.asset??null,szDecimals:market?.szDecimals??null,stopPrice:null,tpPrice:null,distancePct:null,maxLoss:null,tight:false,existing:existingExits(position,orders),error:null};
 try{
  if(!market||[size,row.entry,market.mark,market.atr].some(v=>!Number.isFinite(v)||v<=0)||!Number.isSafeInteger(market.asset)||market.asset<0||!Number.isInteger(market.szDecimals)||market.szDecimals<0||market.szDecimals>6)throw Error('Price history is unavailable. Refresh before adding exits.');
  if(Date.now()-market.timestamp>10000||market.timestamp>Date.now()+1000)throw Error('Prices are out of date. Refresh positions.');
  const room=liquidation===null?Infinity:(market.mark-liquidation)*sign;
  if(!(room>0))throw Error('Liquidation is too close. Review this position on Hyperliquid.');
  const distance=Math.min(1.2*market.atr,room/2);row.tight=distance<1.2*market.atr;
  // Round towards the mark so tick precision cannot move the stop past the cap.
  const rawStop=Number((market.mark-sign*distance).toPrecision(14));
  row.stopPrice=Number(formatPrice(rawStop,market.szDecimals));
  if(side==='long'&&row.stopPrice<rawStop){const tick=Math.max(10**(Math.floor(Math.log10(rawStop))-4),10**(market.szDecimals-6));row.stopPrice=Number(formatPrice(rawStop+tick,market.szDecimals));}
  const roundedDistance=(market.mark-row.stopPrice)*sign;
  row.tpPrice=Number(formatPrice(Number((market.mark+sign*3*roundedDistance).toPrecision(14)),market.szDecimals));
  validateExitPrices(row,row.stopPrice,row.tpPrice);
  row.distancePct=roundedDistance/market.mark*100;row.maxLoss=exitLoss(row.entry,row.stopPrice,size,side);
 }catch(e){row.stopPrice=null;row.tpPrice=null;row.error=(e as Error).message;}
 return row;
}
