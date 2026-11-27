import {assertProductionConfig} from '../../packages/core/production.js';
import {config} from '../../packages/core/config.js';
import { Database } from '../../packages/core/db.js';
import { Signer } from './engine.js';
import {listenForDatabaseClient, signerTransportConfig} from '../../packages/core/signer-db-transport.js';
assertProductionConfig(config);
const transport = signerTransportConfig();
const tunnel = transport && await listenForDatabaseClient(
  Number(new URL(config.DATABASE_URL!).port || 5432), transport.endpoint, transport.credentials);

// The API owns production migrations. The signer uses a restricted PostgreSQL role.
const db = config.NODE_ENV === 'production' ? new Database() : await new Database().init();
const release=await db.lock('hyperhive/signer');
if(!release)throw Error('Another signer is already active');
const signer=new Signer(db);let stopped=false;
let wake:()=>void=()=>{};
function shutdown(){stopped=true;wake();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
async function idle(){if(stopped)return;await new Promise<void>(resolve=>{const timer=setTimeout(resolve,5000);wake=()=>{clearTimeout(timer);resolve();};});wake=()=>{};}
try{await signer.init();while(!stopped){await signer.tick();await idle();}}finally{await release();await db.close();tunnel?.close();}
