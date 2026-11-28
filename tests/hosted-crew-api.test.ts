import {expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {Database} from '../packages/core/db.js';
import {config} from '../packages/core/config.js';
import {createServer} from '../apps/api/server.js';
import {crew,wallet} from './fixtures.js';
import {hash,ZERO,policyMessage,controlMessage} from '../packages/core/domain.js';
import {ELYSIUM_USDC} from '../packages/core/chain.js';
const h=vi.hoisted(()=>({rpc:vi.fn(),quote:vi.fn(),role:vi.fn(),ledger:vi.fn(),save:vi.fn()}));
vi.mock('viem',async original=>({...await original<typeof import('viem')>(),createPublicClient:()=>({getChainId:async()=>99901,getBlockNumber:async()=>5n,readContract:h.rpc})}));
vi.mock('../packages/core/attestation.js',async original=>({...await original<typeof import('../packages/core/attestation.js')>(),verifyAttestation:h.quote}));
vi.mock('../packages/core/venue.js',()=>({info:{frontendOpenOrders:async()=>[],extraAgents:async()=>[],portfolio:async()=>[],userRole:h.role,userNonFundingLedgerUpdates:h.ledger},markets:async()=>[{name:'BTC'},{name:'ETH'}],allFills:async()=>[],accountState:async()=>({marginSummary:{accountValue:'50'},assetPositions:[],withdrawable:'50'})}));
vi.mock('../packages/core/integration-settings.js',async original=>({...await original<typeof import('../packages/core/integration-settings.js')>(),integrationSettings:async()=>({tokenPayTo:'0x'+'23'.repeat(20),aiMarkupBps:2500,eligibilityEnabled:false}),saveIntegrationSettings:h.save}));
vi.mock('../packages/core/secrets.js',async original=>({...await original<typeof import('../packages/core/secrets.js')>(),secrets:async()=>({}),ppqKey:async()=>undefined,modelSettings:async()=>({scout:'',skeptic:''})}));
it('creates an owned crew, serves verifiable public records and fails closed on retired identity',async()=>{
 const prior={...config},c=await crew(),measurement=hash('test measurement');
 Object.assign(config,{NODE_ENV:'test',SIGNER_MODE:'phala',ROOT_CONTRACT:ELYSIUM_USDC,MEASUREMENT_HASH:measurement,PUBLIC_ORIGIN:c.policy.origin,LIVE_TRADING_ENABLED:'false'});
 const db=await new Database('memory').init(),app=await createServer(db),token='test-only-session';
 const headers={cookie:'hh_session='+token,origin:c.policy.origin};const get=(path:string)=>app.inject({url:'/api/'+path,headers});
 try{
  await db.query('INSERT INTO sessions VALUES($1,$2,$3)',[createHash('sha256').update(token).digest('hex'),c.owner,Date.now()+60000]);
  const create=await app.inject({method:'POST',url:'/api/crews',headers,payload:{policy:c.policy,signature:c.signature}});
  expect(create.json()).toEqual({id:c.id});const path='crews/'+c.id;
  expect((await get(path+'/attestation')).statusCode).toBe(400);
  await db.query('INSERT INTO identities VALUES($1,$2,$2,$3,0,$4,$5)',[c.id,c.owner,JSON.stringify({policyHash:hash(c.policy)}),measurement,Date.now()]);
  let approved=true;h.rpc.mockImplementation(async({functionName})=>functionName==='registry'?wallet.address:functionName==='approved'?approved:measurement);
  h.quote.mockResolvedValue({signer:wallet.address});
  expect((await get(path+'/attestation')).json()).toMatchObject({registry:wallet.address,signer:wallet.address});
  approved=false;expect((await get(path+'/attestation')).json().error).toMatch(/not registered/);
  expect((await get(path)).json()).toMatchObject({crew:{id:c.id},readiness:{ready:false}});
  // A control dated in the future is refused: the signer orders controls by arrival, and a fast clock must not jump the queue.
  {const nonce=crypto.randomUUID(),issuedAt=Date.now()+120000;const signature=await wallet.signMessage({message:controlMessage(c.id,'pause',nonce,hash(c.policy),issuedAt)});
   const future=await app.inject({method:'POST',url:'/api/'+path+'/control',headers,payload:{action:'pause',nonce,issuedAt,signature}});
   expect(future.json().error).toMatch(/invalid or expired/);}
  expect((await get('dashboard')).statusCode).toBe(200);
  expect((await get('crew-registry')).json().crews[0].id).toBe(c.id);
  expect((await get('archive/hours/1')).json()).toEqual({hour:1,slips:[],root:null});
  expect((await get('records/'+c.id)).json()).toMatchObject({status:'AWAITING_TRADES',root:ZERO});
  expect((await get('records/'+c.id+'/fills')).json()).toEqual({fills:[]});
  expect((await get('tokens')).json().usage).toEqual([]);
  h.role.mockResolvedValue({role:'user'});
  const invoice=await app.inject({method:'POST',url:'/api/tokens/invoices',headers,payload:{amount:10}});
  expect(invoice.statusCode,invoice.body).toBe(200);
  const id=invoice.json().id;h.ledger.mockResolvedValue([]);
  const confirm=await app.inject({method:'POST',url:'/api/tokens/invoices/'+id+'/confirm',headers,payload:{}});
  expect(confirm.statusCode,confirm.body).toBeGreaterThanOrEqual(400);
  const setup=await app.inject({method:'POST',url:'/api/setup/tokens',headers,payload:{payTo:c.account,markupBps:100}});
  expect(setup.statusCode,setup.body).toBe(200);expect(h.save).toHaveBeenCalled();
  const badPolicy={...c.policy,origin:'https://other.invalid'};const sig=await wallet.signMessage({message:policyMessage(badPolicy)});
  expect((await app.inject({method:'POST',url:'/api/crews',headers,payload:{policy:badPolicy,signature:sig}})).statusCode).toBe(400);
 }finally{await app.close();await db.close();Object.assign(config,prior);}
});
