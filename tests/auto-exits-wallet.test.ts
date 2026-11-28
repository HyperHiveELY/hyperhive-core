import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Hex} from 'viem';
import {planExit} from '../packages/core/auto-exits.js';
import {disconnectExitAgent,exitAgentStatus,lockExitAgent,placeAutoExits,removeAutoExits} from '../apps/web/src/auto-exits-wallet.js';
import {market} from './fixtures.js';
const mock=vi.hoisted(()=>({owner:('0x'+'1'.repeat(40)) as Hex,agents:[] as any[],open:[] as any[],positions:[] as any[],approve:vi.fn(),order:vi.fn(),cancel:vi.fn(),status:vi.fn(),connect:vi.fn()}));
vi.mock('../apps/web/src/wallet.js',()=>({connect:mock.connect,exchange:()=>({approveAgent:mock.approve,order:mock.order,cancelByCloid:mock.cancel})}));
vi.mock('@nktkas/hyperliquid',async original=>({...await original<typeof import('@nktkas/hyperliquid')>(),InfoClient:class {
 extraAgents(){return Promise.resolve(mock.agents);}
 clearinghouseState(){return Promise.resolve({assetPositions:mock.positions.map(position=>({position}))});}
 frontendOpenOrders(){return Promise.resolve([...mock.open]);}
 metaAndAssetCtxs(){return Promise.resolve([{universe:[{name:'BTC',szDecimals:2}]},[{markPx:'100'}]]);}
 orderStatus(args:unknown){return mock.status(args);}
}}));
const password='sample encryption password',owner=mock.owner;
const position={coin:'BTC',szi:'2',entryPx:'100',liquidationPx:'80'};
const edits=()=>{const p=planExit(position,[],{...market,mark:100,atr:2,szDecimals:2,timestamp:Date.now()});return [{coin:'BTC',stop:p.stopPrice,tp:p.tpPrice,position:p}];};
beforeEach(()=>{
 vi.clearAllMocks();lockExitAgent();mock.agents=[];mock.open=[];mock.positions=[{...position}];
 const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});
 vi.stubGlobal('navigator',{locks:{request:async(_key:string,_opts:unknown,run:(lock:unknown)=>unknown)=>run({})}});
 mock.connect.mockResolvedValue({address:owner,client:{}});
 mock.approve.mockImplementation(async({agentAddress,agentName})=>{mock.agents.push({address:agentAddress,name:'HyperHive exits',validUntil:Number(agentName.split(' ').at(-1))});return {status:'ok'};});
 mock.order.mockImplementation(async({orders})=>({status:'ok',response:{type:'order',data:{statuses:orders.map((o:any,i:number)=>{const oid=10+i;mock.open.push({coin:'BTC',oid,side:o.b?'B':'A',reduceOnly:o.r,isTrigger:true,orderType:o.t.trigger.tpsl==='sl'?'Stop Market':'Take Profit Market',triggerPx:o.t.trigger.triggerPx,sz:o.s,isPositionTpsl:true,cloid:o.c});return {resting:{oid}};})}}}));
 mock.cancel.mockImplementation(async({cancels})=>{mock.open=mock.open.filter(o=>!cancels.some((c:any)=>c.cloid===o.cloid));return {status:'ok'};});
 mock.status.mockResolvedValue({status:'unknownOid'});
});
afterEach(()=>{lockExitAgent();vi.unstubAllGlobals();});
it('encrypts an expiring browser agent and sends only position-sized reduce-only market triggers',async()=>{
 const result=await placeAutoExits(owner,password,edits());expect(result.issues).toEqual([]);expect(result.orders).toHaveLength(2);
 const approval=mock.approve.mock.calls[0][0];expect(approval.agentName).toMatch(/^HyperHive exits valid_until \d+$/);expect(Number(approval.agentName.split(' ').at(-1))-Date.now()).toBeLessThanOrEqual(180*86400000);
 const saved=JSON.parse(localStorage.getItem('hyperhive.exits.agent.v1:'+owner)!);expect(saved.backup.purpose).toBe('exits');expect(saved.backup.ciphertext).toBeTruthy();expect(Object.keys(saved.backup)).not.toContain('privateKey');
 const [batch,opts]=mock.order.mock.calls[0];expect(batch.grouping).toBe('positionTpsl');expect(opts.expiresAfter).toBeGreaterThan(Date.now());
 expect(batch.orders).toEqual(expect.arrayContaining([expect.objectContaining({b:false,r:true,s:'0',t:{trigger:{isMarket:true,triggerPx:'97.6',tpsl:'sl'}}}),expect.objectContaining({r:true,s:'0',t:{trigger:{isMarket:true,triggerPx:'107.2',tpsl:'tp'}}})]));
 await placeAutoExits(owner,'',edits());expect(mock.approve).toHaveBeenCalledTimes(1);expect(mock.order).toHaveBeenCalledTimes(1);
});
it('fills only the missing leg and never changes an existing manual stop',async()=>{
 mock.open=[{coin:'BTC',oid:90,side:'A',reduceOnly:true,isTrigger:true,orderType:'Stop Limit',triggerPx:'96',sz:'1',isPositionTpsl:false}];
 await placeAutoExits(owner,password,edits());expect(mock.order.mock.calls[0][0].orders).toHaveLength(1);expect(mock.order.mock.calls[0][0].orders[0].t.trigger.tpsl).toBe('tp');expect(mock.cancel).not.toHaveBeenCalled();
});
it('rechecks position changes and liquidation before signing orders',async()=>{
 mock.positions=[{...position,szi:'-2',liquidationPx:'120'}];const result=await placeAutoExits(owner,password,edits());expect(result.issues[0]).toContain('position changed');expect(mock.order).not.toHaveBeenCalled();
 mock.positions=[{...position,liquidationPx:'99'}];const closer=await placeAutoExits(owner,'',edits());expect(closer.issues[0]).toContain('halfway');expect(mock.order).not.toHaveBeenCalled();
});
it('aborts if the active owner changes during approval',async()=>{
 mock.approve.mockImplementation(async({agentAddress,agentName})=>{mock.agents=[{address:agentAddress,validUntil:Number(agentName.split(' ').at(-1))}];mock.connect.mockResolvedValue({address:'0x'+'2'.repeat(40),client:{}});});
 await expect(placeAutoExits(owner,password,edits())).rejects.toThrow('Connect the wallet');expect(mock.order).not.toHaveBeenCalled();
});
it('requires an unexpired exchange-confirmed approval',async()=>{
 mock.approve.mockResolvedValue({status:'ok'});await expect(placeAutoExits(owner,password,edits())).rejects.toThrow('not confirmed');expect(mock.order).not.toHaveBeenCalled();
});
it('reconciles an accepted order after a lost response instead of duplicating it',async()=>{
 mock.order.mockImplementationOnce(async({orders})=>{for(const [i,o] of orders.entries())mock.open.push({coin:'BTC',oid:10+i,side:'A',reduceOnly:true,isTrigger:true,orderType:o.t.trigger.tpsl==='sl'?'Stop Market':'Take Profit Market',triggerPx:o.t.trigger.triggerPx,sz:'0',isPositionTpsl:true,cloid:o.c});throw Error('connection lost');});
 expect((await placeAutoExits(owner,password,edits())).issues[0]).toContain('uncertain');
 mock.status.mockImplementation(async({oid})=>({status:'order',order:{status:'open',order:mock.open.find(o=>o.cloid===oid)}}));
 await placeAutoExits(owner,'',edits());expect(mock.order).toHaveBeenCalledTimes(1);expect(mock.status).toHaveBeenCalledTimes(2);
});
it('keeps an unknown submission pending until its signed deadline passes',async()=>{
 mock.order.mockRejectedValue(Error('offline'));await placeAutoExits(owner,password,edits());
 await expect(placeAutoExits(owner,'',edits())).rejects.toThrow('still being checked');expect(mock.order).toHaveBeenCalledTimes(1);
});
it('preserves accepted legs when a batch is partially rejected',async()=>{
 mock.order.mockResolvedValueOnce({status:'ok',response:{type:'order',data:{statuses:[{resting:{oid:10}},{error:'Rejected take-profit'}]}}});
 const result=await placeAutoExits(owner,password,edits());expect(result.orders).toHaveLength(1);expect(result.issues).toEqual(['BTC: Rejected take-profit']);
 const rows=JSON.parse(localStorage.getItem('hyperhive.exits.orders.v1:'+owner)!);expect(rows).toHaveLength(1);expect(rows[0].oid).toBe(10);
});
it('cancels only journaled exits, and disconnect forgets keys without canceling orders',async()=>{
 await placeAutoExits(owner,password,edits());const manual={...mock.open[0],oid:99,cloid:'0x'+'f'.repeat(32)};mock.open.push(manual);
 expect(await removeAutoExits(owner,'')).toBe(2);expect(mock.open).toEqual([manual]);expect(mock.cancel.mock.calls[0][0].cancels).toHaveLength(2);
 await disconnectExitAgent(owner);expect(exitAgentStatus(owner).saved).toBe(false);expect(mock.cancel).toHaveBeenCalledTimes(1);
});
it('blocks submission if encrypted storage fails or a different tab holds the lock',async()=>{
 vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{throw Error('storage full');}});
 await expect(placeAutoExits(owner,password,edits())).rejects.toThrow('storage full');expect(mock.approve).not.toHaveBeenCalled();
 vi.stubGlobal('navigator',{locks:{request:async(_key:string,_opts:unknown,run:(lock:unknown)=>unknown)=>run(null)}});
 await expect(placeAutoExits(owner,password,edits())).rejects.toThrow('another tab');expect(mock.order).not.toHaveBeenCalled();
 await expect(disconnectExitAgent(owner)).rejects.toThrow('another tab');
});
