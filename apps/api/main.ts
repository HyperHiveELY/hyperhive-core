import { Database } from '../../packages/core/db.js';
import { config } from '../../packages/core/config.js';
import { createServer } from './server.js';
import {listenForSigner, signerTransportConfig} from '../../packages/core/signer-db-transport.js';
const transport = signerTransportConfig();
const db=await new Database().init();const app=await createServer(db);
if (transport) {
  const database = new URL(config.DATABASE_URL!);
  const ingress = await listenForSigner(transport.endpoint,
    {host: database.hostname, port: Number(database.port || 5432)}, transport.credentials);
  app.addHook('onClose', () => { ingress.close(); });
}
await app.listen({host:config.HOST,port:config.PORT});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();await db.close();process.exit(0);});
