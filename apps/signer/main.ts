import {assertProductionConfig} from '../../packages/core/production.js';
import {config} from '../../packages/core/config.js';
import { Database } from '../../packages/core/db.js';
import { Signer } from './engine.js';
assertProductionConfig(config);
const db=await new Database().init();const release=await db.lock('hyperhive/signer');
if(!release)throw Error('Another signer is already active');
const signer=new Signer(db);let stopped=false;
let wake:()=>void=()=>{};
function shutdown(){stopped=true;wake();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
async function idle(){if(stopped)return;await new Promise<void>(resolve=>{const timer=setTimeout(resolve,5000);wake=()=>{clearTimeout(timer);resolve();};});wake=()=>{};}
try{await signer.init();while(!stopped){await signer.tick();await idle();}}finally{await release();await db.close();}
