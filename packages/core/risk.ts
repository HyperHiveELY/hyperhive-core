import type { Card, Policy, Snapshot, PositionState } from './domain.js';
export interface RiskInput {policy:Policy;card:Card;market:Snapshot;freeMargin:number;realizedLoss:number;openRisk:number;positions:number;herdNotional:number;takerFee:number;builderFee:number;now?:number}
export interface Sizing {size:number;leverage:number;stop:number;tp:number;risk:number;notional:number;distance:number}
/** Size an entry within signed budget, margin, volatility and exposure constraints. */
export function sizeTrade(i:RiskInput):Sizing {
  const {policy:p,card:c,market:m}=i;
  const finite=[m.mark,m.atr,m.rv,m.oiUsd,i.freeMargin,i.realizedLoss,i.openRisk,i.herdNotional,i.takerFee,i.builderFee];
  if(finite.some(x=>!Number.isFinite(x)||x<0)||m.mark<=0||m.atr<=0||m.rv<=0||m.oiUsd<=0)throw Error('Invalid or unavailable risk inputs');
  if(!Number.isSafeInteger(m.szDecimals)||m.szDecimals<0||m.szDecimals>8||!Number.isSafeInteger(m.maxLeverage)||m.maxLeverage<1)throw Error('Invalid venue sizing limits');
  if(!Number.isFinite(m.timestamp)||(i.now??Date.now())-m.timestamp>10000 || m.timestamp>(i.now??Date.now())+1000)throw Error('Market data is stale');
  if(!p.markets.includes(c.market)||c.market!==m.market)throw Error('Market is outside signed policy');
  if((c.side==='long'&&c.invalidationPx>=m.mark)||(c.side==='short'&&c.invalidationPx<=m.mark))throw Error('Invalidation is on the wrong side');
  if(i.positions>=(p.plan==='pro'?5:3))throw Error('Position limit reached');
  const remaining=p.weeklyBudget-i.realizedLoss-i.openRisk;
  const risk=Math.min(.2*p.weeklyBudget,remaining);
  if(risk<=0)throw Error('Weekly risk budget exhausted');
  const distance=Math.max(Math.abs(m.mark-c.invalidationPx),1.2*m.atr);
  const cap=Math.min(['BTC','ETH'].includes(m.market)?5:3,m.maxLeverage);
  let leverage=Math.max(1,Math.min(cap,Math.floor(.60/m.rv)));
  // Conservative margin distance reserve for maintenance requirements, fees and price movement.
  while(leverage>1 && m.mark*(1/leverage-.10)<2.5*distance)leverage--;
  if(m.mark*(1/leverage-.10)<2.5*distance)throw Error('Insufficient liquidation distance');
  let size=risk/(distance+2*m.mark*(i.takerFee+i.builderFee));
  size=Math.min(size,.8*i.freeMargin*leverage/m.mark,Math.max(0,.01*m.oiUsd-i.herdNotional)/m.mark);
  size=Math.floor((size+Number.EPSILON)*10**m.szDecimals)/10**m.szDecimals;
  if(size*m.mark<10)throw Error('Sized order is below exchange minimum');
  const sign=c.side==='long'?1:-1;
  const stop=m.mark-sign*distance,tp=m.mark+sign*3*distance;
  if(stop<=0||tp<=0)throw Error('Invalid bracket price');
  return {size,leverage,stop,tp,risk:size*(distance+2*m.mark*(i.takerFee+i.builderFee)),notional:size*m.mark,distance};
}
/** Evaluate a managed position's time, price, trailing and risk exit rules against a fresh snapshot. */
export function nextExit(p:PositionState,m:Snapshot,now=Date.now()):{close?:string;stop?:number;extreme:number} {
  const sign=p.side==='long'?1:-1;
  const extreme=sign===1?Math.max(p.extreme,m.mark):Math.min(p.extreme,m.mark);
  const mfe=(extreme-p.entry)*sign;
  if(now-p.openedAt>=p.horizonH*3600000)return {close:'Time horizon reached',extreme};
  if(p.fundingPaid>.25*p.risk)return {close:'Funding limit reached',extreme};
  let stop=p.stop;
  if(mfe/p.entry>=.03){const be=p.entry*(1+sign*.002); const trail=extreme-sign*1.5*m.atr; stop=sign===1?Math.max(stop,be,trail):Math.min(stop,be,trail);}
  if(mfe>=2*p.risk/p.size){const trail=p.entry+sign*.6*mfe;stop=sign===1?Math.max(stop,trail):Math.min(stop,trail);}
  return {extreme,...(Math.abs(stop-p.stop)>=.25*m.atr&&now-p.lastModify>=30000?{stop}:{})};
}
