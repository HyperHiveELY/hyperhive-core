import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {crew} from './fixtures.js';
const h=vi.hoisted(()=>({release:vi.fn(),close:vi.fn(),lock:vi.fn(),query:vi.fn(),heartbeat:vi.fn(),event:vi.fn(),tick:vi.fn(),signerInit:vi.fn(),paperTick:vi.fn(),drain:vi.fn(),mutation:vi.fn(),archive:vi.fn(),audit:vi.fn(),metrics:vi.fn(),think:vi.fn(),recover:vi.fn(),marketList:vi.fn(),snapshot:vi.fn(),telegram:vi.fn(),listen:vi.fn(),apiClose:vi.fn()}));
vi.mock('../packages/core/db.js',()=>({Database:class{async init(){return this}lock=h.lock;query=h.query;close=h.close},event:h.event,heartbeat:h.heartbeat}));
vi.mock('../apps/signer/engine.js',()=>({Signer:class{init=h.signerInit;tick=h.tick}}));
vi.mock('../packages/paper/engine.js',()=>({PaperEngine:class{tick=h.paperTick;drain=h.drain}}));
vi.mock('../packages/paper/account.js',()=>({mutatePaper:h.mutation}));
vi.mock('../packages/core/telegram.js',()=>({telegramTick:h.telegram}));
vi.mock('../apps/worker/auditor.js',()=>({archiveHour:h.archive,auditCrew:h.audit}));
vi.mock('../packages/core/record-metrics.js',()=>({collectRecordMetrics:h.metrics}));
vi.mock('../packages/core/access.js',()=>({accessStatus:async()=>({eligible:true})}));
vi.mock('../packages/core/tokens.js',()=>({meteringReady:async()=>true,aiCreditAccess:async()=>true,recoverTokenReservations:h.recover}));
vi.mock('../packages/ai/crew.js',()=>({think:h.think}));
vi.mock('../packages/ai/schedule.js',()=>({claimScan:async()=>true}));
vi.mock('../packages/core/venue.js',()=>({markets:h.marketList,snapshot:h.snapshot}));
vi.mock('../apps/api/server.js',()=>({createServer:async()=>({listen:h.listen,close:h.apiClose})}));
let stop:()=>unknown;
beforeEach(()=>{
 vi.resetModules();vi.resetAllMocks();h.lock.mockResolvedValue(h.release);
 stop=()=>{throw Error('Missing shutdown handler')};
 const on=process.on.bind(process);
 vi.spyOn(process,'on').mockImplementation(((name:string,fn:()=>void)=>{
  if(name==='SIGTERM'){stop=fn;return process;}
  if(name==='SIGINT')return process;
  return on(name,fn);
 }) as typeof process.on);
});
afterEach(()=>vi.restoreAllMocks());
it('runs the signer under its advisory lock and drains on stop',async()=>{
 h.tick.mockImplementation(async()=>stop());
 await import('../apps/signer/main.js');expect(h.lock).toHaveBeenCalledWith('hyperhive/signer');expect(h.signerInit).toHaveBeenCalledOnce();expect(h.tick).toHaveBeenCalledOnce();expect(h.release).toHaveBeenCalledOnce();expect(h.close).toHaveBeenCalledOnce();
});
it('persists a paper tick failure and drains the worker',async()=>{
 const c=await crew();h.query.mockResolvedValue({rows:[c]});h.paperTick.mockImplementation(async()=>{stop();throw Error('feed delayed')});
 const account={error:''};h.mutation.mockImplementation(async(_db,_id,apply)=>apply(account));
 await import('../apps/paper/main.js');expect(account.error).toBe('feed delayed');expect(h.heartbeat).toHaveBeenCalledWith(expect.anything(),'paper',{crews:1});expect(h.drain).toHaveBeenCalledOnce();expect(h.release).toHaveBeenCalledOnce();
});
it('scans eligible markets for each lens and archives after an individual failure',async()=>{
 const c=await crew();c.paused=false;
 h.query.mockImplementation(async(sql:string)=>({rows:sql.includes('FROM crews')?[c]:sql.includes('FROM budgets')?[{spent:'0'}]:[]}));
 h.audit.mockRejectedValueOnce(Error('venue offline'));h.metrics.mockRejectedValueOnce(Error('unavailable'));
 h.marketList.mockResolvedValue(['ETH','BTC','OTHER'].map((name,i)=>({name,markPx:100+i,prevDayPx:100,funding:i/1000,openInterest:10,dayNtlVlm:100})));
 h.snapshot.mockImplementation(async name=>({market:name}));
 h.think.mockRejectedValueOnce(Error('model failed'));h.heartbeat.mockImplementation(async()=>stop());
 await import('../apps/worker/main.js');
 expect(h.recover).toHaveBeenCalledOnce();expect(h.think.mock.calls.map(call=>call[3])).toEqual(['trend','crowding','levels']);
 expect(h.think.mock.calls[0][2].map((s:{market:string})=>s.market)).toEqual(['BTC','ETH']);
 expect(h.event.mock.calls.map(call=>call[2])).toEqual(['audit_error','metrics_error','scout_error']);
 expect(h.archive).toHaveBeenCalledOnce();expect(h.release).toHaveBeenCalledOnce();
});
it('reports notification failure before releasing its lock',async()=>{
 h.telegram.mockImplementation(async()=>{stop();throw Error('offline')});
 await import('../apps/worker/notifications.js');expect(h.event.mock.calls[0].slice(1)).toEqual([null,'notifications_error','offline']);expect(h.close).toHaveBeenCalledOnce();
});
it('listens on the configured API address and closes both resources on shutdown',async()=>{
 const exit=vi.spyOn(process,'exit').mockImplementation((()=>{}) as typeof process.exit);
 await import('../apps/api/main.js');expect(h.listen).toHaveBeenCalledOnce();await stop();
 expect(h.apiClose).toHaveBeenCalledOnce();expect(h.close).toHaveBeenCalledOnce();expect(exit).toHaveBeenCalledWith(0);
});
