import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {Database} from '../packages/core/db.js';
import {createServer} from '../apps/api/server.js';
import {crew} from './fixtures.js';
const venue=vi.hoisted(()=>({account:vi.fn(),role:vi.fn()}));
vi.mock('../packages/core/venue.js',async original=>({...await original<typeof import('../packages/core/venue.js')>(),accountState:venue.account,info:{userRole:venue.role}}));
let db:Database,app:Awaited<ReturnType<typeof createServer>>,c:Awaited<ReturnType<typeof crew>>;
beforeAll(async()=>{db=await new Database('memory').init();app=await createServer(db);c=await crew();c={...c,account:('0x'+'cd'.repeat(20)) as `0x${string}`,policy:{...c.policy,account:('0x'+'cd'.repeat(20)) as `0x${string}`}};await db.query('INSERT INTO crews(id,owner,account,policy,signature,created_at) VALUES($1,$2,$3,$4,$5,$6)',[c.id,c.owner,c.account,JSON.stringify(c.policy),c.signature,c.created_at]);for(const [token,owner] of [['funding-test',c.owner],['other-test','0x'+'ab'.repeat(20)]])await db.query('INSERT INTO sessions VALUES($1,$2,$3)',[createHash('sha256').update(token).digest('hex'),owner,Date.now()+60000]);},30000);
afterAll(async()=>{await app.close();await db.close();});
it('requires crew ownership before making venue requests',async()=>{
 expect((await app.inject({url:'/api/crews/'+c.id+'/funding'})).statusCode).toBe(401);
 expect((await app.inject({url:'/api/crews/'+c.id+'/funding',cookies:{hh_session:'other-test'}})).statusCode).toBe(404);
 expect(venue.account).not.toHaveBeenCalled();expect(venue.role).not.toHaveBeenCalled();
});
it('returns actual balances and activation state without changing the crew',async()=>{
 venue.account.mockImplementation(async(address:string)=>({withdrawable:address===c.owner?'12.5':'0',marginSummary:{accountValue:address===c.account?'8':'12.5'}}));
 venue.role.mockImplementation(async({user}:{user:string})=>({role:user===c.owner?'user':'missing'}));
 const before=(await db.query('SELECT paused,policy FROM crews WHERE id=$1',[c.id])).rows;
 const r=await app.inject({url:'/api/crews/'+c.id+'/funding',cookies:{hh_session:'funding-test'}});
 expect(r.statusCode).toBe(200);expect(r.headers['cache-control']).toBe('no-store');expect(r.json()).toMatchObject({owner:c.owner,account:c.account,available:12.5,equity:8,ownerActivation:false,crewActivation:true});
 expect((await db.query('SELECT paused,policy FROM crews WHERE id=$1',[c.id])).rows).toEqual(before);
});
it('fails closed on unavailable venue data rather than reporting a zero balance',async()=>{
 venue.account.mockRejectedValueOnce(Error('Venue unavailable'));
 const r=await app.inject({url:'/api/crews/'+c.id+'/funding',cookies:{hh_session:'funding-test'}});expect(r.statusCode).toBeGreaterThanOrEqual(400);expect(r.json().available).toBeUndefined();
});
