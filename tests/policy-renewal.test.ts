import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {Database} from '../packages/core/db.js';
import {createServer} from '../apps/api/server.js';
import {policyMessage,type Policy} from '../packages/core/domain.js';
import {crew,wallet,policy} from './fixtures.js';
const venue=vi.hoisted(()=>({account:vi.fn(),orders:vi.fn()}));
vi.mock('../packages/core/venue.js',async importOriginal=>{
 const actual=await importOriginal<typeof import('../packages/core/venue.js')>();
 return {...actual,accountState:venue.account,info:{...actual.info,frontendOpenOrders:venue.orders}};
});
let db:Database,app:Awaited<ReturnType<typeof createServer>>,cookie:string;
const origin='http://localhost:5188';
beforeAll(async()=>{
 db=await new Database('memory').init();app=await createServer(db);
 const challenge=await app.inject({method:'POST',url:'/api/auth/challenge',headers:{origin},payload:{address:wallet.address}});
 const message=challenge.json().message,signature=await wallet.signMessage({message});
 const login=await app.inject({method:'POST',url:'/api/auth/verify',headers:{origin},payload:{message,signature}});
 expect(login.statusCode).toBe(200);cookie=String(login.headers['set-cookie']).split(';')[0];
});
beforeEach(async()=>{
 venue.account.mockResolvedValue({assetPositions:[]});venue.orders.mockResolvedValue([]);
 await db.query('DELETE FROM crews');const c=await crew();
 await db.query('INSERT INTO crews(id,owner,account,policy,signature,created_at,paused) VALUES($1,$2,$3,$4,$5,$6,false)',[c.id,c.owner,c.account,JSON.stringify(c.policy),c.signature,Date.now()]);
});
afterAll(async()=>{await app.close();await db.close();});
async function renew(overrides:Partial<Policy>={}){
 const next={...policy,name:'Updated limits',weeklyBudget:75,maxAccountValue:800,markets:['SOL'],generation:1,issuedAt:Date.now(),expiresAt:Date.now()+86400000,...overrides};
 const signature=await wallet.signMessage({message:policyMessage(next)});
 return app.inject({method:'POST',url:'/api/crews/'+policy.crewId+'/renew',headers:{origin,cookie},payload:{policy:next,signature}});
}
it('accepts signed updated limits only as a new generation and pauses execution',async()=>{
 expect((await renew()).statusCode).toBe(200);
 const updated=(await db.query<{policy:Policy;paused:boolean}>('SELECT policy,paused FROM crews WHERE id=$1',[policy.crewId])).rows[0];
 expect(updated.policy).toMatchObject({weeklyBudget:75,maxAccountValue:800,markets:['SOL'],generation:1});expect(updated.paused).toBe(true);
});
it.each(['position','order'])('rejects renewal with a live %s',async kind=>{
 if(kind==='position')venue.account.mockResolvedValue({assetPositions:[{position:{szi:'0.1'}}]});
 else venue.orders.mockResolvedValue([{oid:123}]);
 const result=await renew();expect(result.statusCode).toBe(400);expect(result.json().error).toMatch(/Close existing positions/);
 expect((await db.query<{policy:Policy}>('SELECT policy FROM crews')).rows[0].policy.generation).toBe(0);
});
it('rejects replay of the existing policy generation',async()=>{expect((await renew({generation:0})).statusCode).toBe(400);});
