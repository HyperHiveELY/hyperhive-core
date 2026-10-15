import {it,expect} from 'vitest';
import {matchesFill,venueEvent} from '../packages/core/matching.js';
import type {SignedSlip} from '../packages/core/proof.js';
const slip={body:{createdAt:10000,order:{market:'BTC',b:true,p:'100',s:'2'}}} as unknown as SignedSlip;
const fill={coin:'BTC',side:'B',px:'99',sz:'1',time:10001,oid:1,tid:1,dir:'Open Long'};
it('matches partial fills but rejects overfills, wrong prices, side, market and backdating',()=>{
 expect(matchesFill(slip,fill,1)).toBe(true);
 for(const f of [{...fill,px:'101'},{...fill,sz:'1.1'},{...fill,coin:'ETH'},{...fill,side:'A'},{...fill,time:8000},{...fill,px:'NaN'}])expect(matchesFill(slip,f,1)).toBe(false);
});
it('requires explicit venue evidence instead of classifying unknown manual fills as liquidation',()=>{
 expect(venueEvent(fill)).toBe(false);expect(venueEvent({...fill,dir:'Auto Deleveraging'})).toBe(true);expect(venueEvent({...fill,liquidation:{}})).toBe(true);
});
it('enforces numeric bounds and both inclusive venue price tolerances',()=>{
 for(const value of ['0','-1','NaN','Infinity']){
  expect(matchesFill(slip,{...fill,sz:value},0)).toBe(false);
  expect(matchesFill(slip,{...fill,px:value},0)).toBe(false);
  expect(matchesFill({...slip,body:{...slip.body,order:{...slip.body.order,s:value}}},fill,0)).toBe(false);
 }
 expect(matchesFill(slip,fill,-.01)).toBe(false);
 expect(matchesFill(slip,fill,Infinity)).toBe(false);
 const sell={...slip,body:{...slip.body,order:{...slip.body.order,b:false}}};
 expect(matchesFill(slip,{...fill,time:9000,px:String(100*(1+1e-9)),sz:String(2*(1+1e-9))},0)).toBe(true);
 expect(matchesFill(sell,{...fill,side:'A',px:String(100*(1-1e-9))},0)).toBe(true);
 expect(matchesFill(sell,{...fill,side:'A',px:'95'},0)).toBe(false);
 expect(matchesFill(sell,{...fill,side:'A',px:'110'},0)).toBe(true);
 expect(venueEvent({...fill,dir:'AutoDeleveraging'})).toBe(true);
});
