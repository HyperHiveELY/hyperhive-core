// Real wallet signatures, AI accounting, database and execution engine; only
// external AI/venue boundaries are simulated. No order leaves this process.
import {it,expect,vi,afterEach} from 'vitest';
import {Database} from '../packages/core/db.js';
import {Signer} from '../apps/signer/engine.js';
import {config} from '../packages/core/config.js';
import {crew,wallet,market} from './fixtures.js';
import {controlMessage,hash,policyMessage,type Crew} from '../packages/core/domain.js';
import {LOCAL_ROOT,LOCAL_MEASUREMENT} from '../packages/core/local-identity.js';
import * as venue from '../packages/core/venue.js';
import * as models from '../packages/ai/models.js';
import * as secrets from '../packages/core/secrets.js';
import * as settings from '../packages/core/integration-settings.js';
import * as benefits from '../packages/core/entitlements.js';
import {ChatCompletionsProvider} from '../packages/ai/chat.js';
import {think} from '../packages/ai/crew.js';
import {tokenBalance} from '../packages/core/tokens.js';
import {verifyChain} from '../packages/core/proof.js';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
vi.mock('@phala/dstack-sdk',()=>({DstackClient:class{}}));
const baseline={...config};
afterEach(()=>{Object.assign(config,baseline);vi.restoreAllMocks();});
async function setup(){
 Object.assign(config,{NODE_ENV:'test',SIGNER_MODE:'local',HOST:'127.0.0.1',PUBLIC_ORIGIN:'http://localhost:5188',LIVE_TRADING_ENABLED:'true',BUILDER_ADDRESS:undefined});
 vi.spyOn(settings,'integrationSettings').mockResolvedValue({aiMarkupBps:2500,tokenThreshold:'10000',termsText:'',blockedCountries:[],eligibilityEnabled:false});
 const db=await new Database('memory').init(),c=await crew();c.policy={...c.policy,weeklyBudget:5,maxAccountValue:100};c.signature=await wallet.signMessage({message:policyMessage(c.policy)});
 await db.query('INSERT INTO crews(id,owner,account,policy,signature,created_at) VALUES($1,$2,$3,$4,$5,$6)',[c.id,c.owner,c.account,JSON.stringify(c.policy),c.signature,c.created_at]);
 await db.query('INSERT INTO token_accounts(owner,available) VALUES($1,5000000)',[c.owner]);
 const state:any={marginSummary:{accountValue:'50'},withdrawable:'50',assetPositions:[]};let open:any[]=[];let oid=100;const history=new Map<string,any>();const fills:any[]=[];
 vi.spyOn(venue,'accountState').mockImplementation(async()=>structuredClone(state));
 vi.spyOn(venue,'snapshot').mockImplementation(async()=>({...market,timestamp:Date.now()}));
 vi.spyOn(venue,'markets').mockResolvedValue([{name:'BTC'}] as any);
 vi.spyOn(venue,'allFills').mockImplementation(async()=>fills);
 vi.spyOn(venue.info,'userFunding').mockResolvedValue([]);
 vi.spyOn(venue.info,'meta').mockResolvedValue({universe:[{name:'BTC'}]} as any);
 vi.spyOn(venue.info,'extraAgents').mockResolvedValue([{address:wallet.address,validUntil:Date.now()+86400000}] as any);
 vi.spyOn(venue.info,'userFees').mockResolvedValue({userCrossRate:'0.00045'} as any);
 vi.spyOn(venue.info,'frontendOpenOrders').mockImplementation(async()=>structuredClone(open));
 vi.spyOn(venue.info,'orderStatus').mockImplementation(async({oid:id})=>history.get(String(id))??{status:'unknownOid'});
 vi.spyOn(venue.info,'activeAssetData').mockResolvedValue({leverage:{type:'isolated',value:2}} as any);
 const exchange={updateLeverage:vi.fn(async()=>({status:'ok',response:{type:'default'}})),order:vi.fn(async({orders}:any)=>({status:'ok',response:{type:'order',data:{statuses:orders.map((o:any)=>{
  const id=++oid;
  history.set(o.c,{status:'order',order:{order:{oid:id},status:'filled'}});
  if('trigger' in o.t){open.push({oid:id,coin:'BTC',reduceOnly:true,orderType:o.t.trigger.tpsl==='sl'?'Stop Market':'Take Profit Market'});return {resting:{oid:id}};}
  if(o.r)state.assetPositions=[];
  else state.assetPositions=[{position:{coin:'BTC',szi:o.s,entryPx:'60000',cumFunding:{sinceOpen:'0'}}}];
  fills.push({oid:id,tid:id,coin:'BTC',time:Date.now(),startPosition:'0',side:o.b?'B':'A',sz:o.s,closedPnl:'0',fee:'0.01'});return {filled:{totalSz:o.s,avgPx:'60000',oid:id}};
 })}}})),cancel:vi.fn(async()=>{open=[];return {status:'ok'};}),modify:vi.fn(async()=>({status:'ok',response:{type:'order',data:{statuses:[{error:'Rejected for test'}]}}}))};
 const makeSigner=()=>{const s=new Signer(db);Object.assign(s,{slipKey:wallet,measurement:LOCAL_MEASUREMENT,rootContract:LOCAL_ROOT,local:true});vi.spyOn(s as any,'key').mockResolvedValue(wallet);vi.spyOn(s as any,'client').mockResolvedValue(exchange);return s;};
 const control=async(action:'resume'|'pause'|'close')=>{const nonce=crypto.randomUUID(),issuedAt=Date.now();await db.query('INSERT INTO controls(nonce,crew_id,action,signature,created_at,policy_hash,issued_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[nonce,c.id,action,await wallet.signMessage({message:controlMessage(c.id,action,nonce,hash(c.policy),issuedAt)}),issuedAt,hash(c.policy),issuedAt]);};
 const ai=async()=>{
  vi.spyOn(secrets,'ppqKey').mockResolvedValue('test-only');vi.spyOn(secrets,'modelSettings').mockResolvedValue({scout:'test/scout',skeptic:'other/skeptic'});
  const m:any={pricing:{type:'per_token',currency:'USD',input_per_1M_tokens:.4,output_per_1M_tokens:1.6}};vi.spyOn(models,'validateModels').mockResolvedValue({a:m,b:m});
  vi.spyOn(ChatCompletionsProvider.prototype,'infer').mockImplementation(async req=>({model:req.model,output:req.model==='test/scout'?{card:{market:'BTC',side:'long',invalidationPx:59400,horizonH:4,why:'Test market evidence'}}:{verdict:'PASS',reasons:['Test evidence passes']},inputTokens:100,outputTokens:50,costUsd:null}) as any);
  await think(db,c,{...market,timestamp:Date.now()},'trend');
  return (await db.query<any>('SELECT * FROM cards WHERE crew_id=$1',[c.id])).rows[0];
 };
 const enter=async(s:Signer)=>{const card=await ai();await control('resume');(s as any).entryTimes.set(card.id,0);await s.enter(c);return card;};
 return {db,c,state,exchange,makeSigner,control,ai,enter,open:()=>open};
}
it('meters AI, signs an entry and both protections, recovers after restart, pauses and closes with a verifiable record',async()=>{
 const t=await setup();try{
  const signer=t.makeSigner();const card=await t.enter(signer);
  expect((await t.db.query<any>('SELECT status FROM cards WHERE id=$1',[card.id])).rows[0].status).toBe('FILLED');
  expect((await tokenBalance(t.db,t.c.owner)).available).toBeLessThan(5000);
  expect(t.exchange.order).toHaveBeenCalledOnce();expect(t.open()).toHaveLength(2);
  expect(t.exchange.order.mock.calls[0][0].orders.map((o:any)=>o.r)).toEqual([false,true,true]);
  await t.db.query('DELETE FROM positions');await t.db.query("UPDATE slips SET ack=NULL WHERE body->>'kind'='ENTRY'");
  const restarted=t.makeSigner();await restarted.recover(t.c);
  expect((await t.db.query('SELECT * FROM positions')).rows).toHaveLength(1);
  expect((await t.db.query('SELECT * FROM slips WHERE ack IS NULL')).rows).toHaveLength(0);
  await t.control('pause');await restarted.controls(t.c);await restarted.enter(t.c);expect(t.exchange.order).toHaveBeenCalledOnce();await restarted.exits(t.c);expect(t.open()).toHaveLength(2);
  config.BUILDER_ADDRESS='0x'+'22'.repeat(20);const fee=vi.spyOn(benefits,'builderFeeFor').mockRejectedValue(Error('Fee service unavailable'));
  await t.control('close');await restarted.controls(t.c);
  expect(t.state.assetPositions).toHaveLength(0);expect(t.open()).toHaveLength(0);expect((await t.db.query('SELECT * FROM positions')).rows).toHaveLength(0);expect(fee).not.toHaveBeenCalled();expect(t.exchange.order.mock.calls[1][0]).not.toHaveProperty('builder');
  expect(await verifyChain((await t.db.query<any>('SELECT * FROM slips ORDER BY seq')).rows)).toBe(true);
 }finally{await t.db.close();}
});
it('does not re-send an entry after a lost acknowledgement and still reconstructs its accepted fill',async()=>{
 const t=await setup();try{const s=t.makeSigner();const original=t.exchange.order.getMockImplementation()!;t.exchange.order.mockImplementationOnce(async args=>{await original(args);throw Error('Lost response');});
  await expect(t.enter(s)).rejects.toThrow('Lost response');expect((await t.db.query('SELECT * FROM positions')).rows).toHaveLength(0);
  const restarted=t.makeSigner();await restarted.recover(t.c);await restarted.enter(t.c);expect(t.exchange.order).toHaveBeenCalledOnce();expect((await t.db.query('SELECT * FROM positions')).rows).toHaveLength(1);
 }finally{await t.db.close();}
});
it('closes a filled entry if either protective order is rejected',async()=>{
 const t=await setup();try{const original=t.exchange.order.getMockImplementation()!;t.exchange.order.mockImplementationOnce(async args=>{const r=await original(args);r.response.data.statuses[2]={error:'Protection rejected'} as any;return r;});await t.enter(t.makeSigner());expect(t.state.assetPositions).toHaveLength(0);expect(t.exchange.order).toHaveBeenCalledTimes(2);expect((await t.db.query('SELECT * FROM positions')).rows).toHaveLength(0);}finally{await t.db.close();}
});
it('rejects a card interrupted before its entry intent was persisted',async()=>{
 const t=await setup();try{const card=await t.ai();await t.db.query("UPDATE cards SET status='SENDING' WHERE id=$1",[card.id]);await t.makeSigner().recover(t.c);expect((await t.db.query<any>('SELECT status FROM cards WHERE id=$1',[card.id])).rows[0].status).toBe('REJECTED');expect(t.exchange.order).not.toHaveBeenCalled();}finally{await t.db.close();}
});
it('keeps the previously confirmed stop after a rejected trailing modification',async()=>{
 const t=await setup();try{const s=t.makeSigner();await t.enter(s);const before=(await t.db.query<any>('SELECT body FROM positions')).rows[0].body.state.stop;vi.mocked(venue.snapshot).mockResolvedValue({...market,mark:64000,timestamp:Date.now()});await s.exits(t.c);expect(t.exchange.modify).toHaveBeenCalledOnce();expect((await t.db.query<any>('SELECT body FROM positions')).rows[0].body.state.stop).toBe(before);}finally{await t.db.close();}
});
it('keeps exit cycles moving while an anchor receipt is pending, without overlapping anchors',async()=>{
 const t=await setup();let finish!:()=>void;try{const s=t.makeSigner();const anchor=vi.spyOn(s,'anchor').mockImplementation(()=>new Promise<void>(r=>finish=r));const exits=vi.spyOn(s,'exits');await s.tick();await s.tick();expect(exits).toHaveBeenCalledTimes(2);expect(anchor).toHaveBeenCalledOnce();finish();await Promise.resolve();}finally{await t.db.close();}
});

it('suppresses an admitted entry when Pause arrives before the venue send',async()=>{
 const t=await setup();
 try{
  t.exchange.updateLeverage.mockImplementationOnce(async()=>{
   await t.control('pause');
   return {status:'ok',response:{type:'default'}};
  });
  await expect(t.enter(t.makeSigner())).rejects.toThrow('Entry authorization changed');
  expect(t.exchange.order).not.toHaveBeenCalled();
  expect((await t.db.query("SELECT id FROM cards WHERE status='SENDING'")).rows).toHaveLength(0);
  expect((await t.db.query('SELECT digest FROM slips WHERE ack IS NULL')).rows).toHaveLength(0);
 }finally{await t.db.close();}
});
it('resolves a lost cancel acknowledgement only after all target orders reach terminal status',async()=>{
 const t=await setup();
 try{
  const s=t.makeSigner();
  const slip=await (s as any).journal(t.c,'CANCEL',{cancels:[{a:0,o:100},{a:0,o:101}]});
  const unresolved=async()=>(await t.db.query('SELECT digest FROM slips WHERE digest=$1 AND ack IS NULL',[slip.digest])).rows.length;
  vi.mocked(venue.info.orderStatus).mockImplementation(async({oid})=>({status:'order',order:{order:{oid},status:oid===100?'canceled':'open'}}) as any);
  await s.recover(t.c);expect(await unresolved()).toBe(1);
  vi.mocked(venue.info.orderStatus).mockImplementation(async({oid})=>({status:'order',order:{order:{oid},status:'canceled'}}) as any);
  await s.recover(t.c);expect(await unresolved()).toBe(0);
 }finally{await t.db.close();}
});
it('settles an interrupted card from its signed fill after the account is flat',async()=>{
 const t=await setup();
 try{
  const signer=t.makeSigner();await t.enter(signer);
  await t.db.query("UPDATE cards SET status='SENDING' WHERE status='FILLED'");
  await t.db.query('DELETE FROM positions');t.state.assetPositions=[];
  await signer.recover(t.c);
  expect((await t.db.query("SELECT id FROM cards WHERE status='FILLED'")).rows).toHaveLength(1);
  expect(t.exchange.order).toHaveBeenCalledOnce();
 }finally{await t.db.close();}
});
it('leaves an independently reopened position alone when signed management state survives a restart',async()=>{
 const t=await setup();
 try{
  await t.enter(t.makeSigner());const old=(await venue.allFills(t.c.account,0))[0];
  vi.mocked(venue.allFills).mockResolvedValue([old,{...old,oid:900,tid:900,time:old.time+1,side:'A',startPosition:old.sz},{...old,oid:901,tid:901,time:old.time+2}]);
  await expect(t.makeSigner().exits(t.c)).rejects.toThrow('continuity');
  expect(t.exchange.order).toHaveBeenCalledOnce();expect(t.exchange.modify).not.toHaveBeenCalled();expect(t.exchange.cancel).not.toHaveBeenCalled();
 }finally{await t.db.close();}
});

it('counts funding paid this week against the weekly risk budget',async()=>{
 const t=await setup();try{
  vi.mocked(venue.info.userFunding).mockResolvedValue([{time:Date.now(),hash:'0x01',delta:{type:'funding',coin:'BTC',usdc:'-5',szi:'1',fundingRate:'0.01',nSamples:null}}] as any);
  const card=await t.enter(t.makeSigner());
  const row=(await t.db.query<any>('SELECT status,reason FROM cards WHERE id=$1',[card.id])).rows[0];
  expect(row).toMatchObject({status:'REJECTED',reason:'Weekly risk budget exhausted'});expect(t.exchange.order).not.toHaveBeenCalled();
 }finally{await t.db.close();}
});
it('re-places the stop and take-profit at once when a partial fill cancels them',async()=>{
 const t=await setup();try{
  const original=t.exchange.order.getMockImplementation()!;
  t.exchange.order.mockImplementationOnce(async args=>{const r=await original(args);t.open().splice(0);return r;});
  await t.enter(t.makeSigner());
  expect(t.exchange.order).toHaveBeenCalledTimes(2);
  expect(t.exchange.order.mock.calls[1][0]).toMatchObject({grouping:'positionTpsl'});
  expect(t.open()).toHaveLength(2);
  expect((await t.db.query("SELECT digest FROM slips WHERE body->>'kind' IN ('SL','TP')")).rows.length).toBeGreaterThanOrEqual(2);
 }finally{await t.db.close();}
});
it('orders controls by arrival, so a fast-clock Resume cannot undo a later Pause',async()=>{
 const t=await setup();try{
  const s=t.makeSigner(),now=Date.now();
  const insert=async(action:'resume'|'pause',issuedAt:number,createdAt:number)=>{const nonce=crypto.randomUUID();await t.db.query('INSERT INTO controls(nonce,crew_id,action,signature,created_at,policy_hash,issued_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[nonce,t.c.id,action,await wallet.signMessage({message:controlMessage(t.c.id,action,nonce,hash(t.c.policy),issuedAt)}),createdAt,hash(t.c.policy),issuedAt]);};
  await insert('resume',now+240000,now);await insert('pause',now+1000,now+1000);
  expect(await s.controls(t.c)).toBe(true);
  expect(await (s as any).db.transaction((tx:any)=>(s as any).admission(tx,{...t.c,paused:false}))).toBe(false);
 }finally{await t.db.close();}
});
it('executes only cards signed by the configured card signer',async()=>{
 const t=await setup();try{
  const key=generatePrivateKey();Object.assign(config,{CARD_SIGNING_KEY:key,CARD_SIGNER_ADDRESS:privateKeyToAccount(key).address});
  const signed=await t.enter(t.makeSigner());
  expect((await t.db.query<any>('SELECT status,attestation FROM cards WHERE id=$1',[signed.id])).rows[0]).toMatchObject({status:'FILLED',attestation:{v:1}});
 }finally{await t.db.close();}
 const u=await setup();try{
  const key=generatePrivateKey();Object.assign(config,{CARD_SIGNING_KEY:key,CARD_SIGNER_ADDRESS:privateKeyToAccount(key).address});
  const card=await u.ai();
  // An attacker with database access flips a rejected idea into a different trade and keeps the old signature.
  const body={...card.body,card:{...card.body.card,side:'short',invalidationPx:61000}},created=card.created_at,id=hash({crew:u.c.id,body,now:created});
  await u.db.query('UPDATE cards SET id=$2,body=$3 WHERE id=$1',[card.id,id,JSON.stringify(body)]);
  await u.control('resume');const s=u.makeSigner();(s as any).entryTimes.set(id,0);await s.enter(u.c);
  expect((await u.db.query<any>('SELECT status,reason FROM cards WHERE id=$1',[id])).rows[0]).toMatchObject({status:'REJECTED',reason:'Card is not signed by the configured card signer'});
  expect(u.exchange.order).not.toHaveBeenCalled();
 }finally{await u.db.close();}
});
