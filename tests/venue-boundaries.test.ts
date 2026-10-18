import {afterEach,expect,it,vi} from 'vitest';
import {markets,snapshot,accountState,allFills,info} from '../packages/core/venue.js';
import {paperSnapshot} from '../packages/paper/feed.js';
import {wallet} from './fixtures.js';
afterEach(()=>vi.restoreAllMocks());
it('uses closed bars for both feeds and retains exit snapshots outside the entry universe',async()=>{
 const names=['AAA','BBB','OLD'];
 vi.spyOn(info,'metaAndAssetCtxs').mockResolvedValue([{universe:names.map(name=>({name,szDecimals:2,maxLeverage:10,isDelisted:name==='OLD'}))},names.map((_,i)=>({markPx:'100',openInterest:'20',funding:'0.001',dayNtlVlm:String(i+1)}))] as any);
 const now=Date.now();const bars=Array.from({length:80},(_,i)=>({t:now-(81-i)*60000,T:now-(80-i)*60000,o:'100',c:String(100+i),h:String(101+i),l:String(99+i),v:'50'}));
 const candles=vi.spyOn(info,'candleSnapshot').mockResolvedValue([...bars,{...bars[0],T:now+60000,c:'999999'}].reverse() as any);
 vi.spyOn(info,'allMids').mockResolvedValue({OLD:'117',AAA:'100'});
 expect((await markets()).map(x=>x.name)).toEqual(['BBB','AAA']);
 const live=await snapshot('OLD');expect(live).toMatchObject({mark:117,asset:2,oiUsd:2000,closes:bars.map(c=>+c.c)});
 const paper=await paperSnapshot('OLD');expect(paper.hourly).toHaveLength(80);expect(paper.atr).toBe(live.atr);
 await paperSnapshot('OLD');expect(candles).toHaveBeenCalledTimes(3);
 await expect(snapshot('MISSING')).rejects.toThrow('unavailable');
 candles.mockResolvedValueOnce([]);await expect(snapshot('AAA')).rejects.toThrow('Insufficient');expect((await snapshot('AAA')).mark).toBe(100);
});
it('deduplicates the inclusive fill cursor, detects truncation and preserves account identity',async()=>{
 const page=Array.from({length:2000},(_,i)=>({tid:i,time:i+1}));const read=vi.spyOn(info,'userFillsByTime').mockResolvedValueOnce(page as any).mockResolvedValueOnce([page[1999],{tid:2000,time:2001}] as any);
 expect(await allFills(wallet.address,1,4000)).toHaveLength(2001);
 expect(read.mock.calls[1][0]).toMatchObject({startTime:2000,endTime:4000,user:wallet.address});
 read.mockResolvedValue(Array(2000).fill({time:1,tid:1}));await expect(allFills(wallet.address,1)).rejects.toThrow('advance');
 read.mockImplementation(async({startTime})=>Array.from({length:Number(startTime)>=10000?1:2000},(_,i)=>({time:Number(startTime)+i+1,tid:Number(startTime)+i})) as any);
 await expect(allFills(wallet.address,1)).rejects.toThrow('retention');
 const state={assetPositions:[]};vi.spyOn(info,'clearinghouseState').mockResolvedValue(state as any);expect(await accountState(wallet.address)).toEqual(state);
});
