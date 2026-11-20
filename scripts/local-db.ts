import {mkdir,readFile,writeFile,chmod,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Client} from 'pg';
const root=resolve('.data'),data=resolve(root,'postgres'),passwordFile=resolve(root,'postgres-password');
const exists=async(p:string)=>access(p).then(()=>true,()=>false);
const run=(name:string,args:string[])=>{const r=spawnSync(name,args,{encoding:'utf8'});if(r.status!==0)throw Error(`${name} failed: ${r.error?.message??r.stderr.slice(0,500)}`);};
await mkdir(root,{recursive:true,mode:0o700});await chmod(root,0o700);
if(!await exists(passwordFile))await writeFile(passwordFile,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
const password=(await readFile(passwordFile,'utf8')).trim();
if(!await exists(resolve(data,'PG_VERSION')))run('initdb',['-D',data,'-U','hyperhive','--pwfile',passwordFile,'--auth-host=scram-sha-256','--auth-local=scram-sha-256','--encoding=UTF8']);
const status=spawnSync('pg_ctl',['-D',data,'status'],{stdio:'ignore'});
if(status.status!==0)run('pg_ctl',['-D',data,'-l',resolve(root,'postgres.log'),'-o',`-h 127.0.0.1 -p 55439 -k ${root}`,'-w','start']);
const client=new Client({host:'127.0.0.1',port:55439,user:'hyperhive',password,database:'postgres'});await client.connect();
try{if(!(await client.query("SELECT 1 FROM pg_database WHERE datname='hyperhive'")).rowCount)await client.query('CREATE DATABASE hyperhive');}finally{await client.end();}
const url=`postgresql://hyperhive:${password}@127.0.0.1:55439/hyperhive`;
// Do not replace a user's existing database configuration or expose its value.
const envPath=resolve('.env');let env=await exists(envPath)?await readFile(envPath,'utf8'):'';
if(!/^DATABASE_URL=/m.test(env)){env+=`\nDATABASE_URL=${url}\n`;await writeFile(envPath,env,{mode:0o600});await chmod(envPath,0o600);}
console.log('Dedicated local Postgres is running on loopback port 55439. Credentials are private. Restart services to load .env.');
