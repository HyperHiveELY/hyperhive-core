import { mkdir, readFile, writeFile, rename, chmod,unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import {randomUUID} from 'node:crypto';
const path=resolve(process.env.HYPERHIVE_SECRETS_FILE??'.data/secrets.json');
/** Read the private local settings file and treat an absent file as empty configuration. */
export async function secrets():Promise<Record<string,string>>{try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {};throw e;}}
let writes=Promise.resolve();
async function update(values:Record<string,string>){
 const action=writes.then(async()=>{
  await mkdir(resolve(path,'..'),{recursive:true,mode:0o700});await chmod(resolve(path,'..'),0o700);
  const current=await secrets(),tmp=`${path}.${randomUUID()}.tmp`;
  try{await writeFile(tmp,JSON.stringify({...current,...values}),{mode:0o600,flag:'wx'});await rename(tmp,path);await chmod(path,0o600);}finally{await unlink(tmp).catch(()=>{});}
 });writes=action.catch(()=>{});return action;
}
/** Validate and persist the inference provider credential using serialized atomic file updates. */
export async function savePpq(key:string){
  if(key.length<10||key.length>512||/\s/.test(key))throw Error('Invalid API key format');
  await update({PPQ_API_KEY:key});
}
/** Resolve the inference credential with the process environment taking precedence. */
export async function ppqKey(){return process.env.PPQ_API_KEY||(await secrets()).PPQ_API_KEY;}
/** Persist a distinct pair of validated scout and skeptic model identifiers. */
export async function saveModels(scout:string,skeptic:string){
  if(!scout||!skeptic||scout===skeptic||[scout,skeptic].some(s=>s.length>200||!/^[a-zA-Z0-9~][a-zA-Z0-9/._:~-]*$/.test(s)))throw Error('Select two different models');
  await update({PPQ_SCOUT_MODEL:scout,PPQ_SKEPTIC_MODEL:skeptic});
}
/** Resolve the selected inference models from deployment overrides and local storage. */
export async function modelSettings(){const s=await secrets();return {scout:process.env.PPQ_SCOUT_MODEL||s.PPQ_SCOUT_MODEL||'',skeptic:process.env.PPQ_SKEPTIC_MODEL||s.PPQ_SKEPTIC_MODEL||''};}

/** Explicit allowlist; callers cannot overwrite wallet, signer or PPQ key material. */
export async function saveIntegrationSecrets(values:Partial<Record<'INTEGRATION_SETTINGS'|'TELEGRAM_BOT_TOKEN'|'TELEGRAM_BOT_USERNAME'|'X402_FACILITATOR_TOKEN',string>>){
 const allowed=new Set(['INTEGRATION_SETTINGS','TELEGRAM_BOT_TOKEN','TELEGRAM_BOT_USERNAME','X402_FACILITATOR_TOKEN']);
 if(Object.keys(values).some(k=>!allowed.has(k)))throw Error('Unsupported integration setting');
 await update(values as Record<string,string>);
}
