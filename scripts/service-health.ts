import {Database} from '../packages/core/db.js';
import {serviceAlive} from '../packages/core/runtime-health.js';
const role=process.argv[2];if(!['worker','signer','notifications'].includes(role))throw Error('Select a service role');
const db=new Database();try{const r=(await db.query<any>('SELECT * FROM heartbeats WHERE role=$1',[role])).rows[0];process.exitCode=r&&serviceAlive(r)?0:1;}catch{process.exitCode=1;}finally{await db.close();}
