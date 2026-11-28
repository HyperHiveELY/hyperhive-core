import {beforeAll,afterAll,beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Database,reserveScanCall,settleScanCall} from '../packages/core/db.js';
import {config} from '../packages/core/config.js';
import {ChatCompletionsProvider} from '../packages/ai/chat.js';
import {scanMarket} from '../packages/ai/scan.js';
import {createScanner} from '../apps/api/scan.js';
import {createServer} from '../apps/api/server.js';
import {market as fixture} from './fixtures.js';
import {markets,snapshot} from '../packages/core/venue.js';
import {ppqKey} from '../packages/core/secrets.js';
import {validateModels} from '../packages/ai/models.js';

vi.mock('../packages/core/secrets.js',async original=>({...await original<typeof import('../packages/core/secrets.js')>(),ppqKey:vi.fn(async():Promise<string|undefined>=> 'test-only-key'),modelSettings:vi.fn(async()=>({scout:'test/scout',skeptic:'test/skeptic'}))}));
vi.mock('../packages/core/venue.js',async original=>({...await original<typeof import('../packages/core/venue.js')>(),markets:vi.fn(),snapshot:vi.fn()}));
vi.mock('../packages/ai/models.js',async original=>({...await original<typeof import('../packages/ai/models.js')>(),validateModels:vi.fn()}));
let db:Database;
const original={enabled:config.SCAN_ENABLED,budget:config.SCAN_DAILY_BUDGET_USD,ceiling:config.PPQ_CALL_CEILING_USD};
const pricing={type:'per_token',currency:'USD',input_per_1M_tokens:.1,output_per_1M_tokens:.2};
const model=(id:string)=>({id,name:id,owned_by:id,type:'chat',supported_parameters:[],pricing});
const card={market:'BTC',side:'long',invalidationPx:59000,horizonH:24,why:'Price is holding above its recent low.'};
const result=(output:unknown)=>({output,model:'test/model',inputTokens:100,outputTokens:50,latencyMs:10,costUsd:null});
const infer=()=>vi.spyOn(ChatCompletionsProvider.prototype,'infer').mockResolvedValueOnce(result({card})).mockResolvedValueOnce(result({verdict:'PASS',reasons:['The exit price leaves room for normal price moves.']}));
beforeAll(async()=>{db=await new Database('memory').init();});
afterAll(async()=>{Object.assign(config,{SCAN_ENABLED:original.enabled,SCAN_DAILY_BUDGET_USD:original.budget,PPQ_CALL_CEILING_USD:original.ceiling});await db.close();});
beforeEach(async()=>{
 vi.restoreAllMocks();config.SCAN_ENABLED='true';config.SCAN_DAILY_BUDGET_USD=20;config.PPQ_CALL_CEILING_USD=.02;
 await db.query('DELETE FROM scan_usage');await db.query('DELETE FROM scan_daily_spend');
 vi.mocked(ppqKey).mockResolvedValue('test-only-key');
 vi.mocked(validateModels).mockResolvedValue({a:model('test/scout'),b:model('test/skeptic')});
 vi.mocked(markets).mockResolvedValue(['BTC','ETH','SOL','HYPE'].map(name=>({name})) as Awaited<ReturnType<typeof markets>>);
 vi.mocked(snapshot).mockImplementation(async coin=>({...fixture,market:coin,timestamp:Date.now()}));
});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});

