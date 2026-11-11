import {describe,it,expect} from 'vitest';
import {normalizeMarkets,eligibleNativeMarkets,numeric,matchesMarket} from '../apps/web/src/dashboard/trading/catalog.js';
describe('read-only Hyperliquid discovery',()=>{
 it('retains every native market without renumbering or limiting discovery',()=>{
  const all=normalizeMarkets([{universe:Array.from({length:75},(_,i)=>({name:'COIN'+i,isDelisted:i===74}))},Array.from({length:75},(_,i)=>({markPx:'1',prevDayPx:'2',dayNtlVlm:String(100-i)}))],'Perps');
  expect(all).toHaveLength(75);expect(all[74].delisted).toBe(true);
  const labeled=eligibleNativeMarkets(all);expect(labeled).toHaveLength(75);expect(labeled.filter(m=>m.eligible)).toHaveLength(30);expect(labeled[74].eligible).toBe(false);
 });
 it('keeps spot token identities, uses token indexes and aligns contexts by coin',()=>{
  const [m]=normalizeMarkets([{tokens:[{index:7,name:'HYPE',fullName:'Hyperliquid'},{index:0,name:'USDC'}],universe:[{name:'@42',tokens:[7,0],index:42}]},[{coin:'@wrong',markPx:'5'},{coin:'@42',markPx:'60',prevDayPx:'50',dayNtlVlm:'100'}]],'Spot');
  expect(m).toMatchObject({coin:'@42',symbol:'HYPE',label:'HYPE/USDC',fullName:'Hyperliquid',price:60,kind:'Spot',eligible:false});expect(m.change).toBeCloseTo(20);
 });
 it('keeps builder namespaces distinct even when symbols match',()=>{
  const a=normalizeMarkets([{universe:[{name:'xyz:BTC'}]},[{markPx:'60000'}]],'HIP-3','xyz')[0];
  const b=normalizeMarkets([{universe:[{name:'cash:BTC'}]},[{markPx:'60000'}]],'HIP-3','cash')[0];
  expect(a.id).not.toBe(b.id);expect(a.coin).toBe('xyz:BTC');expect(a.symbol).toBe('BTC');expect(eligibleNativeMarkets([a,b]).every(m=>!m.eligible)).toBe(true);
 });
 it('does not turn missing or invalid quotes into zeros',()=>{
  expect(numeric(null)).toBeNull();expect(numeric('')).toBeNull();expect(numeric('NaN')).toBeNull();expect(numeric('0')).toBe(0);
  const [m]=normalizeMarkets([{universe:[{name:'X'}]},[]],'Perps');expect(m.price).toBeNull();expect(m.change).toBeNull();expect(m.interest).toBeNull();expect(eligibleNativeMarkets([m])[0].eligible).toBe(false);
 });
 it('rejects malformed catalog responses instead of inventing markets',()=>{expect(()=>normalizeMarkets({},'Perps')).toThrow('Invalid market catalog response');});
});

it('searching HYPE does not match the shared Hyperliquid venue name',()=>{const [btc,hype]=normalizeMarkets([{universe:[{name:'BTC'},{name:'HYPE'}]},[{},{}]],'Perps');expect(matchesMarket(btc,'HYPE')).toBe(false);expect(matchesMarket(hype,' hype ')).toBe(true);});

import {periodVolume} from '../apps/web/src/dashboard/trading/volume.js';
import {projectFor,HYPE_TOKEN_ID,coinLogo} from '../apps/web/src/dashboard/trading/market-identity.js';
describe('market context and volume periods',()=>{
 const [hype]=normalizeMarkets([{universe:[{name:'HYPE',maxLeverage:10}]},[{markPx:'60',oraclePx:'61',dayNtlVlm:'1234',dayBaseVlm:'20'}]],'Perps');
 const now=100*3600000+1800000;
 const candles=Array.from({length:73},(_,i)=>({t:(28+i)*3600000,v:'2',c:'10'}));
 it('uses venue totals for rolling 24h instead of candle estimates',()=>{
  expect(periodVolume(hype,candles,'24h',now)).toMatchObject({quote:1234,base:20,estimated:false});
  expect(hype).toMatchObject({maxLeverage:10,oracle:61});
 });
 it('uses distinct hourly buckets and labels partial-hour quote estimates',()=>{
  expect(periodVolume(hype,candles,'1h',now)).toMatchObject({quote:20,base:2,observations:1,complete:true,estimated:true});
  expect(periodVolume(hype,candles,'6h',now)).toMatchObject({quote:120,base:12,observations:6});
  expect(periodVolume(hype,candles,'72h',now)).toMatchObject({quote:1440,observations:72});
 });
 it('deduplicates bars and excludes invalid, future and out-of-window data',()=>{
  const recent=candles.at(-1)!;
  expect(periodVolume(hype,[recent,recent,{t:101*3600000,v:'10',c:'10'},{t:99*3600000,v:'-1',c:'10'}],'6h',now)).toMatchObject({quote:20,observations:1,complete:false});
  expect(periodVolume(hype,[],'1h',now).quote).toBeNull();
 });
 it('does not give a same-symbol spot or builder market the native project links',()=>{
  const [fake]=normalizeMarkets([{tokens:[{index:0,name:'HYPE',tokenId:'different'},{index:1,name:'USDC'}],universe:[{name:'@999',tokens:[0,1]}]},[]],'Spot');
  expect(projectFor(hype)?.name).toBe('Hyperliquid');expect(projectFor(fake)).toBeUndefined();
  expect(projectFor({...fake,tokenId:HYPE_TOKEN_ID})?.name).toBe('Hyperliquid');
  expect(projectFor({...hype,kind:'HIP-3',coin:'xyz:HYPE'})).toBeUndefined();
 });
 it('keeps logo requests venue-specific and spot-specific',()=>{
  expect(coinLogo(hype)).toBe('https://app.hyperliquid.xyz/coins/HYPE.svg');
  expect(coinLogo({...hype,kind:'Spot',tokenId:HYPE_TOKEN_ID})).toContain('HYPE_spot.svg');
  expect(coinLogo({...hype,kind:'HIP-3',coin:'xyz:NVDA'})).toContain('xyz%3ANVDA.svg');
 });
});
