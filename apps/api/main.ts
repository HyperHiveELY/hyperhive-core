import { Database } from '../../packages/core/db.js';
import { config } from '../../packages/core/config.js';
import { createServer } from './server.js';
const db=await new Database().init();const app=await createServer(db);
await app.listen({host:config.HOST,port:config.PORT});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();await db.close();process.exit(0);});
