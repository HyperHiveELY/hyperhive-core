import {expect,it,vi} from 'vitest';
import {encodeAbiParameters,encodeEventTopics,parseAbi} from 'viem';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {wallet} from './fixtures.js';
const h=vi.hoisted(()=>({head:vi.fn().mockResolvedValue(2000n),logs:vi.fn(),read:vi.fn(),close:vi.fn(),health:vi.fn(),settings:vi.fn(),query:vi.fn(),lock:vi.fn()}));
vi.mock('viem',async orig=>({...await orig<typeof import('viem')>(),createPublicClient:()=>({getChainId:async()=>99901,getBlockNumber:h.head,getLogs:h.logs,readContract:h.read,getBalance:async()=>1n})}));
vi.mock('../packages/core/runtime-health.js',()=>({runtimeHealth:h.health}));
vi.mock('../packages/core/db.js',()=>({Database:class{close=h.close;lock=h.lock;query=h.query}}));
vi.mock('../packages/core/integration-settings.js',()=>({integrationSettings:h.settings}));
it('reports role changes, halts, outflows, overdue roots, gas and liveness, then hands off a bounded cursor',async()=>{
 const args=process.argv,exit=process.exitCode,spy=vi.spyOn(console,'log').mockImplementation(()=>{});
 try{
  const a=wallet.address.toLowerCase() as `0x${string}`,role=('0x'+'11'.repeat(32)) as `0x${string}`;
  h.settings.mockResolvedValue({roots:a,registry:a,governance:a,auditor:a,usdc:a,billing:a});
  const abi=parseAbi(['event RoleGranted(bytes32 indexed role,address indexed account,address indexed sender)','event RoundsHalted(bool halted)','event Transfer(address indexed from,address indexed to,uint256 value)']);
  h.logs.mockResolvedValue([
   {address:a,transactionHash:role,data:'0x',topics:encodeEventTopics({abi,eventName:'RoleGranted',args:{role,account:a,sender:a}})},
   {address:a,transactionHash:role,data:encodeAbiParameters([{type:'bool'}],[true]),topics:encodeEventTopics({abi,eventName:'RoundsHalted'})},
   {address:a,transactionHash:role,data:encodeAbiParameters([{type:'uint256'}],[500n]),topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:a,to:a}})},
  ]);
  h.read.mockImplementation(async({functionName})=>functionName==='burnVault'?a:0n);h.health.mockResolvedValue({checks:[{id:'signer',ok:false}]});
  for(const [k,v] of Object.entries({DATABASE_URL:'memory',MONITORED_SIGNER:a,SIGNER_GAS_FLOOR_HYPE:'1',USDC_OUTFLOW_ALERT_UNITS:'100'}))vi.stubEnv(k,v);
  vi.resetModules();process.argv=[...args.slice(0,2),'10'];await import('../scripts/monitor.js');
  const event=JSON.parse(spy.mock.calls[0][0]);expect(event).toMatchObject({fromBlock:'10',throughBlock:'1009',nextBlock:'1010'});
  expect(event.alerts).toEqual(['RoleGranted '+role,'RoundsHalted '+role,'Transfer '+role,'signer unavailable','Signer gas below configured floor','Hourly root overdue']);expect(process.exitCode).toBe(2);expect(h.close).toHaveBeenCalledOnce();
  spy.mockClear();h.logs.mockRejectedValue(Error('RPC offline'));vi.resetModules();await expect(import('../scripts/monitor.js')).rejects.toThrow('RPC offline');expect(spy).not.toHaveBeenCalled();
 }finally{process.argv=args;process.exitCode=exit;vi.unstubAllEnvs();vi.restoreAllMocks();}
});
it('retries the same alert at a loopback receiver and advances the durable cursor only after acknowledgement',async()=>{
 const savedArgv=process.argv,savedExit=process.exitCode,received:{key:unknown;body:any}[]=[];
 const receiver=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  received.push({key:req.headers['idempotency-key'],body:JSON.parse(raw)});
  res.writeHead(received.length===1?503:204);res.end();
 });
 receiver.listen(0,'127.0.0.1');await once(receiver,'listening');
 try{
  const addr=receiver.address();if(!addr||typeof addr==='string')throw Error('Expected loopback TCP');
  const a=wallet.address.toLowerCase();h.settings.mockResolvedValue({roots:a,registry:a,governance:a,auditor:a,usdc:a,billing:a});
  for(const [k,v] of Object.entries({DATABASE_URL:'memory',MONITORED_SIGNER:a,SIGNER_GAS_FLOOR_HYPE:'1',USDC_OUTFLOW_ALERT_UNITS:'100',MONITOR_WEBHOOK_URL:'http://127.0.0.1:'+addr.port}))vi.stubEnv(k,v);
  let cursor:string|undefined;h.lock.mockResolvedValue(async()=>{});h.query.mockImplementation(async(sql:string,parameters:string[])=>{
   if(sql.startsWith('SELECT'))return {rows:cursor?[{value:cursor}]:[]};
   cursor=parameters[1];return {rows:[]};
  });
  h.logs.mockResolvedValue([]);h.read.mockImplementation(async({functionName})=>functionName==='burnVault'?a:0n);h.health.mockResolvedValue({checks:[]});
  vi.spyOn(console,'log').mockImplementation(()=>{});process.argv=[...savedArgv.slice(0,2),'--deliver','10'];
  const run=async()=>{vi.resetModules();await import('../scripts/monitor.js');};
  await expect(run()).rejects.toThrow('503');expect(JSON.parse(cursor!)).toEqual(received[0].body);
  h.head.mockResolvedValue(1120n);h.health.mockResolvedValue({checks:[{id:'changed',ok:false}]});
  await run();expect(cursor).toBe('1010');expect(received[0]).toEqual(received[1]);
  await run();expect(received[2].body.fromBlock).toBe('1010');expect(cursor).toBe('1119');
  await run();expect(received).toHaveLength(3);
 }finally{process.argv=savedArgv;process.exitCode=savedExit;vi.unstubAllEnvs();vi.restoreAllMocks();receiver.closeAllConnections();await new Promise<void>(r=>receiver.close(()=>r()));}
});
