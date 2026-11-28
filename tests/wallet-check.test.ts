import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {info} from '../packages/core/venue.js';
import {createWalletCheckCache,readWalletCheck,WALLET_CHECK_TTL} from '../packages/core/wallet-check.js';
import {registerWalletCheck,walletCheckRequestLog} from '../apps/api/wallet-check.js';

const address=('0x'+'ab'.repeat(20)) as `0x${string}`;
const position=(overrides={})=>({coin:'BTC',szi:'2',entryPx:'95',positionValue:'200',unrealizedPnl:'10',leverage:{value:3},liquidationPx:'50',...overrides});
const order=(overrides={})=>({coin:'BTC',side:'A',reduceOnly:true,isTrigger:true,isPositionTpsl:false,orderType:'Stop Market',triggerPx:'80',sz:'2',...overrides});
function state(positions=[position()],accountValue='100'){return {marginSummary:{accountValue},assetPositions:positions.map(p=>({position:p}))};}
const funding=(time:number,coin:string,usdc:string,hash='sample-funding')=>({time,hash,delta:{coin,usdc}});
function mockVenue(){
  return {state:vi.spyOn(info,'clearinghouseState').mockResolvedValue(state() as any),orders:vi.spyOn(info,'frontendOpenOrders').mockResolvedValue([order()] as any),
    mids:vi.spyOn(info,'allMids').mockResolvedValue({BTC:'100',ETH:'200'}),funding:vi.spyOn(info,'userFunding').mockResolvedValue([])};
}
let venue:ReturnType<typeof mockVenue>;
beforeEach(()=>{venue=mockVenue();});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});

