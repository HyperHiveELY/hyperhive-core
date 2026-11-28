import type {Sql} from '../core/db.js';
import {hash} from '../core/domain.js';
import {modelSettings} from '../core/secrets.js';
import {catalog,type Model} from './models.js';

// Deliberate, versioned choices. Catalog availability never opts a new model into trading.
export const CURATED_MODELS=[
 {id:'openai/gpt-4.1-mini',provider:'OpenAI',mark:'O',note:'The original HyperHive scout.'},
 {id:'anthropic/claude-haiku-4.5',provider:'Anthropic',mark:'A',note:'The original HyperHive reviewer.'},
 {id:'anthropic/claude-haiku-5.5',provider:'Anthropic',mark:'A',note:'Another Claude option, with its own usage rates.'},
 {id:'google/gemini-2.5-flash',provider:'Google',mark:'G',note:'A Gemini option for either role.'},
 {id:'deepseek/deepseek-v3.2',provider:'DeepSeek',mark:'D',note:'A DeepSeek option for either role.'},
 {id:'mistralai/mistral-small-3.2-24b-instruct',provider:'Mistral',mark:'M',note:'A compact Mistral model for either role.'},
] as const;
export type ModelChoice={id:string;name:string;provider:string;mark:string;note:string;inputRate:number;outputRate:number;exampleTokens:number};
export type ModelSelection={scout:string;skeptic:string;revision:number;source:'crew'|'default'};
export const EXAMPLE_INPUT=6000,EXAMPLE_OUTPUT=600;
/** Accept only explicitly curated schema-capable models with bounded usage prices. */
export function modelChoices(models:Model[],markupBps:number):ModelChoice[]{
 if(!Number.isInteger(markupBps)||markupBps<0||markupBps>10000)throw Error('Invalid AI service rate');
 return CURATED_MODELS.flatMap(curated=>{
  const m=models.find(m=>m.id===curated.id),p=m?.pricing;
  if(!m||m.type!=='chat'||!m.supported_parameters?.includes('structured_outputs')||!p||p.type!=='per_token'||p.currency!=='USD')return [];
  const output=Math.max(p.output_per_1M_tokens,p.reasoning_per_1M_tokens??0);
  if(![p.input_per_1M_tokens,output].every(n=>Number.isFinite(n)&&n>=0))return [];
  const factor=(10000+markupBps)/10000;
  return [{...curated,name:m.name,inputRate:p.input_per_1M_tokens*factor,outputRate:output*factor,exampleTokens:Math.ceil((EXAMPLE_INPUT*p.input_per_1M_tokens+EXAMPLE_OUTPUT*output)*factor)/1000}];
 });
}
export function modelQuote(choices:ModelChoice[],markupBps:number){return hash({choices,markupBps});}
export function selectedPair(choices:ModelChoice[],scout:string,skeptic:string){
 const a=choices.find(m=>m.id===scout),b=choices.find(m=>m.id===skeptic);
 if(!a||!b)throw Error('Choose two models from the current trading collection');
 if(a.provider===b.provider)throw Error('Choose a different provider for independent review');
 return {a,b};
}
/** Capture a pair once per analysis. In-flight scans retain their original pair. */
export async function crewModels(db:Sql,crewId:string):Promise<ModelSelection>{
 const row=(await db.query<{scout:string;skeptic:string;revision:number}>('SELECT scout,skeptic,revision FROM crew_models WHERE crew_id=$1',[crewId])).rows[0];
 return row?{...row,source:'crew'}:{...await modelSettings(),revision:0,source:'default'};
}
/** Re-check availability before paid inference; never silently substitute a model. */
export async function validateCrewModels(selection:ModelSelection){
 if(selection.source==='crew')selectedPair(modelChoices(await catalog(),0),selection.scout,selection.skeptic);
}
