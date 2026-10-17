import {describe,it,expect} from 'vitest';
import {sizeTrade,nextExit,type RiskInput} from '../packages/core/risk.js';
import {Card,Policy,verifyPolicy,policyMessage,ZERO,weekStart,type PositionState} from '../packages/core/domain.js';
import {policy,market,wallet,crew} from './fixtures.js';
const input=():RiskInput=>({policy,card:{market:'BTC',side:'long',invalidationPx:59000,horizonH:12,why:'Test'},market:{...market,timestamp:Date.now()},freeMargin:1000,realizedLoss:0,openRisk:0,positions:0,herdNotional:0,takerFee:.00045,builderFee:.0003});
describe('deterministic risk admission',()=>{
 it('bounds risk including fees and rounds sizes down',()=>{const i=input(),s=sizeTrade(i);expect(s.risk).toBeLessThanOrEqual(20);expect(s.notional/s.leverage).toBeLessThanOrEqual(800);expect(s.stop).toBe(59000);expect(s.tp).toBe(63000);expect(s.size).toBeGreaterThan(0);});
 it('decreases leverage as volatility increases',()=>{let prior=Infinity;for(let rv=.05;rv<=2;rv+=.05){const i=input();i.market.rv=rv;const s=sizeTrade(i);expect(s.leverage).toBeLessThanOrEqual(prior);prior=s.leverage;}});
 it.each(['stale','risk','position','herd','invalid','nan','margin','unauthorized'] as const)('fails closed for %s',kind=>{const i=input();if(kind==='stale')i.market.timestamp-=20000;if(kind==='risk')i.realizedLoss=100;if(kind==='position')i.positions=3;if(kind==='herd')i.herdNotional=.01*i.market.oiUsd;if(kind==='invalid')i.card.invalidationPx=61000;if(kind==='nan')i.market.atr=NaN;if(kind==='margin')i.freeMargin=0;if(kind==='unauthorized')i.policy={...policy,markets:['ETH']};expect(()=>sizeTrade(i)).toThrow();});
 it('sizes short positions symmetrically',()=>{const i=input();i.card.side='short';i.card.invalidationPx=61000;const s=sizeTrade(i);expect(s.stop).toBe(61000);expect(s.tp).toBe(57000);});
 it('never increases allocated risk when free margin decreases',()=>{let prior=Infinity;for(const margin of [1000,500,100,50,10]){const i=input();i.freeMargin=margin;const s=sizeTrade(i);expect(s.risk).toBeLessThanOrEqual(prior);prior=s.risk;}});
 it('rejects AI-generated leverage, size and unknown fields',()=>{expect(()=>Card.parse({...input().card,leverage:50})).toThrow();expect(()=>Card.parse({...input().card,size:10})).toThrow();});
});
describe('exit management',()=>{
 const p=():PositionState=>({market:'BTC',side:'long',entry:60000,size:.01,stop:59000,tp:63000,extreme:60000,openedAt:Date.now(),horizonH:4,entryDigest:ZERO,lastModify:0,fundingStart:0,fundingPaid:0,risk:10});
 it('closes at the horizon without AI or subscription input',()=>{const state=p();state.openedAt-=5*3600000;expect(nextExit(state,market).close).toMatch(/horizon/);});
 it('closes on excess paid funding',()=>{const state=p();state.fundingPaid=3;expect(nextExit(state,market).close).toMatch(/Funding/);});
 it('trails profitable longs without loosening the stop',()=>{const state=p();const result=nextExit(state,{...market,mark:62500});expect(result.stop).toBeGreaterThan(state.stop);expect(result.stop).toBeGreaterThan(60000);});
 it('trails profitable shorts in the opposite direction',()=>{const state=p();state.side='short';state.stop=61000;const result=nextExit(state,{...market,mark:57500});expect(result.stop).toBeLessThan(60000);});
 it('throttles repeated stop modifications',()=>{const state=p();state.lastModify=Date.now();expect(nextExit(state,{...market,mark:62500}).stop).toBeUndefined();});
});
describe('signed policy',()=>{
 it('binds account, market, budget, expiry, and network',async()=>{const c=await crew();expect(await verifyPolicy(c.policy,c.signature)).toBe(true);for(const change of [{weeklyBudget:1000},{account:'0x1111111111111111111111111111111111111111'},{markets:['SOL']}])expect(await verifyPolicy({...policy,...change} as Policy,c.signature)).toBe(false);});
 it('expired authorization prevents entries but preserves signature validation for exits',async()=>{const p={...policy,issuedAt:Date.now()-200000,expiresAt:Date.now()-100000};const sig=await wallet.signMessage({message:policyMessage(p)});expect(await verifyPolicy(p,sig)).toBe(false);expect(await verifyPolicy(p,sig,Date.now(),true)).toBe(true);});
 it('uses Monday UTC weekly boundaries',()=>expect(new Date(weekStart(Date.parse('2026-11-15T23:59:59Z'))).toISOString()).toBe('2026-11-09T00:00:00.000Z'));
});
describe('risk boundaries for venue admission',()=>{
 it('prices the actual rounded position, fees and remaining weekly allowance',()=>{
  const i=input();i.openRisk=85;i.realizedLoss=5;
  const s=sizeTrade(i);
  expect(s.size).toBe(.00917);
  expect(s.notional).toBeCloseTo(.00917*60000,8);
  expect(s.risk).toBeCloseTo(.00917*(1000+90),8);
  expect(s.distance).toBe(1000);
  i.openRisk=95;expect(()=>sizeTrade(i)).toThrow('Weekly risk budget');
 });
 it('uses market-specific leverage and ATR floors and rejects excessive liquidation distance',()=>{
  const i=input();i.market.rv=.01;i.card.invalidationPx=59999;
  expect(sizeTrade(i)).toMatchObject({distance:360,leverage:5,tp:61080,stop:59640});
  i.market={...i.market,market:'SOL'};i.card.market='SOL';i.policy={...i.policy,markets:['SOL']};
  expect(sizeTrade(i).leverage).toBe(3);i.market.maxLeverage=2;expect(sizeTrade(i).leverage).toBe(2);
  i.card.invalidationPx=49000;expect(sizeTrade(i).leverage).toBe(1);
  i.card.invalidationPx=30000;expect(()=>sizeTrade(i)).toThrow('liquidation distance');
 });
 it('accepts the freshness boundary and rejects invalid prices, timestamps and leverage inputs',()=>{
  const i=input();i.now=123456;
  for(const offset of [-10000,1000]){i.market.timestamp=i.now+offset;expect(sizeTrade(i).size).toBeGreaterThan(0);}
  for(const offset of [-10001,1001,NaN]){i.market.timestamp=i.now+offset;expect(()=>sizeTrade(i)).toThrow();}
  i.market.timestamp=i.now;
  for(const prop of ['mark','atr','oiUsd','rv','maxLeverage'] as const)expect(()=>sizeTrade({...i,market:{...i.market,[prop]:0}})).toThrow();
  for(const side of ['long','short'] as const)expect(()=>sizeTrade({...i,card:{...i.card,side,invalidationPx:i.market.mark}})).toThrow('wrong side');
  expect(()=>sizeTrade({...i,positions:3})).toThrow('Position limit');expect(()=>sizeTrade({...i,policy:{...i.policy,plan:'pro'},positions:5})).toThrow('Position limit');
 });
 it('selects the exact long and short trailing thresholds and cooldowns',()=>{
  const p:PositionState={market:'BTC',side:'long',entry:100,size:1,stop:95,tp:130,extreme:100,openedAt:0,horizonH:4,entryDigest:ZERO,lastModify:0,fundingStart:0,fundingPaid:0,risk:10};
  for(const side of ['long','short'] as const){
   const sign=side==='long'?1:-1,pos={...p,side,stop:100-sign*5};
   const exit=(gain:number,atr:number,now=30000)=>nextExit(pos,{...market,mark:100+gain*sign,atr},now);
   expect(exit(2.99,3).stop).toBeUndefined();expect(exit(3,3).stop).toBeCloseTo(100+sign*.2);
   expect(exit(4,.5).stop).toBeCloseTo(100+sign*3.25);
   expect(exit(20,10).stop).toBeCloseTo(100+sign*12);
   expect(exit(20,10,29999).stop).toBeUndefined();
   expect(exit(0,1,4*3600000).close).toContain('Time');
   expect(nextExit({...pos,fundingPaid:2.5},market,30000).close).toBeUndefined();
   expect(nextExit({...pos,fundingPaid:2.51},market,30000).close).toContain('Funding');
  }
 });
});
