import {beforeAll,afterAll,it,expect} from 'vitest';
import {Database} from '../packages/core/db.js';
import {createServer} from '../apps/api/server.js';
import {wallet,crew} from './fixtures.js';
import {reserve} from '../packages/ai/crew.js';
let db:Database;let app:Awaited<ReturnType<typeof createServer>>;
const headers={origin:'http://localhost:5188'};
beforeAll(async()=>{db=await new Database('memory').init();app=await createServer(db);},30000);
afterAll(async()=>{await app.close();await db.close();});
it('reports mainnet and never exposes credentials',async()=>{const r=await app.inject({url:'/api/config'});expect(r.statusCode).toBe(200);expect(r.json().network).toBe('mainnet');expect(r.body).not.toMatch(/PPQ_API_KEY|secrets\.json/);});
it('rejects cross-origin state changes',async()=>{const r=await app.inject({method:'POST',url:'/api/auth/challenge',headers:{origin:'https://untrusted.invalid'},payload:{address:wallet.address}});expect(r.statusCode).toBe(400);});
it('requires authentication for private crews',async()=>{expect((await app.inject({url:'/api/crews'})).statusCode).toBe(401);});
it('keeps Token balances private and checkout settings local',async()=>{expect((await app.inject({url:'/api/tokens'})).statusCode).toBe(401);expect((await app.inject({method:'POST',url:'/api/tokens/invoices',headers,payload:{amount:10}})).statusCode).toBe(401);expect((await app.inject({method:'POST',url:'/api/setup/tokens',remoteAddress:'192.0.2.10',headers,payload:{payTo:wallet.address,markupBps:2500}})).statusCode).toBe(403);});
it('retires monthly checkout and exposes only managed AI configuration',async()=>{const r=(await app.inject({url:'/api/config'})).json();expect(r.subscriptionRequired).toBe(false);expect(typeof r.aiConfigured).toBe('boolean');expect('ppqConfigured' in r).toBe(false);expect((await app.inject({method:'POST',url:'/api/payments/invoices',headers,payload:{}})).statusCode).toBe(410);});
it('requires a valid single-use wallet challenge and issues HttpOnly cookies',async()=>{const r=await app.inject({method:'POST',url:'/api/auth/challenge',headers,payload:{address:wallet.address}});const message=r.json().message;const signature=await wallet.signMessage({message});const good=await app.inject({method:'POST',url:'/api/auth/verify',headers,payload:{message,signature}});expect(good.statusCode).toBe(200);expect(good.headers['set-cookie']).toContain('HttpOnly');const replay=await app.inject({method:'POST',url:'/api/auth/verify',headers,payload:{message,signature}});expect(replay.statusCode).toBe(400);});
it('does not allow remote callers to save secrets',async()=>{const r=await app.inject({method:'POST',url:'/api/setup/ai',remoteAddress:'192.0.2.10',headers,payload:{key:'test-only-placeholder'}});expect(r.statusCode).toBe(403);});
it('atomically reserves AI spend before network calls',async()=>{const c=await crew();await db.query('INSERT INTO crews(id,owner,account,policy,signature,created_at) VALUES($1,$2,$3,$4,$5,$6)',[c.id,c.owner,c.account,JSON.stringify(c.policy),c.signature,Date.now()]);const results=await Promise.allSettled(Array.from({length:10},()=>reserve(db,c,.1)));expect(results.filter(r=>r.status==='fulfilled').length).toBe(4);const q=await db.query<{total:string}>('SELECT sum(reserved)::text total FROM budgets');expect(Number(q.rows[0].total)).toBe(.4);});
it('enforces the origin boundary on every registered mutation route',async()=>{
 let tested=0;
 for(const method of ['POST','PUT','PATCH','DELETE'] as const){
 const paths=app.printRoutes({method,commonPrefix:false});
 const routes=paths.split('\n').map(line=>line.match(/(\/api\/[^\s(]+)/)?.[1]).filter((p):p is string=>Boolean(p));
 tested+=routes.length;
 for(const path of routes){
  const url=path.replace(/:[a-zA-Z]+/g,'11111111-1111-4111-8111-111111111111');
  const response=await app.inject({method,url,headers:{origin:'https://foreign.invalid'},payload:{}});
  expect(response.json().error,path).toContain('Request origin');
 }
 }
 expect(tested).toBeGreaterThan(25);
});