describe('wallet report',()=>{
  it('calculates long and short positions, excludes flat positions, and totals gross funding including closed coins',async()=>{
    const now=Date.now();
    venue.state.mockResolvedValue(state([position(),position({coin:'ETH',szi:'-1',entryPx:'220',positionValue:'200',liquidationPx:'210',unrealizedPnl:'20'}),position({coin:'FLAT',szi:'0'})]) as any);
    venue.orders.mockResolvedValue([order(),order({coin:'ETH',side:'B',triggerPx:'205',sz:'1'}),order({orderType:'Take Profit Limit',triggerPx:'120'})] as any);
    venue.funding.mockResolvedValue([funding(now-1000,'BTC','-4'),funding(now-500,'BTC','3'),funding(now-1000,'ETH','-2'),funding(now-1000,'CLOSED','-8')] as any);
    const report=await readWalletCheck(address);
    expect(report.positions).toHaveLength(2);
    expect(report.positions[0]).toMatchObject({coin:'BTC',side:'Long',size:2,notional:200,entry:95,mark:100,leverage:3,liquidationPx:50,distanceToLiquidationPct:50,hasStop:true,hasTakeProfit:true,unrealizedPnl:10,funding7d:4});
    expect(report.positions[1]).toMatchObject({coin:'ETH',side:'Short',size:1,distanceToLiquidationPct:5,hasStop:true,hasTakeProfit:false,funding7d:2});
    expect(report.summary).toMatchObject({accountValue:100,totalNotional:400,effectiveLeverage:4,positionsWithoutStop:0,totalFundingPaid7d:14,status:'At risk',closestToLiquidation:{coin:'ETH',side:'Short',distanceToLiquidationPct:5}});
    expect(venue.funding.mock.calls[0][0]).toEqual({user:address,startTime:report.checkedAt-7*86400000,endTime:report.checkedAt});
  });
  it.each([
    [{},'100','Healthy'],[{liquidationPx:'90'},'100','At risk'],[{liquidationPx:'89.99'},'100','Healthy'],
    [{},'40','Healthy'],[{},'39.99','Needs attention'],[{},'0','At risk'],[{},'-1','At risk'],[{liquidationPx:null},'100','Needs attention'],
    [{liquidationPx:'120'},'100','At risk'],[{szi:'-2',liquidationPx:'80'},'100','At risk'],
  ])('applies conservative status thresholds for %j and equity %s',async(overrides,equity,status)=>{
    venue.state.mockResolvedValue(state([position(overrides)],equity) as any);
    venue.orders.mockResolvedValue([order({triggerPx:'95'}),order({side:'B',triggerPx:'105'})] as any);
    const report=await readWalletCheck(address);expect(report.summary.status).toBe(status);
    if(equity==='0'||equity==='-1')expect(report.summary.effectiveLeverage).toBeNull();
  });
  it('reports missing stops and a safe empty state without division by zero',async()=>{
    venue.orders.mockResolvedValue([]);expect((await readWalletCheck(address)).summary).toMatchObject({status:'Needs attention',positionsWithoutStop:1});
    venue.state.mockResolvedValue(state([],'0') as any);
    expect(await readWalletCheck(address)).toMatchObject({positions:[],summary:{status:'Healthy',effectiveLeverage:0,closestToLiquidation:null,positionsWithoutStop:0}});
  });
  it.each([
    {reduceOnly:false},{isTrigger:false},{side:'B'},{coin:'ETH'},{sz:'0.5'},{triggerPx:'120'},
    {triggerPx:'40'},{triggerPx:'50'},{orderType:'Limit'},
  ])('does not call an invalid or partial exit a stop: %j',async override=>{
    venue.orders.mockResolvedValue([order(override)] as any);expect((await readWalletCheck(address)).positions[0].hasStop).toBe(false);
  });
  it('accepts full-position and combined active stops, but not pending child exits',async()=>{
    venue.orders.mockResolvedValue([order({sz:'0',isPositionTpsl:true})] as any);expect((await readWalletCheck(address)).positions[0].hasStop).toBe(true);
    venue.orders.mockResolvedValue([order({sz:'1'}),order({sz:'1',triggerPx:'75'})] as any);expect((await readWalletCheck(address)).positions[0].hasStop).toBe(true);
    venue.orders.mockResolvedValue([order({isTrigger:false,children:[order()]})] as any);expect((await readWalletCheck(address)).positions[0].hasStop).toBe(false);
  });
  it('identifies short take-profits only on the closing side and below current price',async()=>{
    venue.state.mockResolvedValue(state([position({szi:'-2',liquidationPx:'150'})]) as any);
    venue.orders.mockResolvedValue([order({side:'B',triggerPx:'120'}),order({side:'B',triggerPx:'80',orderType:'Take Profit Market'})] as any);
    expect((await readWalletCheck(address)).positions[0]).toMatchObject({hasStop:true,hasTakeProfit:true});
  });
  it('paginates and deduplicates inclusive funding timestamps while excluding rows outside the week',async()=>{
    const now=Date.now(),page=Array.from({length:500},(_,i)=>funding(now-1000+i,'BTC','-1',`sample-${i}`));
    venue.funding.mockResolvedValueOnce(page as any).mockResolvedValueOnce([page[499],funding(now-100,'BTC','-2'),funding(now-8*86400000,'BTC','-100'),funding(now+10000,'BTC','-100')] as any);
    expect((await readWalletCheck(address)).summary.totalFundingPaid7d).toBe(502);
    expect(venue.funding.mock.calls[1][0].startTime).toBe(now-501);
  });
  it('rejects stuck and overlong funding history instead of returning incomplete totals',async()=>{
    venue.funding.mockImplementation(async({startTime})=>Array(500).fill(funding(Number(startTime),'BTC','-1')) as any);
    await expect(readWalletCheck(address)).rejects.toThrow('could not be completed');
    venue.funding.mockImplementation(async({startTime})=>Array.from({length:500},(_,i)=>funding(Number(startTime)+i+1,'BTC','-1')) as any);
    await expect(readWalletCheck(address)).rejects.toThrow('could not be completed');expect(venue.funding).toHaveBeenCalledTimes(21);
  });
  it.each(['NaN','Infinity','0',''])('rejects unavailable or malformed market price %s',async price=>{
    venue.mids.mockResolvedValue({BTC:price});await expect(readWalletCheck(address)).rejects.toThrow();
  });
  it('rejects missing market prices and malformed margin data',async()=>{
    venue.mids.mockResolvedValue({});await expect(readWalletCheck(address)).rejects.toThrow();
    venue.mids.mockResolvedValue({BTC:'100'});venue.state.mockResolvedValue(state([position()],'NaN') as any);
    await expect(readWalletCheck(address)).rejects.toThrow();
  });
});

