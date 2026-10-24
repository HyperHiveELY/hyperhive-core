import {Database,heartbeat} from '../../packages/core/db.js';
import type {Crew} from '../../packages/core/domain.js';
import {paperSnapshot} from '../../packages/paper/feed.js';
import {PaperEngine} from '../../packages/paper/engine.js';
import {mutatePaper} from '../../packages/paper/account.js';
const db=await new Database().init(),release=await db.lock('hyperhive/paper');if(!release)throw Error('Paper worker already running');
const engine=new PaperEngine(db,paperSnapshot);let stop=false;let wake=()=>{};
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{stop=true;wake();});
try{while(!stop){
 const crews=(await db.query<Crew>('SELECT c.* FROM crews c JOIN paper_accounts p ON p.crew_id=c.id')).rows;
 await heartbeat(db,'paper',{crews:crews.length});
 for(const c of crews)try{await engine.tick(c);}catch(e){await mutatePaper(db,c.id,async a=>{a.error=(e as Error).message.slice(0,250);});}
 if(!stop)await new Promise<void>(resolve=>{const t=setTimeout(resolve,5000);wake=()=>{clearTimeout(t);resolve();};});
}}finally{await engine.drain();await release();await db.close();}
