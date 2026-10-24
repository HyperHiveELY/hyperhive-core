import {mkdir,lstat,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {randomBytes,hkdfSync} from 'node:crypto';
import {resolve,join} from 'node:path';
import {privateKeyToAccount,type PrivateKeyAccount} from 'viem/accounts';
import {bytesToHex,type Hex} from 'viem';
import {z} from 'zod';
const seedSchema=z.strictObject({v:z.literal(1),seed:z.string().regex(/^[a-f0-9]{64}$/)});
const pinSchema=z.strictObject({v:z.literal(1),signer:z.string().regex(/^0x[0-9a-fA-F]{40}$/)});
/** Resolve the local signer state directory relative to the service working directory. */
export const localKeyDir=()=>resolve('.data/local-signer');
async function privateDirectory(dir:string){
 await mkdir(dir,{recursive:true,mode:0o700});const st=await lstat(dir);
 if(st.isSymbolicLink()||!st.isDirectory()||(st.mode&0o077)!==0||(process.getuid&&st.uid!==process.getuid()))throw Error('Signer directory must be owned by this user with permissions 0700');
}
async function readPrivate(path:string){
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const st=await file.stat();if(!st.isFile()||(st.mode&0o077)!==0||st.size>4096||(process.getuid&&st.uid!==process.getuid()))throw Error('Signer file must be owned by this user with permissions 0600');return await file.readFile('utf8');}finally{await file.close();}
}
async function writeNew(path:string,data:unknown){const file=await open(path,'wx',0o600);try{await file.writeFile(JSON.stringify(data));await file.sync();}finally{await file.close();}}
/** Read the pinned signer address after checking local key-directory permissions. */
export async function pinnedLocalSigner(dir=localKeyDir()):Promise<Hex>{await privateDirectory(dir);return pinSchema.parse(JSON.parse(await readPrivate(join(dir,'identity.json')))).signer.toLowerCase() as Hex;}
export class LocalKeys{
 private constructor(private readonly seed:Buffer,readonly signer:PrivateKeyAccount){}
 /** Restore persisted signer and agent key material, creating it only when explicitly permitted. */
 static async load(allowCreate:boolean,dir=localKeyDir()){
  await privateDirectory(dir);let stored:string;
  try{stored=await readPrivate(join(dir,'seed.json'));}catch(e){
   if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
   if(!allowCreate)throw Error('Local signer keys are missing. Restore the original private signer directory; key rotation is not automatic.');
   const seed={v:1,seed:randomBytes(32).toString('hex')};await writeNew(join(dir,'seed.json'),seed);stored=JSON.stringify(seed);
  }
  const seed=Buffer.from(seedSchema.parse(JSON.parse(stored)).seed,'hex');
  const key=derive(seed,'hyperhive/local/slip/v1');
  try{const pin=await pinnedLocalSigner(dir);if(pin!==key.address.toLowerCase())throw Error('Local signer public pin does not match its key');}catch(e){
   if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
   // Existing execution history must not acquire a fresh trust pin silently.
   if(!allowCreate)throw Error('Local signer public pin missing. Restore the original identity file.');
   await writeNew(join(dir,'identity.json'),{v:1,signer:key.address.toLowerCase()});
  }
  return new LocalKeys(seed,key);
 }
 /** Derive the crew agent for the specified policy generation from the local seed. */
 agent(crewId:string,generation:number){if(!/^[a-f0-9-]{36}$/.test(crewId)||!Number.isSafeInteger(generation)||generation<0)throw Error('Invalid agent derivation');return derive(this.seed,`hyperhive/local/crew/${crewId}/agent/${generation}`);}
}
function derive(seed:Buffer,context:string){
 for(let n=0;n<10;n++){const material=Buffer.from(hkdfSync('sha256',seed,'hyperhive/local/v1',`${context}/${n}`,32));try{return privateKeyToAccount(bytesToHex(material));}catch{}finally{material.fill(0);}}
 throw Error('Unable to derive a signing key');
}
