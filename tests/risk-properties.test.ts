import {it,expect} from 'vitest';
import fc from 'fast-check';
import {sizeTrade} from '../packages/core/risk.js';
import {market,policy} from './fixtures.js';

it('keeps admitted notional and risk within the signed limits across generated market states',()=>{
 fc.assert(fc.property(fc.integer({min:100,max:10000}),fc.integer({min:100,max:100000}),fc.integer({min:1,max:800}),fc.boolean(),(budget,margin,offset,long)=>{
  const m={...market,timestamp:Date.now()};
  const card={market:m.market,side:long?'long' as const:'short' as const,invalidationPx:m.mark+(long?-offset:offset),horizonH:4,why:'property fixture'};
  const result=sizeTrade({policy:{...policy,weeklyBudget:budget},card,market:m,freeMargin:margin,realizedLoss:0,openRisk:0,positions:0,herdNotional:0,takerFee:.00045,builderFee:.0003});
  expect(result.risk).toBeLessThanOrEqual(budget*.2+1e-7);
  expect(result.notional).toBeLessThanOrEqual(.8*margin*result.leverage+1e-7);
  expect(long?result.stop<m.mark:result.stop>m.mark).toBe(true);
 }),{numRuns:2000,seed:8275353});
});
