import type {SignedSlip} from './proof.js';
export interface PublicFill {coin:string;side:string;px:string;sz:string;time:number;oid:number;tid:number|string;dir:string;liquidation?:unknown;hash?:string}
/** Check venue market, side, time, price and cumulative size against the signed intent. */
export function matchesFill(slip:SignedSlip,fill:PublicFill,alreadyFilled:number){
 const o=slip.body.order,price=Number(fill.px),size=Number(fill.sz),limit=Number(o.p),maximum=Number(o.s);
 if(![price,size,limit,maximum,alreadyFilled].every(Number.isFinite)||price<=0||size<=0||maximum<=0||alreadyFilled<0)return false;
 return o.market===fill.coin&&o.b===(fill.side==='B')&&fill.time>=slip.body.createdAt-1000
   &&alreadyFilled+size<=maximum*(1+1e-9)
   &&(o.b===true?price<=limit*(1+1e-9):price>=limit*(1-1e-9));
}
/** Recognize liquidation and auto-deleveraging fills produced by the venue itself. */
export function venueEvent(fill:PublicFill){return Boolean(fill.liquidation)||/liquidat|auto.?deleverag/i.test(fill.dir);}
