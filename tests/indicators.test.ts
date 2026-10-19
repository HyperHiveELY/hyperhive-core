import {expect,it} from 'vitest';
import {adx,atr,bollinger,donchian,ema,macd,relativeVolume,rsi,sma,volumeZ} from '../packages/eko/indicators.js';

const prices=Array.from({length:80},(_,i)=>100+i);
const bars=prices.map((close,i)=>({time:i*60,open:close,high:close+1,low:close-1,close,volume:10+i}));

it('preserves point-in-time signals when later bars arrive',()=>{
 for(const indicator of [sma,ema,rsi]){
  expect(indicator(prices,5).slice(0,50)).toEqual(indicator(prices.slice(0,50),5));
 }
 for(const indicator of [atr,adx,relativeVolume,volumeZ]){
  expect(indicator(bars,5).slice(0,50)).toEqual(indicator(bars.slice(0,50),5));
 }
 const baseline=macd(prices.slice(0,50));
 for(const key of ['macd','signal','histogram'] as const){
  expect(macd(prices)[key].slice(0,50)).toEqual(baseline[key]);
 }
});
it('computes trend, volatility and liquidity indicators against hand-calculated samples',()=>{
 expect(sma(prices,5)[4]).toBe(102);expect(ema(prices,5)[5]).toBeCloseTo(103);
 expect(rsi(prices,5).at(-1)).toBe(100);expect(rsi([...prices].reverse(),5).at(-1)).toBe(0);
 expect(adx(bars,5).at(-1)).toBe(100);expect(atr(bars,5).at(-1)).toBe(2);
 expect(donchian(bars,3).upper[3]).toBe(103);expect(donchian(bars,3).lower[3]).toBe(99);
 expect(relativeVolume(bars,3)[3]).toBeCloseTo(13/11);expect(volumeZ(bars,3)[3]).toBeCloseTo(2/Math.sqrt(2/3));
 const band=bollinger(prices,3);
 expect(band.middle[2]).toBe(101);expect(band.upper[2]).toBeCloseTo(101+2*Math.sqrt(2/3));
 expect(macd(prices).histogram.at(-1)).toBeCloseTo(0);
});
