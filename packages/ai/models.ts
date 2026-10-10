export interface Model {id:string;name:string;owned_by:string;type:string;supported_parameters:string[];pricing:{type:string;currency:string;input_per_1M_tokens:number;output_per_1M_tokens:number;reasoning_per_1M_tokens?:number}}
let cache:{time:number;models:Model[]}|undefined;
/** Fetch and cache the model catalog used to validate inference configuration. */
export async function catalog(){if(cache&&Date.now()-cache.time<3600000)return cache.models;const r=await fetch('https://api.ppq.ai/v1/models',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('AI model catalog unavailable');const body=await r.json() as {data:Model[]};if(!Array.isArray(body.data))throw Error('Invalid AI model catalog');cache={time:Date.now(),models:body.data.filter(m=>m.type==='chat')};return cache.models;}
/** Resolve the selected scout and skeptic against the current supported model catalog. */
export async function validateModels(scout:string,skeptic:string){const models=await catalog(),a=models.find(m=>m.id===scout),b=models.find(m=>m.id===skeptic);if(!a||!b)throw Error('Both model IDs must exist in the current model catalog');if(a.owned_by===b.owned_by)throw Error('Scouts and Skeptic must use different model providers');return {a,b};}
/** Estimate the maximum quoted inference cost before reserving funds for a request. */
export function reserveCeiling(model:Model,system:string,user:string,schema:unknown,maxOutput=600){
  const p=model.pricing;if(p.type!=='per_token'||p.currency!=='USD'||![p.input_per_1M_tokens,p.output_per_1M_tokens].every(n=>Number.isFinite(n)&&n>=0))throw Error('Model pricing cannot be bounded');
  // UTF-8 byte count is a conservative token bound, plus framing/schema overhead.
  const input=new TextEncoder().encode(system+user+JSON.stringify(schema)).length+2048;
  const amount=(input*p.input_per_1M_tokens+maxOutput*Math.max(p.output_per_1M_tokens,p.reasoning_per_1M_tokens??0))/1e6;
  return Math.ceil(amount*1.1*1e6)/1e6;
}
/** Resolve reported inference charges or derive a charge from model pricing and token counts. */
export function usageCost(model:Model,result:{inputTokens:number|null;outputTokens:number|null;costUsd?:number|null}){
 const p=model.pricing;
 if(![result.inputTokens,result.outputTokens].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0))throw Error('AI usage is missing');
 reserveCeiling(model,'','',{});
 // Catalog rates include the gateway's service cost. Do not bill upstream-only cost.
 const amount=(result.inputTokens!*p.input_per_1M_tokens+result.outputTokens!*Math.max(p.output_per_1M_tokens,p.reasoning_per_1M_tokens??0))/1e6;
 return Math.max(amount,result.costUsd??0);
}
