import {Client} from 'pg';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
if(!process.env.DATABASE_URL)throw Error('Run npm run db:local first');
const url=new URL(process.env.DATABASE_URL);if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('This test runner creates a disposable database only on local Postgres');
const name=`hyperhive_test_${randomBytes(8).toString('hex')}`;
const admin=new Client({connectionString:url.toString()});await admin.connect();
try{await admin.query(`CREATE DATABASE ${name}`);url.pathname=`/${name}`;
 const coverage=process.argv.includes('--coverage');
 const args=coverage?['vitest','run','--coverage']:['vitest','run','tests/postgres.test.ts'];
 const code=await new Promise<number>((resolve,reject)=>{
   const p=spawn('npx',args,{stdio:'inherit',env:{...process.env,HYPERHIVE_TEST_DATABASE_URL:url.toString(),...(coverage?{HYPERHIVE_TEST_ANVIL:'1'}:{})}});
   p.once('error',reject);p.once('exit',code=>resolve(code??1));
 });process.exitCode=code;
}finally{await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);await admin.end();}
