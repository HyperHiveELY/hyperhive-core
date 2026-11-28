import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
import Fastify from 'fastify';
import {Database} from '../packages/core/db.js';
import {CURATED_MODELS,modelChoices,selectedPair,modelQuote,crewModels} from '../packages/ai/crew-models.js';
import * as models from '../packages/ai/models.js';
import * as secrets from '../packages/core/secrets.js';
import * as settings from '../packages/core/integration-settings.js';
import {registerCrewModels} from '../apps/api/crew-models.js';
import {inference,analyze} from '../packages/ai/crew.js';
import {ChatCompletionsProvider} from '../packages/ai/chat.js';
import type {Crew} from '../packages/core/domain.js';
const available=CURATED_MODELS.map(m=>({id:m.id,name:m.id.split('/')[1],owned_by:m.provider,type:'chat',supported_parameters:['structured_outputs'],pricing:{type:'per_token',currency:'USD',input_per_1M_tokens:.1,output_per_1M_tokens:.2}}));
let db:Database;const app=Fastify(),owner='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40);
const headers={'x-owner':owner};
const defaults={scout:available[0].id,skeptic:available[1].id};
const path='/api/crews/a/models';
const post=(body:unknown,who=owner)=>app.inject({url:path,method:'POST',headers:{'x-owner':who},payload:body as any});
beforeAll(async()=>{db=await new Database('memory').init();registerCrewModels(app,db,async req=>{const who=req.headers['x-owner'];if(!who)throw Object.assign(Error('Connect wallet'),{statusCode:401});return String(who);});for(const [id,who] of [['a',owner],['b',other]])await db.query('INSERT INTO crews(id,owner,account,policy,signature,created_at) VALUES($1,$2,$3,$4,$5,$6)',[id,who,who,JSON.stringify({name:id,plan:'crew'}),'test',Date.now()]);});
afterAll(async()=>{await app.close();await db.close();});
beforeEach(()=>{vi.restoreAllMocks();vi.spyOn(models,'catalog').mockResolvedValue(available);vi.spyOn(secrets,'modelSettings').mockResolvedValue(defaults);vi.spyOn(secrets,'ppqKey').mockResolvedValue('test-only');vi.spyOn(settings,'integrationSettings').mockResolvedValue({aiMarkupBps:1500} as any);});
it('curates only known schema-capable models with finite rates and includes service pricing',()=>{
 expect(modelChoices([...available,{...available[0],id:'random/new-model'}],1500)).toHaveLength(6);
 const choices=modelChoices(available,1500);expect(choices[0].exampleTokens).toBeCloseTo(.828);expect(choices[0].inputRate).toBeCloseTo(.115);
 expect(modelChoices([{...available[0],supported_parameters:[]}],0)).toEqual([]);
 expect(modelChoices([{...available[0],pricing:{...available[0].pricing,input_per_1M_tokens:NaN}}],0)).toEqual([]);
 expect(()=>modelChoices(available,-1)).toThrow();
});
it('requires independent providers even when different Claude model IDs are used',()=>{
 const list=modelChoices(available,0);expect(()=>selectedPair(list,available[1].id,available[2].id)).toThrow('different provider');expect(()=>selectedPair(list,available[0].id,'unknown')).toThrow('collection');expect(selectedPair(list,available[0].id,available[3].id).b.provider).toBe('Google');
});
it('keeps defaults for untouched crews and exposes no credentials',async()=>{
 expect(await crewModels(db,'a')).toEqual({...defaults,source:'default',revision:0});
 const r=await app.inject({url:path,headers});expect(r.statusCode).toBe(200);expect(r.json().selection.scout).toBe(defaults.scout);expect(JSON.stringify(r.json())).not.toMatch(/test-only|ppq/i);
});
it('requires ownership for both reading and changing models',async()=>{
 expect((await app.inject({url:path})).statusCode).toBe(401);expect((await app.inject({url:path,headers:{'x-owner':other}})).statusCode).toBe(404);
 expect((await post({},other)).statusCode).toBe(404);
});
it('rejects stale prices, unsupported models and same-provider pairs without changing the crew',async()=>{
 const view=(await app.inject({url:path,headers})).json(),body={...defaults,revision:0,quote:view.quote};
 expect((await post({...body,quote:'0x'+'0'.repeat(64)})).statusCode).toBe(409);
 expect((await post({...body,scout:'unknown'})).statusCode).not.toBe(200);
 expect((await post({...body,scout:available[1].id,skeptic:available[2].id})).statusCode).not.toBe(200);
 expect((await crewModels(db,'a')).source).toBe('default');
});
it('serializes two edits and persists exactly one owner choice and audit event',async()=>{
 const view=(await app.inject({url:path,headers})).json(),body={scout:available[4].id,skeptic:available[3].id,revision:0,quote:view.quote};
 const results=await Promise.all([post(body),post(body)]);expect(results.map(r=>r.statusCode).sort()).toEqual([200,409]);
 expect(await crewModels(db,'a')).toEqual({scout:body.scout,skeptic:body.skeptic,revision:1,source:'crew'});
 expect((await crewModels(db,'b')).source).toBe('default');expect((await db.query("SELECT * FROM events WHERE kind='models'")).rows).toHaveLength(1);
 expect((await db.query<any>("SELECT paused FROM crews WHERE id='a'")).rows[0].paused).toBe(true);
});
it('runs the selected scout and reviewer through actual inference and metering handlers',async()=>{
 await db.query('INSERT INTO ai_billing_exemptions(owner,enabled,updated_at) VALUES($1,true,$2) ON CONFLICT(owner) DO UPDATE SET enabled=true',[owner,Date.now()]);
 const invoke=vi.spyOn(ChatCompletionsProvider.prototype,'infer').mockImplementation(async req=>({output:req.schemaName==='hyperhive'&&req.model===available[4].id?{card:{market:'HYPE',side:'long',invalidationPx:24,horizonH:12,why:'Test evidence'}}:{verdict:'PASS',reasons:['Test evidence']},model:req.model,inputTokens:100,outputTokens:50,costUsd:null,latencyMs:1} as any));
 const crew=(await db.query<Crew>("SELECT * FROM crews WHERE id='a'")).rows[0];
 const result=await analyze(db,crew,{market:'HYPE',mark:25,atr:1,rv:2,oiUsd:100,funding:0,szDecimals:2,maxLeverage:10,asset:0,timestamp:Date.now(),closes:[24,25]},'trend');
 expect(invoke.mock.calls.map(([req])=>req.model)).toEqual([available[4].id,available[3].id]);expect(result?.body.model).toBe(available[4].id);expect(result?.body.skepticModel).toBe(available[3].id);
 const usage=(await db.query<any>('SELECT model,status FROM token_usage')).rows;expect(usage).toHaveLength(2);expect(usage.every(u=>u.status==='SETTLED')).toBe(true);
});
it('holds an in-flight pair and fails closed when a selected model disappears',async()=>{
 const crew=(await db.query<Crew>("SELECT * FROM crews WHERE id='a'")).rows[0],old=await inference(db,crew);
 await db.query("UPDATE crew_models SET scout=$1 WHERE crew_id='a'",[available[0].id]);expect(old.scout).toBe(available[4].id);expect((await inference(db,crew)).scout).toBe(available[0].id);
 vi.spyOn(models,'catalog').mockResolvedValue(available.slice(1));await expect(inference(db,crew)).rejects.toThrow('collection');
});
it('changes the review quote when the price or available collection changes',()=>{const choices=modelChoices(available,0);expect(modelQuote(choices,0)).not.toBe(modelQuote(choices,100));expect(modelQuote(choices,0)).not.toBe(modelQuote(choices.slice(1),0));});
