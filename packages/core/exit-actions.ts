import type {PositionState,Snapshot} from './domain.js';
/** Compute a permitted exposure reduction subject to the position size and skim cooldown. */
export function adlSkimSize(position:PositionState,market:Snapshot,accountValue:number,lastSkim:number,now=Date.now()){
 const sign=position.side==='long'?1:-1;
 if(accountValue<=0||!Number.isFinite(accountValue)||(market.mark-position.entry)*sign<=0||now-lastSkim<4*3600000)return 0;
 const pressure=market.mark/position.entry*(position.size*market.mark/accountValue);
 if(pressure<2)return 0;
 const size=Math.floor(position.size*.25*10**market.szDecimals)/10**market.szDecimals;
 return size*market.mark>=10?size:0;
}
