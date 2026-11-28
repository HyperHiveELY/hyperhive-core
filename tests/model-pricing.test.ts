import {describe,it,expect} from 'vitest';
import {creditsToUsdc,formatHype,hypeQuoteFromMarkets,usdcToHype,HYPE_QUOTE_MAX_AGE} from '../apps/web/src/dashboard/model-pricing.js';
describe('model estimates in Elysium native HYPE',()=>{
 const now=100000,quote={usdcPerHype:50,at:now};
 it('converts credits through their USDC value and the current HYPE price',()=>{expect(creditsToUsdc(1000)).toBe(1);expect(usdcToHype(creditsToUsdc(5),quote,now)).toBe(.0001);expect(formatHype(.0001)).toBe('0.0001');});
 it('uses HYPE rather than another market and rejects missing or invalid prices',()=>{expect(hypeQuoteFromMarkets([{name:'BTC',midPx:'1000'},{name:'HYPE',midPx:'50',markPx:'51'}],now)).toEqual(quote);expect(hypeQuoteFromMarkets([{name:'HYPE',markPx:'50'}],now)).toEqual(quote);for(const midPx of ['0','-1','NaN','Infinity'])expect(hypeQuoteFromMarkets([{name:'HYPE',midPx}],now)).toBeNull();expect(hypeQuoteFromMarkets([],now)).toBeNull();});
 it('never substitutes a rate when a quote is missing, expired or from the future',()=>{expect(usdcToHype(1,null,now)).toBeNull();expect(usdcToHype(1,quote,now+HYPE_QUOTE_MAX_AGE)).toBeNull();expect(usdcToHype(1,quote,now-1)).toBeNull();expect(usdcToHype(1,{...quote,usdcPerHype:0},now)).toBeNull();});
 it('does not make very small paid calls look free',()=>{expect(formatHype(.00000001)).toBe('0.00000001');expect(formatHype(.000000001)).toBe('<0.00000001');expect(formatHype(0)).toBe('0.00');expect(formatHype(NaN)).toBe('—');});
 it('adds the pair in one currency and rejects invalid usage',()=>{expect(usdcToHype(creditsToUsdc(4.35+2.36),quote,now)).toBeCloseTo(.0001342);expect(usdcToHype(-1,quote,now)).toBeNull();expect(usdcToHype(NaN,quote,now)).toBeNull();});
});
