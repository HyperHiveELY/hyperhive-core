import {Client} from 'pg';
import {spawn} from 'node:child_process';
import {mkdir,chmod,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
const connection=process.env.DATABASE_URL;if(!connection)throw Error('Postgres DATABASE_URL is required');
const url=new URL(connection),verify=process.argv.includes('--verify');
if(verify&&!['127.0.0.1','localhost'].includes(url.hostname))throw Error('Automatic restore verification requires local Postgres. Restore hosted backups into an isolated staging database.');
const dir=resolve('.data/backups',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(dir,{recursive:true,mode:0o700});await chmod(resolve('.data/backups'),0o700);await chmod(dir,0o700);
const dump=join(dir,'database.dump');
const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGSSLMODE:url.searchParams.get('sslmode')??'prefer',...(url.searchParams.get('sslrootcert')?{PGSSLROOTCERT:url.searchParams.get('sslrootcert')!}:{})};
async function command(name:string,args:string[],environment=env){await new Promise<void>((resolve,reject)=>{const p=spawn(name,args,{env:environment,stdio:'ignore'});p.once('error',()=>reject(Error(`${name} could not start; install PostgreSQL client tools`)));p.once('exit',code=>code===0?resolve():reject(Error(`${name} failed (${code}); no credentials were logged`)));});}
const admin=new Client({connectionString:connection});await admin.connect();let target:string|undefined;
try{
 await admin.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const snapshot=(await admin.query('SELECT pg_export_snapshot() snapshot')).rows[0].snapshot;
 const tables=(await admin.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>String(r.tablename));
 const fingerprint=async(client:Client)=>{const result:Record<string,unknown>={};for(const table of tables){if(!/^[a-z_][a-z0-9_]*$/.test(table))throw Error('Unexpected table name');result[table]=(await client.query(`SELECT count(*)::int count,md5(coalesce(string_agg(row::text,E'\\n' ORDER BY row::text),'')) checksum FROM (SELECT to_jsonb(t) row FROM public."${table}" t) data`)).rows[0];}return result;};
 const source=await fingerprint(admin);await command('pg_dump',['--format=custom','--no-owner','--no-privileges',`--snapshot=${snapshot}`,`--file=${dump}`]);await chmod(dump,0o600);await admin.query('COMMIT');
 let restored=false;
 if(verify){target=`hyperhive_restore_${randomBytes(8).toString('hex')}`;await admin.query(`CREATE DATABASE ${target}`);await command('pg_restore',['--exit-on-error','--no-owner','--no-privileges','--dbname',target,dump],{...env,PGDATABASE:target});const restoreUrl=new URL(url);restoreUrl.pathname='/'+target;const restoredDb=new Client({connectionString:restoreUrl.toString()});await restoredDb.connect();try{if(JSON.stringify(source)!==JSON.stringify(await fingerprint(restoredDb)))throw Error('Restore fingerprint mismatch');restored=true;}finally{await restoredDb.end();}}
 const manifest={createdAt:new Date().toISOString(),sha256:createHash('sha256').update(await readFile(dump)).digest('hex'),tables:source,restoreVerified:restored,scope:'Database only. Keep encrypted browser wallet backups and signer/secret recovery material separately.'};
 await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
 await mkdir('output/launch',{recursive:true});await writeFile('output/launch/backup-verification.json',JSON.stringify({checkedAt:manifest.createdAt,restoreVerified:restored,tableCount:tables.length,sha256:manifest.sha256},null,2)+'\n',{mode:0o600});
 console.log(`Private database backup: ${dir}`);console.log(verify?'Restore verification: PASS (all table counts and content checksums match)':'Restore verification: not requested');
}catch{await admin.query('ROLLBACK').catch(()=>{});throw Error('Backup/restore verification failed. No credentials were logged.');}
finally{if(target)await admin.query(`DROP DATABASE IF EXISTS ${target} WITH (FORCE)`);await admin.end();}
