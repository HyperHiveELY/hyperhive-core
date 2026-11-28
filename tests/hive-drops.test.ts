import {beforeAll,afterAll,beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {Database} from '../packages/core/db.js';
import {config} from '../packages/core/config.js';
import {integrationSettings,saveIntegrationSettings} from '../packages/core/integration-settings.js';
import {tokenBenefit,builderFeeFor} from '../packages/core/entitlements.js';
import {claimHiveDrop,hiveDropStatus,hiveDropWeek} from '../packages/core/hive-drops.js';
import {tokenBalance} from '../packages/core/tokens.js';
import {createServer} from '../apps/api/server.js';

const state=vi.hoisted(()=>({balance:100000n*10n**18n,chain:99901,fail:false,reads:0,addresses:[] as string[]}));
vi.mock('../packages/core/secrets.js',async original=>({...await original<typeof import('../packages/core/secrets.js')>(),secrets:async()=>({}),saveIntegrationSecrets:async()=>{}}));
vi.mock('viem',async original=>({...await original<typeof import('viem')>(),createPublicClient:()=>({getChainId:async()=>state.chain,readContract:async({functionName,address}:any)=>{state.addresses.push(address);if(state.fail)throw Error('RPC unavailable');if(functionName==='balanceOf'){state.reads++;return state.balance;}return functionName==='decimals'?18:'HIVE';}})}));
const owner='0x'+'ab'.repeat(20),other='0x'+'cd'.repeat(20),token='0x'+'11'.repeat(20),headers={origin:config.PUBLIC_ORIGIN},session='sample-session';
const defaults={credits:config.HIVE_WEEKLY_CREDITS,budget:config.HIVE_WEEKLY_CREDIT_BUDGET,token:config.TOKEN_CA};
let db:Database;
beforeAll(async()=>{db=await new Database('memory').init();});
beforeEach(async()=>{
 for(const table of ['hive_drop_claims','hive_drop_weeks','token_accounts','events','sessions'])await db.query('DELETE FROM '+table);
 config.TOKEN_CA=token;config.HIVE_WEEKLY_CREDITS=5000;config.HIVE_WEEKLY_CREDIT_BUDGET=500000;
 vi.stubEnv('HIVE_CONTRACT','');vi.stubEnv('HIVE_BENEFIT_THRESHOLD','');vi.stubEnv('INTEGRATION_SETTINGS','{}');
 Object.assign(state,{balance:100000n*10n**18n,chain:99901,fail:false,reads:0,addresses:[]});
 await tokenBenefit(owner,true);await tokenBenefit(other,true);
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();Object.assign(config,{TOKEN_CA:defaults.token,HIVE_WEEKLY_CREDITS:defaults.credits,HIVE_WEEKLY_CREDIT_BUDGET:defaults.budget});});
afterAll(async()=>db.close());

it('uses TOKEN_CA and the 100,000 default for both the drop and fee tier, with explicit overrides',async()=>{
 expect(await integrationSettings()).toMatchObject({token,tokenThreshold:'100000'});
 expect(await builderFeeFor(owner)).toBe(20);
 vi.stubEnv('HIVE_CONTRACT',other);vi.stubEnv('HIVE_BENEFIT_THRESHOLD','200000');
 expect(await integrationSettings()).toMatchObject({token:other,tokenThreshold:'200000'});
 expect((await tokenBenefit(owner,true)).eligible).toBe(false);expect(state.addresses.at(-1)).toBe(other);expect(await builderFeeFor(owner)).toBe(30);
 vi.stubEnv('INTEGRATION_SETTINGS','');
 await expect(saveIntegrationSettings({token,tokenThreshold:'200000'})).rejects.toThrow('managed by the deployment');
 vi.stubEnv('HIVE_CONTRACT','');
 await expect(saveIntegrationSettings({token:other,tokenThreshold:'200000'})).rejects.toThrow('managed by the deployment');
});
it.each([
 ['2026-11-29T23:59:59.999Z','2026-W48','2026-11-30T00:00:00.000Z'],
 ['2026-11-30T00:00:00.000Z','2026-W49','2026-12-07T00:00:00.000Z'],
 ['2021-01-01T12:00:00Z','2020-W53','2021-01-04T00:00:00.000Z'],
 ['2024-12-30T00:00:00Z','2025-W01','2025-01-06T00:00:00.000Z'],
])('uses ISO weeks in UTC at %s',(time,week,nextDropAt)=>{expect(hiveDropWeek(Date.parse(time))).toEqual({week,nextDropAt});});
it('credits exactly once under double clicks, normalizes owners and records a single event',async()=>{
 await db.query('INSERT INTO token_accounts(owner,available,reserved) VALUES($1,123000,7000)',[owner]);
 const claims=await Promise.all([claimHiveDrop(db,owner),claimHiveDrop(db,owner.toUpperCase().replace('0X','0x')),claimHiveDrop(db,owner)]);
 expect(claims[0]).toEqual(claims[1]);expect(claims[0]).toEqual(claims[2]);
 expect(await tokenBalance(db,owner)).toEqual({available:5123,reserved:7});
 expect((await db.query('SELECT * FROM hive_drop_claims')).rows).toHaveLength(1);
 expect((await db.query('SELECT message FROM events')).rows).toEqual([{message:'$HIVE holder drop'}]);
 expect(await hiveDropStatus(db,owner)).toMatchObject({configured:true,balance:'100000',threshold:'100000',eligible:true,weeklyCredits:5000,claimedThisWeek:true,budgetLeft:495000});
});
it('bypasses a previously eligible cached balance and rejects even one unit below the threshold',async()=>{
 state.balance-=1n;const before=state.reads;
 expect((await tokenBenefit(owner)).eligible).toBe(true);
 await expect(claimHiveDrop(db,owner)).rejects.toThrow('Hold at least');expect(state.reads).toBe(before+1);
 expect(await tokenBalance(db,owner)).toEqual({available:0,reserved:0});
 expect((await db.query('SELECT * FROM hive_drop_claims')).rows).toHaveLength(0);
});
it('fails closed on missing configuration, wrong chain and RPC errors without hiding credit balances',async()=>{
 config.TOKEN_CA='';await expect(claimHiveDrop(db,owner)).rejects.toThrow('not set up');
 expect(await hiveDropStatus(db,owner)).toMatchObject({configured:false,eligible:false});
 config.TOKEN_CA=token;state.chain=999;await expect(claimHiveDrop(db,owner)).rejects.toThrow('Could not check');
 state.chain=99901;state.fail=true;await expect(claimHiveDrop(db,owner)).rejects.toThrow('Could not check');
 vi.spyOn(Date,'now').mockReturnValue(Date.now()+60000);
 expect(await hiveDropStatus(db,owner)).toMatchObject({configured:true,balance:null,eligible:false,error:'Could not check your $HIVE balance. Try again.'});
 expect(await builderFeeFor(owner)).toBe(30);expect((await tokenBalance(db,owner)).available).toBe(0);
});
it('serializes different wallets against the shared budget and never gives partial drops',async()=>{
 config.HIVE_WEEKLY_CREDIT_BUDGET=7500;
 const outcomes=await Promise.allSettled([claimHiveDrop(db,owner),claimHiveDrop(db,other)]);
 expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 expect(outcomes.filter(r=>r.status==='rejected')).toHaveLength(1);
 expect((await tokenBalance(db,owner)).available+(await tokenBalance(db,other)).available).toBe(5000);
 expect((await hiveDropStatus(db,owner)).budgetLeft).toBe(2500);
 config.HIVE_WEEKLY_CREDIT_BUDGET=0;
 const claimed=(await db.query<{owner:string}>('SELECT owner FROM hive_drop_claims')).rows[0].owner;
 await claimHiveDrop(db,claimed);expect((await hiveDropStatus(db,claimed)).budgetLeft).toBe(0);
 await expect(claimHiveDrop(db,claimed===owner?other:owner)).rejects.toThrow('all been claimed');
});
it('resets claims and the global pool on Monday UTC',async()=>{
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-11-29T23:59:59.999Z'));
 config.HIVE_WEEKLY_CREDIT_BUDGET=5000;await claimHiveDrop(db,owner);
 clock.mockReturnValue(Date.parse('2026-11-30T00:00:00Z'));
 expect(await hiveDropStatus(db,owner)).toMatchObject({claimedThisWeek:false,budgetLeft:5000});
 await claimHiveDrop(db,owner);expect((await tokenBalance(db,owner)).available).toBe(10000);
 expect((await db.query('SELECT week FROM hive_drop_claims ORDER BY week')).rows).toEqual([{week:'2026-W48'},{week:'2026-W49'}]);
});
it('rolls back the claim, account and budget if the event write fails, then allows retry',async()=>{
 const transaction=db.transaction.bind(db);
 vi.spyOn(db,'transaction').mockImplementationOnce(fn=>transaction(q=>fn({query:async(sql,args)=>{if(sql.startsWith('INSERT INTO events'))throw Error('event write failed');return q.query(sql,args);}})));
 await expect(claimHiveDrop(db,owner)).rejects.toThrow('event write failed');
 expect((await db.query('SELECT * FROM hive_drop_claims')).rows).toHaveLength(0);
 expect((await tokenBalance(db,owner)).available).toBe(0);expect((await hiveDropStatus(db,owner)).budgetLeft).toBe(500000);
 await claimHiveDrop(db,owner);expect((await tokenBalance(db,owner)).available).toBe(5000);
});
it('authenticates claims, rejects spoofed inputs and foreign origins, returns private history and limits attempts',async()=>{
 const app=await createServer(db);
 await db.query('INSERT INTO sessions(token,owner,expires_at) VALUES($1,$2,$3)',[createHash('sha256').update(session).digest('hex'),owner,Date.now()+60000]);
 const request=(payload:Record<string,unknown>={},h:Record<string,string>={...headers,cookie:'hh_session='+session})=>app.inject({method:'POST',url:'/api/tokens/hive-drop',headers:h,payload});
 try{
  expect((await request({},headers)).statusCode).toBe(401);
  expect((await request({},{...headers,cookie:'hh_session=expired'})).statusCode).toBe(401);
  expect((await request({owner:other,units:100000})).statusCode).toBe(400);
  expect((await request({},{origin:'https://foreign.invalid',cookie:'hh_session='+session})).statusCode).toBe(400);
  const result=await request();expect(result.statusCode).toBe(200);expect(result.json()).toMatchObject({available:5000,hive:{claimedThisWeek:true},hiveDrops:[{label:'$HIVE holder drop',units:5000000}]});
  for(let i=0;i<9;i++)expect((await request()).statusCode).toBe(200);
  const limited=await request();expect(limited.statusCode).toBe(429);expect(limited.headers['retry-after']).toBeDefined();
  const status=await app.inject({url:'/api/tokens',headers:{cookie:'hh_session='+session}});expect(status.statusCode).toBe(200);expect(status.json().hiveDrops).toHaveLength(1);
  expect((await app.inject({url:'/api/tokens'})).statusCode).toBe(401);
  await db.query('UPDATE sessions SET owner=$1',[other]);
  const peer=(await app.inject({url:'/api/tokens',headers:{cookie:'hh_session='+session}})).json();expect(peer.hiveDrops).toEqual([]);expect(peer.available).toBe(0);expect(peer.hive.claimedThisWeek).toBe(false);
  expect((await app.inject({url:'/api/tokens/pricing'})).json().hive).toEqual({configured:true,threshold:'100000',weeklyCredits:5000});
 }finally{await app.close();}
});
