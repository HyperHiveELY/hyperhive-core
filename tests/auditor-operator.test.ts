import {it,expect,vi,afterEach} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {generatePrivateKey} from 'viem/accounts';
import {hash,ZERO} from '../packages/core/domain.js';
import {wallet} from './fixtures.js';
const h=vi.hoisted(()=>({block:vi.fn(),read:vi.fn(),sim:vi.fn(),write:vi.fn(),receipt:vi.fn(),audit:vi.fn()}));
vi.mock('viem',async original=>({...await original<typeof import('viem')>(),createPublicClient:()=>({getChainId:async()=>99901,getBlock:h.block,readContract:h.read,simulateContract:h.sim,waitForTransactionReceipt:h.receipt}),createWalletClient:()=>({writeContract:h.write})}));
vi.mock('../packages/core/hour-audit.js',()=>({auditHour:h.audit}));
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();vi.resetModules()});
it('opens, commits, restores its persisted vote, reveals and finalizes one obligation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hh-operator-'));const args=process.argv;
 const hour=123,end=(hour+1)*3600,root=hash('root'),path=join(dir,'key');
 let now=end+601,opened=false,finalized=false,commitment=ZERO;
 const handlers:Function[]=[];
 try{
  await writeFile(path,generatePrivateKey(),{mode:0o600});
  for(const [key,value] of Object.entries({AUDITOR_CONTRACT:wallet.address,ARCHIVE_ORIGIN:'https://fixture.invalid',ROOT_CONTRACT:wallet.address,MEASUREMENT_HASH:root,AUDITOR_PRIVATE_KEY_FILE:path,AUDITOR_STATE_DIR:dir,AUDITOR_EXECUTION_ENABLED:'true'}))vi.stubEnv(key,value);
  vi.resetModules();process.argv=[...args.slice(0,2),String(hour)];
  const original=process.on.bind(process);vi.spyOn(process,'on').mockImplementation(((name:string,fn:Function)=>{if(['SIGINT','SIGTERM'].includes(name)){handlers.push(fn);return process}return original(name,fn as any)}) as typeof process.on);
  vi.spyOn(console,'log').mockImplementation(()=>{});
  h.block.mockImplementation(async()=>({timestamp:BigInt(now)}));h.audit.mockResolvedValue({root,broken:1,venue:2});
  h.read.mockImplementation(async({functionName})=>({roots:wallet.address,rounds:[hour,opened?end+901:0,end+2701,200n,finalized],weight:100n,commitments:commitment,votes:ZERO})[functionName as 'roots']);
  h.sim.mockImplementation(async(request)=>({request}));h.receipt.mockResolvedValue({status:'success'});
  h.write.mockImplementation(async({functionName,args})=>{
   if(functionName==='openRound')opened=true;
   if(functionName==='commit')commitment=args[1];
   if(functionName==='finalizeHour')finalized=true;
   return ZERO;
  });
  const originalTimer=setTimeout;let iterations=0;
  vi.stubGlobal('setTimeout',((fn:Function,ms:number,...rest:unknown[])=>{
   if(ms!==15000)return originalTimer(fn as any,ms,...rest);
   if(++iterations>6)throw Error('Operator did not settle');
   now+=iterations===1?400:1900;
   return originalTimer(fn as any,0);
  }));
  await import('../apps/auditor/main.js');
  expect(h.write.mock.calls.map(c=>c[0].functionName)).toEqual(['openRound','commit','reveal','finalizeHour']);
  const vote=JSON.parse(await readFile(join(dir,hour+'.json'),'utf8'));expect(vote).toMatchObject({hour,root,broken:1,venue:2});
  expect(h.write.mock.calls[2][0].args).toEqual([BigInt(hour),root,1,2,vote.salt]);expect(h.audit).toHaveBeenCalledOnce();
  vi.resetModules();vi.stubEnv('AUDITOR_EXECUTION_ENABLED','false');await import('../apps/auditor/main.js');expect(h.audit).toHaveBeenCalledTimes(2);expect(h.write).toHaveBeenCalledTimes(4);
 }finally{process.argv=args;vi.unstubAllGlobals();await rm(dir,{recursive:true,force:true});}
});
