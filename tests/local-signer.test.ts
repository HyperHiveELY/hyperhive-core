import {it,expect,vi,afterEach} from 'vitest';
import {mkdtemp,rm,chmod,stat,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalKeys,pinnedLocalSigner} from '../apps/signer/local-keys.js';
import {assertLocalConfig} from '../packages/core/local-mode.js';
import {LOCAL_MEASUREMENT,LOCAL_ROOT,verifyLocalIdentity} from '../packages/core/local-identity.js';
import {config} from '../packages/core/config.js';
import {Database} from '../packages/core/db.js';
import {Signer} from '../apps/signer/engine.js';
import {crew} from './fixtures.js';
import {verifySlip} from '../packages/core/proof.js';
import {agentName} from '../packages/core/agent-name.js';
import {hasSubscription} from '../packages/core/billing.js';
vi.mock('@phala/dstack-sdk',()=>({DstackClient:class{constructor(){throw Error('Must not construct Phala in local mode');}info(){throw Error('Must not call Phala in local mode');}getQuote(){throw Error('Must not call Phala in local mode');}}}));
const localConfig={SIGNER_MODE:'local' as const,HOST:'127.0.0.1',PUBLIC_ORIGIN:'http://localhost:5188',DATABASE_URL:'postgresql://test@127.0.0.1/test',NODE_ENV:'test'};
afterEach(()=>vi.restoreAllMocks());
it('rejects public hosting, remote databases, production, and implicit local mode',()=>{
 expect(()=>assertLocalConfig(localConfig)).not.toThrow();
 for(const change of [{HOST:'0.0.0.0'},{PUBLIC_ORIGIN:'https://public.example'},{DATABASE_URL:'postgresql://test@database.example/test'},{NODE_ENV:'production'},{SIGNER_MODE:'phala' as const}])expect(()=>assertLocalConfig({...localConfig,...change})).toThrow();
});
it('persists private keys with private permissions and separates crews, generations and record signing',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hh-local-key-test-'));
 try{const a=await LocalKeys.load(true,dir),b=await LocalKeys.load(false,dir),c=await crew();expect((await stat(join(dir,'seed.json'))).mode&0o777).toBe(0o600);expect((await stat(dir)).mode&0o777).toBe(0o700);expect(a.agent(c.id,0).address).toBe(b.agent(c.id,0).address);expect(a.agent(c.id,0).address).not.toBe(a.agent(c.id,1).address);expect(a.agent(c.id,0).address).not.toBe(a.signer.address);expect(a.agent(c.id,0).address).not.toBe(a.agent('22222222-2222-4222-8222-222222222222',0).address);expect(await pinnedLocalSigner(dir)).toBe(a.signer.address.toLowerCase());expect(await readFile(join(dir,'identity.json'),'utf8')).not.toContain('seed');await chmod(join(dir,'seed.json'),0o644);await expect(LocalKeys.load(false,dir)).rejects.toThrow('0600');}finally{await rm(dir,{recursive:true,force:true});}
});
it('does not silently create replacement keys or trust a changed public pin',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hh-local-key-test-'));
 try{await expect(LocalKeys.load(false,dir)).rejects.toThrow('keys are missing');await LocalKeys.load(true,dir);await writeFile(join(dir,'identity.json'),JSON.stringify({v:1,signer:'0x0000000000000000000000000000000000000001'}));await expect(LocalKeys.load(false,dir)).rejects.toThrow('pin does not match');}finally{await rm(dir,{recursive:true,force:true});}
});
it('creates policy-bound local identities and locally marked slips without Phala or contracts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hh-local-engine-test-')),db=await new Database('memory').init();
 const before={...config};
 try{
  Object.assign(config,localConfig);const keys=await LocalKeys.load(true,dir);vi.spyOn(LocalKeys,'load').mockResolvedValue(keys);
  const c=await crew();await db.query('INSERT INTO crews(id,owner,account,policy,signature,created_at) VALUES($1,$2,$3,$4,$5,$6)',[c.id,c.owner,c.account,JSON.stringify(c.policy),c.signature,c.created_at]);
  const signer=new Signer(db);await signer.init();await signer.identity(c);
  const identity=(await db.query<any>('SELECT * FROM identities WHERE crew_id=$1',[c.id])).rows[0];
  expect(identity.measurement).toBe(LOCAL_MEASUREMENT);expect(identity.quote.quote).toBeUndefined();
  expect((await verifyLocalIdentity(identity,c,keys.signer.address)).hardwareAttested).toBe(false);
  await expect(verifyLocalIdentity(identity,{...c,policy:{...c.policy,weeklyBudget:999}},keys.signer.address)).rejects.toThrow('policy');
  await expect(verifyLocalIdentity({...identity,agent:c.account},c,keys.signer.address)).rejects.toThrow('pinned');
  await expect(verifyLocalIdentity(identity,c,keys.signer.address,Date.now()+3*3600000)).rejects.toThrow('stale');
  const slip=await (signer as any).journal(c,'CONTROL',{action:'pause'});expect(slip.body.order.signerMode).toBe('local');expect(slip.body.rootContract).toBe(LOCAL_ROOT);expect(await verifySlip(slip)).toBe(true);
  await expect(signer.anchor()).resolves.toBeUndefined();expect(await hasSubscription(c)).toBe(true);
  Object.assign(config,{HOST:'0.0.0.0'});await expect(hasSubscription(c)).rejects.toThrow('loopback');
 }finally{Object.assign(config,before);await db.close();await rm(dir,{recursive:true,force:true});}
});
it('uses the same valid-length agent name for approval and revocation',()=>{const name=agentName('11111111-1111-4111-8111-111111111111');expect(name.length).toBeLessThanOrEqual(16);expect(name).toMatch(/^hh-[a-f0-9]{13}$/);});
it('blocks Start for unfunded, unapproved or unhealthy crews while retaining Pause',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hh-readiness-test-')),db=await new Database('memory').init(),before={...config};
 const keysModule=await import('../apps/signer/local-keys.js'),secrets=await import('../packages/core/secrets.js'),venue=await import('../packages/core/venue.js');
 const {executionReadiness}=await import('../apps/api/readiness.js'),{createServer}=await import('../apps/api/server.js'),{controlMessage,hash}=await import('../packages/core/domain.js'),{wallet}=await import('./fixtures.js');
 let app:Awaited<ReturnType<typeof createServer>>|undefined;
 try{
  Object.assign(config,localConfig,{LIVE_TRADING_ENABLED:'true'});
  const keys=await LocalKeys.load(true,dir);vi.spyOn(LocalKeys,'load').mockResolvedValue(keys);vi.spyOn(keysModule,'pinnedLocalSigner').mockResolvedValue(keys.signer.address);
  vi.spyOn(secrets,'ppqKey').mockResolvedValue('test-key');vi.spyOn(secrets,'modelSettings').mockResolvedValue({scout:'openai/test',skeptic:'anthropic/test'});
  const c=await crew();await db.query('INSERT INTO crews(id,owner,account,policy,signature,created_at) VALUES($1,$2,$3,$4,$5,$6)',[c.id,c.owner,c.account,JSON.stringify(c.policy),c.signature,c.created_at]);
  const signer=new Signer(db);await signer.init();await signer.identity(c);
  for(const role of ['worker','signer'])await db.query('INSERT INTO heartbeats VALUES($1,$2,$3)',[role,Date.now(),JSON.stringify({mode:'local',liveEnabled:true})]);
  const state={marginSummary:{accountValue:'100'},withdrawable:'100',assetPositions:[]} as unknown as Awaited<ReturnType<typeof venue.accountState>>;
  const agents=[{address:keys.agent(c.id,c.policy.generation).address,validUntil:Date.now()+60000,name:'test'}];
  const check=(s=state,a=agents)=>executionReadiness(db,c,s,a);
  expect((await check()).checks.find(c=>c.id==='tokens')?.ok).toBe(false);
  await db.query('INSERT INTO token_accounts(owner,available) VALUES($1,$2)',[c.owner,1000000]);
  expect((await check()).ready).toBe(true);
  expect((await check({...state,marginSummary:{...state.marginSummary,accountValue:'0'}})).ready).toBe(false);
  expect((await check(state,[])).checks.find(c=>c.id==='agent')?.ok).toBe(false);
  expect((await check({...state,withdrawable:'0'})).ready).toBe(false);
  expect((await check({...state,marginSummary:{...state.marginSummary,accountValue:'1001'}})).ready).toBe(false);
  expect((await check({...state,assetPositions:[{position:{coin:'BTC',szi:'1'}}] as typeof state.assetPositions})).checks.find(c=>c.id==='journal')?.ok).toBe(false);
  await db.query("UPDATE heartbeats SET updated_at=0 WHERE role='signer'");expect((await check()).ready).toBe(false);
  vi.spyOn(venue,'accountState').mockResolvedValue(state);vi.spyOn(venue.info,'extraAgents').mockResolvedValue([]);
  app=await createServer(db);const headers={origin:'http://localhost:5188'};
  const challenge=(await app.inject({method:'POST',url:'/api/auth/challenge',headers,payload:{address:wallet.address}})).json();
  const login=await app.inject({method:'POST',url:'/api/auth/verify',headers,payload:{message:challenge.message,signature:await wallet.signMessage({message:challenge.message})}});
  const cookie=String(login.headers['set-cookie']).split(';')[0];
  for(const action of ['resume','pause'] as const){
   const nonce=crypto.randomUUID(),issuedAt=Date.now(),signature=await wallet.signMessage({message:controlMessage(c.id,action,nonce,hash(c.policy),issuedAt)});
   const result=await app.inject({method:'POST',url:`/api/crews/${c.id}/control`,headers:{...headers,cookie},payload:{action,nonce,issuedAt,signature}});
   expect(result.statusCode).toBe(action==='resume'?400:200);
  }
  expect((await db.query<{action:string}>('SELECT action FROM controls')).rows.map(c=>c.action)).toEqual(['pause']);
 }finally{await app?.close();Object.assign(config,before);await db.close();await rm(dir,{recursive:true,force:true});}
});
