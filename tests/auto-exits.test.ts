import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {Database} from '../packages/core/db.js';
import {createServer} from '../apps/api/server.js';
import {dashboard} from '../apps/api/dashboard.js';
import {accountState,info,snapshot} from '../packages/core/venue.js';
import {existingExits,planExit,validateExitPrices,type ExitOpenOrder} from '../packages/core/auto-exits.js';
import {market,wallet} from './fixtures.js';
vi.mock('../packages/core/venue.js',async original=>({...await original<typeof import('../packages/core/venue.js')>(),accountState:vi.fn(),snapshot:vi.fn(),info:{frontendOpenOrders:vi.fn(),metaAndAssetCtxs:vi.fn()}}));
const position={coin:'BTC',szi:'2',entryPx:'100',liquidationPx:'80'};
const snap=()=>({...market,mark:100,atr:2,szDecimals:2,timestamp:Date.now()});
const stop=(overrides:Partial<ExitOpenOrder>={}):ExitOpenOrder=>({coin:'BTC',oid:10,side:'A',reduceOnly:true,isTrigger:true,orderType:'Stop Market',triggerPx:'98',sz:'2',isPositionTpsl:false,...overrides});
describe('auto exit prices',()=>{
 it('uses hourly ATR and a three-distance target from mark, with entry-based loss',()=>{
  const p=planExit(position,[],snap());expect(p).toMatchObject({side:'long',stopPrice:97.6,tpPrice:107.2,tight:false,error:null});expect(p.distancePct).toBeCloseTo(2.4);expect(p.maxLoss).toBeCloseTo(4.8);
  expect(planExit({...position,entryPx:'90'},[],snap()).maxLoss).toBe(0);
 });
 it('mirrors stops, targets and loss for short positions',()=>{
  const p=planExit({...position,szi:'-2',liquidationPx:'120'},[],snap());expect(p).toMatchObject({side:'short',stopPrice:102.4,tpPrice:92.8,error:null});expect(p.maxLoss).toBeCloseTo(4.8);
 });
 it('caps high volatility stops halfway to liquidation on either side',()=>{
  expect(planExit(position,[],{...snap(),atr:20})).toMatchObject({stopPrice:90,tpPrice:130,tight:true,error:null});
  expect(planExit({...position,szi:'-2',liquidationPx:'120'},[],{...snap(),atr:20})).toMatchObject({stopPrice:110,tpPrice:70,tight:true,error:null});
  expect(planExit(position,[],{...snap(),atr:12})).toMatchObject({stopPrice:90,tight:true});
 });
 it('keeps rounding on the safe side of the liquidation cap',()=>{
  const p=planExit({...position,liquidationPx:'80.12345'},[],{...snap(),atr:30});expect(p.error).toBeNull();expect(p.stopPrice!).toBeGreaterThanOrEqual(90.061725);
 });
 it('leaves any existing closing-side stop and take-profit in place, including partial orders',()=>{
  const found=existingExits(position,[stop({sz:'.5'}),stop({oid:11,orderType:'Take Profit Limit',triggerPx:'108'}),stop({oid:12,reduceOnly:false}),stop({oid:13,side:'B'}),stop({oid:14,isTrigger:false}),stop({oid:15,coin:'ETH'})]);
  expect(found.sl.map(o=>o.oid)).toEqual([10]);expect(found.tp.map(o=>o.oid)).toEqual([11]);expect(found.sl[0].size).toBe(.5);
 });
 it('fails closed on unavailable, stale, non-finite or untradeable prices',()=>{
  for(const m of [undefined,{...snap(),atr:0},{...snap(),mark:NaN},{...snap(),timestamp:Date.now()-11000},{...snap(),atr:1000}])expect(planExit({...position,liquidationPx:null},[],m).error).toBeTruthy();
  expect(planExit({...position,liquidationPx:'101'},[],snap()).error).toBeTruthy();
  expect(planExit({...position,liquidationPx:'NaN'},[],snap()).error).toBeTruthy();
  expect(planExit({...position,liquidationPx:null},[],snap()).error).toBeNull();
 });
 it('rejects edits through mark, liquidation, or zero while permitting either missing leg',()=>{
  const p=planExit(position,[],snap());
  for(const [sl,tp] of [[100,110],[80,110],[95,99],[0,110],[NaN,110],[89,110]])expect(()=>validateExitPrices(p,sl,tp)).toThrow();
  expect(()=>validateExitPrices(p,95,null)).not.toThrow();expect(()=>validateExitPrices(p,null,110)).not.toThrow();
 });
});
describe('owner exit routes',()=>{
 let db:Database,app:Awaited<ReturnType<typeof createServer>>;
 const owner=wallet.address.toLowerCase(),session='auto-exits-test-session',headers={cookie:`hh_session=${session}`,origin:'http://localhost:5188'};
 beforeAll(async()=>{
  db=await new Database('memory').init();app=await createServer(db);
  await db.query('INSERT INTO sessions VALUES($1,$2,$3)',[createHash('sha256').update(session).digest('hex'),owner,Date.now()+60000]);
 });
 afterAll(async()=>{await app.close();await db.close();});
 beforeEach(()=>{
  vi.mocked(accountState).mockReset().mockResolvedValue({assetPositions:[{position}],marginSummary:{},withdrawable:'0'} as any);
  vi.mocked(snapshot).mockReset().mockImplementation(async coin=>({...snap(),market:coin}));
  vi.mocked(info.frontendOpenOrders).mockReset().mockResolvedValue([]);
  vi.mocked(info.metaAndAssetCtxs).mockReset().mockResolvedValue([{universe:[{name:'BTC',szDecimals:2},{name:'ETH',szDecimals:2}]},[{markPx:'101'},{markPx:'100'}]] as any);
 });
 it('requires owner authentication before any venue request',async()=>{
  expect((await app.inject({url:'/api/exits/plan'})).statusCode).toBe(401);
  expect((await app.inject({method:'POST',url:'/api/exits/placed',headers:{origin:headers.origin},payload:{orders:[]}})).statusCode).toBe(401);
  expect(accountState).not.toHaveBeenCalled();
 });
 it('plans the signed-in wallet, filters coins and uses the actual mark',async()=>{
  vi.mocked(accountState).mockResolvedValue({assetPositions:[{position},{position:{...position,coin:'ETH'}},{position:{...position,coin:'SOL',szi:'0'}}]} as any);
  const r=await app.inject({url:'/api/exits/plan?coins=btc',headers});expect(r.statusCode).toBe(200);expect(r.json().owner).toBe(owner);expect(r.json().positions).toHaveLength(1);expect(r.json().positions[0].mark).toBe(101);expect(accountState).toHaveBeenCalledWith(owner);expect(info.frontendOpenOrders).toHaveBeenCalledWith({user:owner});
 });
 it('rejects account overrides and malformed filters',async()=>{
  for(const path of ['?owner=0x123','?coins=BTC,,ETH','?coins=<script>'])expect((await app.inject({url:'/api/exits/plan'+path,headers})).statusCode).toBe(400);
  expect(accountState).not.toHaveBeenCalled();
 });
 it('returns a visible per-position error when hourly history fails',async()=>{
  vi.mocked(snapshot).mockRejectedValue(Error('offline'));const r=await app.inject({url:'/api/exits/plan',headers});expect(r.statusCode).toBe(200);expect(r.json().positions[0]).toMatchObject({stopPrice:null,tpPrice:null});expect(r.json().positions[0].error).toBeTruthy();
 });
 it('returns an error instead of an empty list when the venue is unavailable',async()=>{
  vi.mocked(accountState).mockRejectedValue(Error('offline'));expect((await app.inject({url:'/api/exits/plan',headers})).statusCode).toBe(502);
 });
 it('records verified exits once and keeps owner activity private',async()=>{
  const cloid='0x'+'a'.repeat(32);vi.mocked(info.frontendOpenOrders).mockResolvedValue([stop({cloid})] as any);
  const request={method:'POST' as const,url:'/api/exits/placed',headers,payload:{orders:[{coin:'BTC',oid:10,cloid}]}};
  expect((await app.inject(request)).statusCode).toBe(200);expect((await app.inject(request)).statusCode).toBe(200);
  expect((await db.query('SELECT * FROM auto_exit_events')).rows).toHaveLength(1);
  expect((await dashboard(db,owner)).activity[0].title).toBe('Auto exits added to BTC');
  expect((await dashboard(db,'0x'+'1'.repeat(40))).activity).toEqual([]);
 });
 it('rejects fabricated order reports and foreign-origin writes',async()=>{
  const payload={orders:[{coin:'ETH',oid:99,cloid:'0x'+'b'.repeat(32)}]};
  expect((await app.inject({method:'POST',url:'/api/exits/placed',headers,payload})).statusCode).toBe(400);
  expect((await app.inject({method:'POST',url:'/api/exits/placed',headers:{...headers,origin:'https://untrusted.invalid'},payload})).statusCode).toBe(400);
 });
 it('bounds private plan refreshes per owner',async()=>{
  const codes=[];for(let i=0;i<21;i++)codes.push((await app.inject({url:'/api/exits/plan',headers})).statusCode);expect(codes).toContain(429);
 });
});
