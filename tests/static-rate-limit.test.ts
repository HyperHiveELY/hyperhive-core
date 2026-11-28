import {it,expect} from 'vitest';
import routes from '../scripts/rate-limited-routes.json';
import {config} from '../packages/core/config.js';
import {Database} from '../packages/core/db.js';
import {createServer} from '../apps/api/server.js';
it('does not let landing-page asset traffic exhaust the API quota or health probes',async()=>{
 const db=await new Database('memory').init(),app=await createServer(db);
 try{
  for(let i=0;i<130;i++)expect((await app.inject({url:'/vital/brand.js'})).statusCode).not.toBe(429);
  expect((await app.inject({url:'/api/config'})).statusCode).toBe(200);
  for(let i=0;i<130;i++)await app.inject({url:'/api/not-found'});
  // Exercise every reviewed CodeQL location after the global request budget is exhausted.
  for (const route of routes) {
    const method = route.method as 'GET' | 'POST';
    expect(app.hasRoute({method,url:route.url}), route.url).toBe(true);
    const response = await app.inject({method,url:route.url.replace(':id','probe'),headers:{origin:config.PUBLIC_ORIGIN}});
    expect(response.statusCode, route.url).toBe(429);
  }
  expect((await app.inject({url:'/api/health'})).statusCode).toBe(200);
 }finally{await app.close();await db.close();}
});
it('gives each real client its own request bucket behind a trusted proxy',async()=>{
 const prior=config.TRUSTED_PROXY_HOPS;config.TRUSTED_PROXY_HOPS=1;
 const db=await new Database('memory').init(),app=await createServer(db);
 try{
  for(let i=0;i<130;i++)await app.inject({url:'/api/not-found',headers:{'x-forwarded-for':'203.0.113.7'}});
  expect((await app.inject({url:'/api/config',headers:{'x-forwarded-for':'203.0.113.7'}})).statusCode).toBe(429);
  expect((await app.inject({url:'/api/config',headers:{'x-forwarded-for':'198.51.100.9'}})).statusCode).toBe(200);
 }finally{config.TRUSTED_PROXY_HOPS=prior;await app.close();await db.close();}
});