describe('wallet check cache',()=>{
  it('shares in-flight work across address casing and expires without another request',async()=>{
    vi.useFakeTimers();const read=vi.fn(readWalletCheck),cache=createWalletCheckCache(read);
    try{
      const first=cache.get(address),second=cache.get('0x'+address.slice(2).toUpperCase());expect(second).toBe(first);await first;expect(read).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(WALLET_CHECK_TTL-1);await cache.get(address);expect(read).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);await cache.get(address);expect(read).toHaveBeenCalledTimes(2);
      cache.close();await cache.get(address);expect(read).toHaveBeenCalledTimes(3);
    }finally{cache.close();}
  });
  it('does not cache failures and validates before calling the venue',async()=>{
    const read=vi.fn(readWalletCheck),cache=createWalletCheckCache(read);
    try{
      expect(()=>cache.get('invalid')).toThrow();expect(read).not.toHaveBeenCalled();
      read.mockRejectedValueOnce(Error('offline'));await expect(cache.get(address)).rejects.toThrow('offline');
      await expect(cache.get(address)).resolves.toHaveProperty('summary');expect(read).toHaveBeenCalledTimes(2);
    }finally{cache.close();}
  });
  it('bounds the number of addresses retained',async()=>{
    const report=await readWalletCheck(address),read=vi.fn(async()=>report),cache=createWalletCheckCache(read);
    try{for(let i=0;i<1001;i++)await cache.get(`0x${i.toString(16).padStart(40,'0')}`);await cache.get('0x'+'0'.repeat(40));expect(read).toHaveBeenCalledTimes(1002);}finally{cache.close();}
  });
});

describe('public wallet check route',()=>{
  async function server(log?:{write:(line:string)=>void}){
    const app=Fastify({logger:log?{stream:log,serializers:{req:walletCheckRequestLog}}:false,trustProxy:(_address,hop)=>hop<1});
    await app.register(rateLimit,{max:120,timeWindow:'1 minute'});registerWalletCheck(app);return app;
  }
  it('works without a session, keeps addresses out of logs and returns uncached browser responses',async()=>{
    const logs:string[]=[],app=await server({write:line=>logs.push(line)});
    try{const r=await app.inject({url:`/api/wallet-check/${address}`});expect(r.statusCode).toBe(200);expect(r.headers['cache-control']).toBe('no-store');expect(r.json().summary.status).toBe('Healthy');expect(logs.join('')).not.toContain(address);}finally{await app.close();}
  });
  it('validates input, sanitizes upstream errors, and retries failures',async()=>{
    const app=await server();
    try{
      for(const invalid of ['short','0x'+'g'.repeat(40),'0x'+'a'.repeat(39)])expect((await app.inject({url:'/api/wallet-check/'+invalid})).statusCode).toBe(400);
      expect(venue.state).not.toHaveBeenCalled();venue.orders.mockRejectedValueOnce(Error('private upstream detail'));
      const r=await app.inject({url:`/api/wallet-check/${address}`});expect(r.statusCode).toBe(502);expect(r.body).not.toContain('private');
      expect((await app.inject({url:`/api/wallet-check/${address}`})).statusCode).toBe(200);
    }finally{await app.close();}
  });
  it('omits addresses from shared-page request logs without hiding other request metadata',async()=>{
    const logs:string[]=[],app=await server({write:line=>logs.push(line)});app.get('/check',async()=>({ok:true}));
    try{await app.inject({url:'/check?a='+address});expect(logs.join('')).not.toContain(address);expect(logs.join('')).toContain('"url":"/check"');expect(logs.join('')).toContain('"method":"GET"');}finally{await app.close();}
  });
  it('limits all address lookups to 30 per hour per client, including cached responses',async()=>{
    const app=await server(),url=`/api/wallet-check/${address}`;
    try{
      for(let i=0;i<30;i++)expect((await app.inject({url,headers:{'x-forwarded-for':'203.0.113.8'}})).statusCode).toBe(200);
      const limited=await app.inject({url:'/api/wallet-check/0x'+'cd'.repeat(20),headers:{'x-forwarded-for':'203.0.113.8'}});
      expect(limited.statusCode).toBe(429);expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
      expect((await app.inject({url,headers:{'x-forwarded-for':'198.51.100.8'}})).statusCode).toBe(200);expect(venue.state).toHaveBeenCalledTimes(1);
    }finally{await app.close();}
  });
  it('retains the global limit before making public venue requests',async()=>{
    const app=await server();app.get('/api/sample',async()=>({ok:true}));
    try{
      for(let i=0;i<120;i++)await app.inject({url:'/api/sample'});
      expect((await app.inject({url:`/api/wallet-check/${address}`})).statusCode).toBe(429);expect(venue.state).not.toHaveBeenCalled();
    }finally{await app.close();}
  });
});
