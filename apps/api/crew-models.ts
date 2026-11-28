import {aiTestingExempt} from '../../packages/core/tokens.js';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import type {Database} from '../../packages/core/db.js';
import {catalog} from '../../packages/ai/models.js';
import {crewModels,modelChoices,modelQuote,selectedPair,EXAMPLE_INPUT,EXAMPLE_OUTPUT} from '../../packages/ai/crew-models.js';
import {integrationSettings} from '../../packages/core/integration-settings.js';
import {modelSettings} from '../../packages/core/secrets.js';
const Selection=z.strictObject({scout:z.string().max(200),skeptic:z.string().max(200),revision:z.number().int().nonnegative(),quote:z.string().regex(/^0x[0-9a-f]{64}$/)});
/** Owner-authorized, per-crew model preferences. Never changes signing or starts a crew. */
export function registerCrewModels(app:FastifyInstance,db:Database,owner:(req:FastifyRequest)=>Promise<string>){
 const owned=async(req:FastifyRequest,id:string)=>{const who=await owner(req);if(!(await db.query('SELECT id FROM crews WHERE id=$1 AND owner=$2',[id,who])).rows.length)throw Object.assign(Error('Crew not found'),{statusCode:404});return who;};
 const collection=async()=>{const markupBps=(await integrationSettings()).aiMarkupBps,models=modelChoices(await catalog(),markupBps);return {models,markupBps,quote:modelQuote(models,markupBps)};};
 app.get<{Params:{id:string}}>('/api/crews/:id/models',async req=>{
  const who=await owned(req,req.params.id);
  return {...await collection(),selection:await crewModels(db,req.params.id),testingExempt:await aiTestingExempt(db,who),defaults:await modelSettings(),example:{input:EXAMPLE_INPUT,output:EXAMPLE_OUTPUT},at:Date.now()};
 });
 app.post<{Params:{id:string}}>('/api/crews/:id/models',async req=>{
  const who=await owned(req,req.params.id),body=Selection.parse(req.body),current=await collection();
  if(body.quote!==current.quote)throw Object.assign(Error('Model availability or prices changed. Refresh the collection and review again.'),{statusCode:409});
  selectedPair(current.models,body.scout,body.skeptic);
  return db.transaction(async tx=>{
   if(!(await tx.query('SELECT id FROM crews WHERE id=$1 AND owner=$2 FOR UPDATE',[req.params.id,who])).rows.length)throw Object.assign(Error('Crew not found'),{statusCode:404});
   const previous=await crewModels(tx,req.params.id);
   if(previous.revision!==body.revision)throw Object.assign(Error('This crew’s models changed in another session. Reload before applying your choice.'),{statusCode:409});
   const revision=previous.revision+1;
   await tx.query('INSERT INTO crew_models(crew_id,scout,skeptic,revision,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(crew_id) DO UPDATE SET scout=excluded.scout,skeptic=excluded.skeptic,revision=excluded.revision,updated_at=excluded.updated_at',[req.params.id,body.scout,body.skeptic,revision,Date.now()]);
   await tx.query('INSERT INTO events(crew_id,kind,message,created_at) VALUES($1,$2,$3,$4)',[req.params.id,'models',`AI models updated: Scout ${body.scout}; Reviewer ${body.skeptic}. Applies to new scans.`,Date.now()]);
   return {selection:{scout:body.scout,skeptic:body.skeptic,revision,source:'crew'}};
  });
 });
}
