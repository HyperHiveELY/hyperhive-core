import {it,expect} from 'vitest';
import {Database} from '../packages/core/db.js';
import {createServer} from '../apps/api/server.js';
it('does not let landing-page asset traffic exhaust the API quota or health probes',async()=>{
 const db=await new Database('memory').init(),app=await createServer(db);
 try{
  for(let i=0;i<130;i++)expect((await app.inject({url:'/vital/brand.js'})).statusCode).not.toBe(429);
  expect((await app.inject({url:'/api/config'})).statusCode).toBe(200);
  for(let i=0;i<130;i++)await app.inject({url:'/api/not-found'});
  expect((await app.inject({url:'/api/config'})).statusCode).toBe(429);
  expect((await app.inject({url:'/api/health'})).statusCode).toBe(200);
 }finally{await app.close();await db.close();}
});