it('returns a metered read without touching crew budgets or Token accounts',async()=>{
 const provider=infer();const read=await scanMarket(db,{...fixture,timestamp:Date.now()});
 expect(read).toMatchObject({market:'BTC',mark:60000,side:'long',invalidationPx:59000,horizonH:24,skeptic:{verdict:'PASS'}});
 expect(read.distancePct).toBeCloseTo(1.666667);expect(provider).toHaveBeenCalledTimes(2);
 expect(provider.mock.calls[0][0]).toMatchObject({maxOutputTokens:600,timeoutMs:12000});
 for(const table of ['token_accounts','token_usage','budgets','crews'])expect((await db.query('SELECT * FROM '+table)).rows).toHaveLength(0);
 const usage=(await db.query<{actual_usd:string;status:string}>('SELECT actual_usd,status FROM scan_usage')).rows;
 expect(usage).toHaveLength(2);expect(usage.every(row=>Number(row.actual_usd)>0&&row.status==='catalog')).toBe(true);
});
it('shares concurrent reads, caches for ten minutes, then fetches a fresh snapshot',async()=>{
 const provider=infer(),scan=createScanner(db);
 const reads=await Promise.all([scan('BTC'),scan('BTC'),scan('BTC')]);
 expect(reads.map(r=>r.cached)).toEqual([false,true,true]);expect(provider).toHaveBeenCalledTimes(2);expect(snapshot).toHaveBeenCalledTimes(1);
 expect((await scan('BTC')).cached).toBe(true);
 const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+600001);
 provider.mockResolvedValueOnce(result({card})).mockResolvedValueOnce(result({verdict:'PASS',reasons:['The exit price is valid.']}));
 expect((await scan('BTC')).cached).toBe(false);expect(provider).toHaveBeenCalledTimes(4);expect(snapshot).toHaveBeenCalledTimes(2);
});
it('does not cache failures and lets a later scan retry',async()=>{
 const provider=vi.spyOn(ChatCompletionsProvider.prototype,'infer').mockRejectedValueOnce(Error('provider unavailable'));
 const scan=createScanner(db);await expect(scan('BTC')).rejects.toMatchObject({statusCode:503,message:'Scans are busy, try again soon'});
 provider.mockResolvedValueOnce(result({card})).mockResolvedValueOnce(result({verdict:'PASS',reasons:['The exit price is valid.']}));
 expect((await scan('BTC')).side).toBe('long');expect(provider).toHaveBeenCalledTimes(3);
});
it('keeps a rejected or absent idea out of the trade link contract',async()=>{
 const provider=vi.spyOn(ChatCompletionsProvider.prototype,'infer').mockResolvedValueOnce(result({card})).mockResolvedValueOnce(result({verdict:'KILL',reasons:['The price moves are unclear.']}));
 expect(await scanMarket(db,{...fixture,timestamp:Date.now()})).toMatchObject({side:null,invalidationPx:null,distancePct:null,horizonH:null,skeptic:{verdict:'KILL'}});
 provider.mockResolvedValueOnce(result({card:null})).mockResolvedValueOnce(result({verdict:'PASS',reasons:['There is no trade to check.']}));
 expect(await scanMarket(db,{...fixture,timestamp:Date.now()})).toMatchObject({side:null,skeptic:{verdict:'KILL'}});
});
it.each([['long',61000],['short',59000]])('rejects a wrong-side %s exit at %s even after an AI pass',async(side,stop)=>{
 vi.spyOn(ChatCompletionsProvider.prototype,'infer').mockResolvedValueOnce(result({card:{...card,side,invalidationPx:stop}})).mockResolvedValueOnce(result({verdict:'PASS',reasons:['Price may move.']}));
 expect(await scanMarket(db,{...fixture,timestamp:Date.now()})).toMatchObject({side:null,skeptic:{verdict:'KILL'}});
});
it.each([['long',59900,-1],['short',60100,1]])('widens a too-close %s exit at %s to the 2 ATR public floor',async(side,stop,sign)=>{
 vi.spyOn(ChatCompletionsProvider.prototype,'infer').mockResolvedValueOnce(result({card:{...card,side,invalidationPx:stop}})).mockResolvedValueOnce(result({verdict:'PASS',reasons:['Price may move.']}));
 const read=await scanMarket(db,{...fixture,timestamp:Date.now()});
 expect(read).toMatchObject({side,skeptic:{verdict:'PASS'}});expect(read.invalidationPx).toBeCloseTo(fixture.mark+sign*2*fixture.atr);
});
it('returns a valid short with the same distance and horizon fields',async()=>{
 vi.spyOn(ChatCompletionsProvider.prototype,'infer').mockResolvedValueOnce(result({card:{...card,side:'short',invalidationPx:61000}})).mockResolvedValueOnce(result({verdict:'PASS',reasons:['The exit price is valid.']}));
 expect(await scanMarket(db,{...fixture,timestamp:Date.now()})).toMatchObject({side:'short',invalidationPx:61000,horizonH:24});
});
it('fails closed on missing reviews, unexpected markets and invalid output',async()=>{
 const provider=vi.spyOn(ChatCompletionsProvider.prototype,'infer').mockResolvedValueOnce(result({card})).mockResolvedValueOnce(result({verdict:'PASS',reasons:[]}));
 expect((await scanMarket(db,{...fixture,timestamp:Date.now()})).side).toBeNull();
 provider.mockResolvedValueOnce(result({card:{...card,market:'ETH'}}));await expect(scanMarket(db,{...fixture,timestamp:Date.now()})).rejects.toThrow('unauthorized market');
 provider.mockResolvedValueOnce(result({card:{...card,invalidationPx:-1}}));await expect(scanMarket(db,{...fixture,timestamp:Date.now()})).rejects.toThrow('invalid');
 expect((await db.query("SELECT actual_usd FROM scan_usage WHERE status='invalid'")).rows).toHaveLength(1);
});
it('enforces the per-call ceiling before contacting AI',async()=>{
 const provider=infer();config.PPQ_CALL_CEILING_USD=.000001;
 await expect(scanMarket(db,{...fixture,timestamp:Date.now()})).rejects.toThrow('per-call');expect(provider).not.toHaveBeenCalled();
 expect((await db.query('SELECT * FROM scan_usage')).rows).toHaveLength(0);
});
it('atomically enforces the persisted daily cap across callers and recreated scanners',async()=>{
 const holds=await Promise.allSettled(Array.from({length:10},()=>reserveScanCall(db,'test/scout',.01,.03)));
 expect(holds.filter(r=>r.status==='fulfilled')).toHaveLength(3);
 for(const hold of holds)if(hold.status==='fulfilled')await settleScanCall(db,hold.value,.001,'catalog');
 config.SCAN_DAILY_BUDGET_USD=.03;const provider=infer();
 await expect(createScanner(db)('BTC')).rejects.toMatchObject({statusCode:503});
 await expect(createScanner(db)('ETH')).rejects.toMatchObject({statusCode:503});expect(provider).not.toHaveBeenCalled();
 expect(Number((await db.query<{committed_usd:string}>('SELECT committed_usd FROM scan_daily_spend')).rows[0].committed_usd)).toBe(.03);
 const now=Date.now();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now+86400000);
 await expect(reserveScanCall(db,'test/scout',.01,.03)).resolves.toBeTypeOf('string');
});
it('retains failed and interrupted reservations and blocks a metering overrun',async()=>{
 const failed=await reserveScanCall(db,'test/scout',.01,.03);await settleScanCall(db,failed,null,'failed');
 await reserveScanCall(db,'test/scout',.01,.03);
 const overrun=await reserveScanCall(db,'test/scout',.01,.03);await expect(settleScanCall(db,overrun,.02,'catalog')).rejects.toThrow('ceiling exceeded');
 await settleScanCall(db,overrun,.02,'catalog');
 await expect(reserveScanCall(db,'test/scout',0,1)).rejects.toThrow('budget unavailable');
 expect(Number((await db.query<{committed_usd:string}>('SELECT committed_usd FROM scan_daily_spend')).rows[0].committed_usd)).toBe(.04);
});
it('retains the ceiling when usage is missing',async()=>{
 vi.spyOn(ChatCompletionsProvider.prototype,'infer').mockResolvedValueOnce({...result({card}),inputTokens:null});
 await expect(scanMarket(db,{...fixture,timestamp:Date.now()})).rejects.toThrow('usage');
 const row=(await db.query<{status:string;reserved_usd:string;actual_usd:null}>('SELECT * FROM scan_usage')).rows[0];
 expect(row.status).toBe('unmetered');expect(row.actual_usd).toBeNull();expect(Number(row.reserved_usd)).toBeGreaterThan(0);
});
it('returns a friendly unavailable result for disabled, unconfigured and exhausted scans',async()=>{
 const provider=infer();config.SCAN_ENABLED='false';await expect(createScanner(db)('BTC')).rejects.toMatchObject({statusCode:503});
 config.SCAN_ENABLED='true';vi.mocked(ppqKey).mockResolvedValue('');await expect(createScanner(db)('BTC')).rejects.toMatchObject({statusCode:503});
 vi.mocked(ppqKey).mockResolvedValue('test-only-key');config.SCAN_DAILY_BUDGET_USD=0;await expect(createScanner(db)('BTC')).rejects.toMatchObject({statusCode:503});
 expect(provider).not.toHaveBeenCalled();
});
it('rejects stale or unusable market data before AI spending',async()=>{
 const provider=infer();for(const change of [{mark:NaN},{mark:0},{atr:0},{timestamp:Date.now()-31000}])await expect(scanMarket(db,{...fixture,timestamp:Date.now(),...change})).rejects.toThrow('Fresh market data');
 expect(provider).not.toHaveBeenCalled();
});
it('exposes public routes, validates coins, preserves origin checks and limits each client',async()=>{
 const provider=infer(),app=await createServer(db),headers={origin:config.PUBLIC_ORIGIN};
 try{
  expect((await app.inject('/api/scan/markets')).json()).toEqual({markets:['BTC','ETH','SOL','HYPE']});
  const send=(payload:unknown,remoteAddress='192.0.2.1')=>app.inject({method:'POST',url:'/api/scan',headers,payload:payload as object,remoteAddress});
  expect((await app.inject({method:'POST',url:'/api/scan',payload:{market:'BTC'},headers:{origin:'https://foreign.invalid'}})).statusCode).toBe(400);
  for(const payload of [{},{market:'FAKE'},{market:'BTC',free:true},{market:['BTC']}])expect((await send(payload)).statusCode).toBe(400);
  expect((await send({market:'btc'})).json()).toMatchObject({market:'BTC',side:'long',cached:false});
  for(let i=0;i<5;i++)expect((await send({market:'BTC'})).statusCode).toBe(200);
  const limited=await send({market:'BTC'});expect(limited.statusCode).toBe(429);expect(Number(limited.headers['retry-after'])).toBeGreaterThan(3500);
  expect((await send({market:'BTC'},'192.0.2.2')).statusCode).toBe(200);expect(provider).toHaveBeenCalledTimes(2);
  for(let i=0;i<60;i++)await app.inject({url:'/api/scan/markets',remoteAddress:'192.0.2.3'});
  expect((await app.inject({url:'/api/scan/markets',remoteAddress:'192.0.2.3'})).statusCode).toBe(429);
 }finally{await app.close();}
});
