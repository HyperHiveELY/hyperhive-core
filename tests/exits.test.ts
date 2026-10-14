import {it,expect} from 'vitest';
import {adlSkimSize} from '../packages/core/exit-actions.js';
import {market} from './fixtures.js';
import {ZERO,type PositionState} from '../packages/core/domain.js';
const p:PositionState={market:'BTC',side:'long',entry:50000,size:.1,stop:49000,tp:53000,extreme:51000,openedAt:0,horizonH:24,entryDigest:ZERO,lastModify:0,fundingStart:0,fundingPaid:0,risk:100};
it('limits profitable high-exposure skims to 25% and once per four hours',()=>{
 expect(adlSkimSize(p,{...market,mark:51000},1000,0,20000000)).toBe(.025);
 expect(adlSkimSize(p,{...market,mark:51000},1000,19000000,20000000)).toBe(0);
 expect(adlSkimSize(p,{...market,mark:49000},1000,0,20000000)).toBe(0);
 expect(adlSkimSize(p,{...market,mark:51000},10000,0,20000000)).toBe(0);
});
