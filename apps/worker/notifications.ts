import {Database,event} from '../../packages/core/db.js';
import {telegramTick} from '../../packages/core/telegram.js';
const db=await new Database().init(),release=await db.lock('hyperhive-notifications');if(!release)throw Error('Notification worker already running');
let stopping=false,wake=()=>{};const stop=()=>{stopping=true;wake();};process.on('SIGINT',stop);process.on('SIGTERM',stop);
try{while(!stopping){try{await telegramTick(db);}catch(e){await event(db,null,'notifications_error',(e as Error).message);}if(!stopping)await new Promise<void>(resolve=>{const timer=setTimeout(resolve,10000);wake=()=>{clearTimeout(timer);resolve();};});}}finally{await release();await db.close();}
