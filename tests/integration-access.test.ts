import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {Database} from '../packages/core/db.js';
import {createServer} from '../apps/api/server.js';
import {accessStatus,requireAccess} from '../packages/core/access.js';
import {wallet,crew} from './fixtures.js';
import {config} from '../packages/core/config.js';
import {Signer} from '../apps/signer/engine.js';
const state=vi.hoisted(()=>({settings:{eligibilityEnabled:true,termsVersion:'v1',termsText:'Published test terms',blockedCountries:['US'],tokenThreshold:'10000'}}));
vi.mock('../packages/core/integration-settings.js',async original=>({...await original<typeof import('../packages/core/integration-settings.js')>(),integrationSettings:async()=>state.settings}));
let db:Database,app:Awaited<ReturnType<typeof createServer>>,cookie:string;
const headers={origin:'http://localhost:5188'};
beforeAll(async()=>{db=await new Database('memory').init();app=await createServer(db);const {message}=(await app.inject({method:'POST',url:'/api/auth/challenge',headers,payload:{address:wallet.address}})).json();const result=await app.inject({method:'POST',url:'/api/auth/verify',headers,payload:{message,signature:await wallet.signMessage({message})}});cookie=String(result.headers['set-cookie']).split(';')[0];});afterAll(async()=>{await app.close();await db.close();});
it('requires acceptance of the current version and a valid non-blocked country',async()=>{expect((await accessStatus(db,wallet.address.toLowerCase())).eligible).toBe(false);for(const country of ['US','ZZ']){const r=await app.inject({method:'POST',url:'/api/access/accept',headers:{...headers,cookie},payload:{country,version:'v1',accepted:true}});expect(r.statusCode).toBe(400);}const r=await app.inject({method:'POST',url:'/api/access/accept',headers:{...headers,cookie},payload:{country:'CA',version:'v1',accepted:true}});expect(r.statusCode).toBe(200);expect(r.json().eligible).toBe(true);state.settings.termsVersion='v2';await expect(requireAccess(db,wallet.address.toLowerCase())).rejects.toThrow('current terms');});
it('blocks new entries before venue calls when terms are outstanding',async()=>{const old=config.LIVE_TRADING_ENABLED;config.LIVE_TRADING_ENABLED='true';try{const c=await crew(),signer=new Signer(db),controls=vi.spyOn(signer,'controls').mockResolvedValue(false);await signer.enter(c);expect(controls).not.toHaveBeenCalled();}finally{config.LIVE_TRADING_ENABLED=old;}});
it('denies remote operator configuration and private integration state without a session',async()=>{for(const path of ['/api/setup/integrations','/api/setup/telegram','/api/setup/facilitator','/api/deployment/prepare','/api/hosting/bundle'])expect((await app.inject({method:'POST',url:path,headers,remoteAddress:'192.0.2.1',payload:{}})).statusCode).toBe(403);for(const path of ['/api/telegram','/api/benefits','/api/access','/api/payments/invoices'])expect((await app.inject({url:path})).statusCode).toBe(401);});

it('records the displayed terms for a signed-in wallet from one checkbox without a country',async()=>{
 const saved={...state.settings};
 try {
  Object.assign(state.settings,{blockedCountries:[],termsVersion:'checkbox-1',termsText:'I accept trading responsibility.'});
  const submit=(payload:unknown)=>app.inject({method:'POST',url:'/api/access/accept',headers:{...headers,cookie},payload:payload as any});
  expect((await submit({version:'checkbox-1',accepted:false})).statusCode).toBe(400);
  expect((await submit({version:'stale',accepted:true})).statusCode).toBe(400);
  for(let i=0;i<2;i++){
   const r=await submit({version:'checkbox-1',accepted:true});
   expect(r.statusCode).toBe(200);expect(r.json()).toMatchObject({eligible:true,requiresCountry:false});
  }
  expect((await db.query('SELECT terms_text,terms_url FROM access_terms_history WHERE owner=$1 AND version=$2',[wallet.address.toLowerCase(),'checkbox-1'])).rows).toEqual([{terms_text:'I accept trading responsibility.',terms_url:null}]);
  state.settings.termsText='Updated terms';
  expect((await accessStatus(db,wallet.address.toLowerCase())).eligible).toBe(false);
  expect((await submit({version:'checkbox-1',accepted:true})).statusCode).toBe(400);
  state.settings.termsVersion='checkbox-2';
  expect((await submit({version:'checkbox-2',accepted:true})).statusCode).toBe(200);
  state.settings.blockedCountries=['US'];
  expect((await accessStatus(db,wallet.address.toLowerCase())).eligible).toBe(false);
  expect((await submit({version:'checkbox-2',accepted:true})).statusCode).toBe(400);
 } finally {Object.assign(state.settings,saved);}
});
