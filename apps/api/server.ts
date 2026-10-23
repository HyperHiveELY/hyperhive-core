import {CONTRACT_CHAIN_ID} from '../../packages/core/chain.js';
import {assertProductionConfig} from '../../packages/core/production.js';
import {runtimeHealth} from '../../packages/core/runtime-health.js';
import {productionCsp} from './security.js';
import {registerPaper} from './paper.js';
import {registerTokens} from './tokens.js';
import {registerHosting} from './hosting.js';
import {registerIntegrations} from './integrations.js';
import {integrationSettings} from '../../packages/core/integration-settings.js';
import {requireAccess} from '../../packages/core/access.js';
import Fastify,{type FastifyRequest} from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { randomBytes,createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { createPublicClient,http,parseAbi,verifyMessage,type Hex } from 'viem';
import { createSiweMessage,parseSiweMessage,validateSiweMessage } from 'viem/siwe';
import { Database } from '../../packages/core/db.js';
import { config } from '../../packages/core/config.js';
import { Address,Signature,Policy,verifyPolicy,controlMessage,hash,subscriptionKey,type Crew } from '../../packages/core/domain.js';
import { markets,info,accountState } from '../../packages/core/venue.js';
import { ppqKey,savePpq,saveModels,modelSettings } from '../../packages/core/secrets.js';
import { verifyRecord } from '../worker/auditor.js';
import {catalog,validateModels} from '../../packages/ai/models.js';
import {verifyAttestation,type Identity} from '../../packages/core/attestation.js';
import {registerPaidVerification} from './payments.js';
import {localMode} from '../../packages/core/local-mode.js';
import {verifyLocalIdentity,type LocalIdentity} from '../../packages/core/local-identity.js';
import {pinnedLocalSigner} from '../signer/local-keys.js';
import {executionReadiness} from './readiness.js';
import {dashboard} from './dashboard.js';
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const billingAbi=parseAbi(['event PlanPaid(bytes32 indexed crewId,address indexed payer,uint8 plan,uint8 months,uint256 amount)','function expiresAt(bytes32) view returns(uint256)','function planOf(bytes32) view returns(uint8)']);
/** Construct the API with its authentication, origin, local-administration and request-limit checks. */
export async function createServer(db:Database){
  assertProductionConfig(config);
  const csp=config.NODE_ENV==='production'?await productionCsp():null;
  const isLocal=localMode();
  const app=Fastify({logger:config.NODE_ENV==='test'?false:{level:'info',redact:['req.headers.authorization','req.headers.cookie','res.headers.set-cookie','key','signature','token','authorization','req.headers.payment-signature']},bodyLimit:32768,trustProxy:false});
  // A landing page can load >120 static assets. Assets must not consume API
  // quota or a first visit can prevent its own dashboard bundle from loading.
  await app.register(cookie);await app.register(rateLimit,{max:120,timeWindow:'1 minute',allowList:req=>!req.url.startsWith('/api/')||['/api/health','/api/ready'].includes(req.url.split('?')[0])});
  app.setErrorHandler((e,req,reply)=>{const err=e as Error&{statusCode?:number};reply.code(err.statusCode??400).send({error:err.message.replace(/(?:https?:\/\/)?(?:api\.)?ppq(?:\.ai)?/gi,'AI service').slice(0,300)});});
  app.addHook('onRequest',async(req,reply)=>{
    reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer').header('X-Frame-Options','DENY');
    if(csp)reply.header('Content-Security-Policy',csp).header('Strict-Transport-Security','max-age=31536000').header('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    if(req.url.startsWith('/api/'))reply.header('Cache-Control','no-store');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin!==config.PUBLIC_ORIGIN)throw Error('Request origin does not match this deployment');
  });
  const owner=async(req:FastifyRequest)=>{
    const token=req.cookies.hh_session;if(!token)throw Object.assign(Error('Connect your wallet'),{statusCode:401});
    const r=await db.query<{owner:Hex}>('SELECT owner FROM sessions WHERE token=$1 AND expires_at>$2',[digest(token),Date.now()]);if(!r.rows[0])throw Object.assign(Error('Session expired'),{statusCode:401});return r.rows[0].owner;
  };
  const crew=async(req:FastifyRequest,id:string)=>{const who=await owner(req);const c=(await db.query<Crew>('SELECT * FROM crews WHERE id=$1 AND owner=$2',[id,who])).rows[0];if(!c)throw Object.assign(Error('Crew not found'),{statusCode:404});return c;};
  const local=(req:FastifyRequest)=>{const addr=req.socket.remoteAddress;if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(addr??'')||config.NODE_ENV==='production')throw Object.assign(Error('Secret setup is available only on this computer'),{statusCode:403});};
  registerPaper(app,db,crew);
  /** Report execution prerequisites and return 503 when required services are unavailable. */
  app.get('/api/ready',async(_req,reply)=>{try{const status=await runtimeHealth(db);return reply.code(status.ok?200:503).send(status);}catch{return reply.code(503).send({ok:false,checks:[{id:'database',ok:false}]});}});
  /** Report API process liveness for the container health check. */
  app.get('/api/health',async()=>({ok:true,network:'mainnet',chainId:CONTRACT_CHAIN_ID}));
  /** Return public network and application settings without private operator credentials. */
  app.get('/api/config',async()=>({network:'mainnet',chainId:CONTRACT_CHAIN_ID,contractNetwork:'Elysium',tradingNetwork:'HyperCore',signerMode:isLocal?'local':'phala',subscriptionRequired:false,origin:config.PUBLIC_ORIGIN,builder:config.BUILDER_ADDRESS??null,billing:(await integrationSettings()).billing??null,roots:(await integrationSettings()).roots??null,integrations:await integrationSettings(),aiConfigured:Boolean(await ppqKey()),localSetup:config.NODE_ENV!=='production',localProjectFolder:config.NODE_ENV!=='production'?resolve('.'):null,liveEnabled:config.LIVE_TRADING_ENABLED==='true',postgres:Boolean(config.DATABASE_URL),measurement:config.MEASUREMENT_HASH??null,models:await modelSettings(),services:(await db.query('SELECT * FROM heartbeats')).rows}));
  /** Validate and store the inference credential from local setup. */
  app.post('/api/setup/ai',async(req)=>{local(req);const {key}=z.strictObject({key:z.string().min(10).max(512)}).parse(req.body);await savePpq(key);return {saved:true};});
  /** Validate and persist the local operator's distinct scout and skeptic selections. */
  app.post('/api/setup/models',async(req)=>{local(req);const {scout,skeptic}=z.strictObject({scout:z.string().max(200),skeptic:z.string().max(200)}).parse(req.body);await validateModels(scout,skeptic);await saveModels(scout,skeptic);return {saved:true};});
  /** Return the model catalog used by the configuration interface. */
  app.get('/api/models',async()=>({models:await catalog()}));
  /** Return current venue markets eligible for new entries. */
  app.get('/api/markets',async()=>({markets:await markets()}));
  /** Return chart observations for the requested symbol and interval. */
  app.get<{Params:{symbol:string}}>('/api/markets/:symbol/chart',async(req)=>{const symbol=z.string().regex(/^[A-Za-z0-9]{1,15}$/).parse(req.params.symbol);return {candles:await info.candleSnapshot({coin:symbol,interval:'1h',startTime:Date.now()-72*3600000,endTime:Date.now()})};});
  /** Create an expiring, single-use wallet sign-in challenge. */
  app.post('/api/auth/challenge',async(req)=>{
    const {address}=z.object({address:Address}).parse(req.body);const nonce=randomBytes(16).toString('hex'),expires=Date.now()+300000;
    await db.query('INSERT INTO auth_nonces VALUES($1,$2,$3)',[nonce,address,expires]);
    const message=createSiweMessage({domain:new URL(config.PUBLIC_ORIGIN).host,address,statement:'Sign in to HyperHive. This does not authorize any trade or transfer.',uri:config.PUBLIC_ORIGIN,version:'1',chainId:CONTRACT_CHAIN_ID,nonce,issuedAt:new Date(),expirationTime:new Date(expires)});
    return {message};
  });
  /** Verify and consume a wallet challenge before issuing the session cookie. */
  app.post('/api/auth/verify',async(req,reply)=>{
    const {message,signature}=z.strictObject({message:z.string().max(3000),signature:Signature}).parse(req.body);const parsed=parseSiweMessage(message);
    if(!parsed.address||!parsed.nonce||!validateSiweMessage({message:parsed,domain:new URL(config.PUBLIC_ORIGIN).host})||parsed.uri!==config.PUBLIC_ORIGIN||parsed.chainId!==CONTRACT_CHAIN_ID)throw Error('Invalid sign-in message');
    if(!await verifyMessage({address:parsed.address,message,signature:signature as Hex}))throw Error('Wallet signature invalid');
    const nonce=await db.query('DELETE FROM auth_nonces WHERE nonce=$1 AND owner=$2 AND expires_at>$3 RETURNING nonce',[parsed.nonce,parsed.address.toLowerCase(),Date.now()]);if(!nonce.rows.length)throw Error('Sign-in challenge expired or already used');
    const token=randomBytes(32).toString('hex');await db.query('INSERT INTO sessions VALUES($1,$2,$3)',[digest(token),parsed.address.toLowerCase(),Date.now()+86400000]);
    reply.setCookie('hh_session',token,{path:'/',httpOnly:true,sameSite:'strict',secure:config.PUBLIC_ORIGIN.startsWith('https:'),maxAge:86400});return {owner:parsed.address.toLowerCase()};
  });
  /** Resolve the current owner from the session cookie. */
  app.get('/api/me',async(req)=>({owner:await owner(req)}));
  /** Aggregate balances, activity and observed history for the signed-in owner. */
  app.get('/api/dashboard',async(req)=>dashboard(db,await owner(req)));
  /** Revoke the present session and clear its cookie. */
  app.post('/api/auth/logout',async(req,reply)=>{if(req.cookies.hh_session)await db.query('DELETE FROM sessions WHERE token=$1',[digest(req.cookies.hh_session)]);reply.clearCookie('hh_session',{path:'/'});return {ok:true};});
  /** List the signed-in owner's crews. */
  app.get('/api/crews',async(req)=>({crews:(await db.query<Crew>('SELECT * FROM crews WHERE owner=$1 ORDER BY created_at',[await owner(req)])).rows}));
  /** Validate owner, signature, origin, eligible markets and plan limits before enrollment. */
  app.post('/api/crews',async(req)=>{
    const who=await owner(req);await requireAccess(db,who);const {policy,signature}=z.strictObject({policy:Policy,signature:Signature}).parse(req.body);
    if(policy.owner!==who||policy.origin!==config.PUBLIC_ORIGIN||!await verifyPolicy(policy,signature))throw Error('Trading policy signature invalid');
    if(policy.plan==='crew'&&policy.markets.length>10)throw Error('Crew supports up to 10 markets');
    const count=(await db.query<{n:string}>("SELECT count(*)::text n FROM crews WHERE owner=$1 AND policy->>'plan'='pro'",[who])).rows[0];if(policy.plan==='pro'&&Number(count.n)>=3)throw Error('Crew Pro supports up to three crews per owner');
    const allowed=(await markets()).map(m=>m.name);if(policy.markets.some(m=>!allowed.includes(m)))throw Error('Unsupported market');
    await db.query('INSERT INTO crews(id,owner,account,policy,signature,created_at) VALUES($1,$2,$3,$4,$5,$6)',[policy.crewId,who,policy.account,JSON.stringify(policy),signature,Date.now()]);return {id:policy.crewId};
  });
  /** Read owned crew detail including venue state, journal, budget and readiness. */
  app.get<{Params:{id:string}}>('/api/crews/:id',async(req)=>{
    const c=await crew(req,req.params.id);const [state,orders,agents]=await Promise.all([accountState(c.account),info.frontendOpenOrders({user:c.account}),info.extraAgents({user:c.account})]);
    return {crew:c,state,orders,agents,steps:(await db.query('SELECT s.* FROM execution_steps s JOIN cards c ON c.id=s.card_id WHERE c.crew_id=$1 ORDER BY s.started_at DESC LIMIT 100',[c.id])).rows,readiness:await executionReadiness(db,c,state,agents),identity:(await db.query('SELECT * FROM identities WHERE crew_id=$1',[c.id])).rows[0]??null,cards:(await db.query('SELECT * FROM cards WHERE crew_id=$1 ORDER BY created_at DESC LIMIT 50',[c.id])).rows,events:(await db.query('SELECT * FROM events WHERE crew_id=$1 ORDER BY id DESC LIMIT 100',[c.id])).rows,positions:(await db.query('SELECT * FROM positions WHERE crew_id=$1',[c.id])).rows,budget:(await db.query("SELECT coalesce(sum(greatest(reserved,coalesce(actual,0))),0) spent FROM budgets WHERE crew_id=$1 AND day=$2",[c.id,new Date().toISOString().slice(0,10)])).rows[0],record:await verifyRecord(db,c.id)};
  });
  /** Read owner and crew balances and their venue activation requirements. */
  app.get<{Params:{id:string}}>('/api/crews/:id/funding',async req=>{
    const c=await crew(req,req.params.id);
    const [state,crewState,ownerRole,crewRole]=await Promise.all([accountState(c.owner),accountState(c.account),info.userRole({user:c.owner}),info.userRole({user:c.account})]);
    return {owner:c.owner,account:c.account,available:Number(state.withdrawable),equity:Number(crewState.marginSummary.accountValue),ownerActivation:ownerRole.role==='missing',crewActivation:crewRole.role==='missing',checkedAt:Date.now()};
  });
  /** Queue a fresh owner-signed control and serialize admission against mode changes. */
  app.post<{Params:{id:string}}>('/api/crews/:id/control',async(req)=>{const c=await crew(req,req.params.id);const body=z.strictObject({action:z.enum(['pause','resume','close']),nonce:z.string().uuid(),signature:Signature,issuedAt:z.number().int().positive()}).parse(req.body);
    if(Math.abs(Date.now()-body.issuedAt)>300000||!await verifyMessage({address:c.owner,message:controlMessage(c.id,body.action,body.nonce,hash(c.policy),body.issuedAt),signature:body.signature as Hex}))throw Error('Control signature invalid or expired');
    if(body.action==='resume'){
      if((await db.query('SELECT crew_id FROM paper_accounts WHERE crew_id=$1',[c.id])).rows.length)throw Error('This crew is reserved for paper testing. Create a separate crew for mainnet trading.');
      const [state,agents]=await Promise.all([accountState(c.account),info.extraAgents({user:c.account})]);
      const readiness=await executionReadiness(db,c,state,agents);
      if(!readiness.ready)throw Error('Not ready: '+readiness.checks.filter(c=>!c.ok).map(c=>c.label).join('; '));
    }
    await db.transaction(async tx=>{
    await tx.query('SELECT id FROM crews WHERE id=$1 FOR UPDATE',[c.id]);
    if(body.action==='resume'&&(await tx.query('SELECT crew_id FROM paper_accounts WHERE crew_id=$1',[c.id])).rows.length)throw Error('This crew is reserved for paper testing');
    await tx.query('INSERT INTO controls(nonce,crew_id,action,signature,created_at,policy_hash,issued_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[body.nonce,c.id,body.action,body.signature,Date.now(),hash(c.policy),body.issuedAt]);
    if(body.action!=='resume')await tx.query('UPDATE crews SET paused=true WHERE id=$1',[c.id]);});return {queued:true};});
  /** Verify the owned crew agent's local binding or measured hardware identity and registry approval. */
  app.get<{Params:{id:string}}>('/api/crews/:id/attestation',async(req)=>{
    const c=await crew(req,req.params.id);
    if(isLocal){
      local(req);const identity=(await db.query<LocalIdentity>('SELECT * FROM identities WHERE crew_id=$1',[c.id])).rows[0];
      if(!identity)throw Error('Local signer has not created this bot’s agent yet');
      return verifyLocalIdentity(identity,c,await pinnedLocalSigner());
    }
    if(!config.MEASUREMENT_HASH||!config.ROOT_CONTRACT)throw Error('Approved deployment and root contract are not configured');
    const identity=(await db.query<Identity>('SELECT * FROM identities WHERE crew_id=$1',[c.id])).rows[0];
    if(!identity||identity.quote.policyHash!==hash(c.policy))throw Error('Signer identity does not bind the current policy');
    const result=await verifyAttestation(identity,config.MEASUREMENT_HASH as Hex);
    const rpc=createPublicClient({transport:http(config.ELYSIUM_RPC)});if(await rpc.getChainId()!==CONTRACT_CHAIN_ID)throw Error('Wrong attestation registry chain');
    const registry=await rpc.readContract({address:config.ROOT_CONTRACT as Hex,abi:parseAbi(['function registry() view returns(address)']),functionName:'registry'});
    const abi=parseAbi(['function approved(address) view returns(bool)','function posterMeasurement(address) view returns(bytes32)']);
    const [approved,measurement]=await Promise.all([rpc.readContract({address:registry,abi,functionName:'approved',args:[identity.signer]}),rpc.readContract({address:registry,abi,functionName:'posterMeasurement',args:[identity.signer]})]);
    if(!approved||measurement!==config.MEASUREMENT_HASH)throw Error('Signer is not registered under the approved measurement');
    return {...result,registry};
  });
  /** Install the next signed policy generation after checking in-flight and open exposure. */
  app.post<{Params:{id:string}}>('/api/crews/:id/renew',async(req)=>{const old=await crew(req,req.params.id);const {policy,signature}=z.strictObject({policy:Policy,signature:Signature}).parse(req.body);
    if(policy.owner!==old.owner||policy.account!==old.account||policy.crewId!==old.id||policy.generation!==old.policy.generation+1||policy.origin!==config.PUBLIC_ORIGIN||!await verifyPolicy(policy,signature))throw Error('Renewal policy mismatch');
    await db.transaction(async tx=>{
      const locked=(await tx.query<Crew>('SELECT * FROM crews WHERE id=$1 FOR UPDATE',[old.id])).rows[0];
      if(!locked||hash(locked.policy)!==hash(old.policy))throw Error('Policy changed during renewal');
      if((await tx.query("SELECT id FROM cards WHERE crew_id=$1 AND status='SENDING' LIMIT 1",[old.id])).rows.length)throw Error('Wait for the pending entry before renewal');
      if((await accountState(old.account)).assetPositions.some(p=>+p.position.szi!==0)||(await info.frontendOpenOrders({user:old.account})).length)throw Error('Close existing positions and cancel orders before key rotation');
      await tx.query('UPDATE crews SET policy=$2,signature=$3,paused=true WHERE id=$1',[old.id,JSON.stringify(policy),signature]);
    });return {ok:true};});
  /** Return public reconciliation status and observed metrics for one crew. */
  app.get<{Params:{id:string}}>('/api/records/:id',async(req)=>verifyRecord(db,req.params.id));
  /** Export signed public intents, published identity and recent archived roots. */
  app.get<{Params:{id:string}}>('/api/records/:id/slips',async(req)=>({slips:(await db.query('SELECT * FROM slips WHERE crew_id=$1 ORDER BY seq',[req.params.id])).rows,identity:(await db.query('SELECT * FROM identities WHERE crew_id=$1',[req.params.id])).rows[0]??null,roots:(await db.query('SELECT * FROM roots ORDER BY hour DESC LIMIT 168')).rows}));
  /** List public fill classifications for a single crew in time order. */
  app.get<{Params:{id:string}}>('/api/records/:id/fills',async(req)=>({fills:(await db.query('SELECT * FROM fills WHERE crew_id=$1 ORDER BY created_at',[req.params.id])).rows}));
  /** Return the completed or current hour's signed slips and recorded root. */
  app.get<{Params:{hour:string}}>('/api/archive/hours/:hour',async(req)=>{
    const hour=z.coerce.number().int().positive().max(Math.floor(Date.now()/3600000)).parse(req.params.hour);
    return {hour,slips:(await db.query('SELECT * FROM slips WHERE created_at >= $1 AND created_at < $2 ORDER BY digest',[hour*3600000,(hour+1)*3600000])).rows,root:(await db.query('SELECT * FROM roots WHERE hour=$1',[hour])).rows[0]??null};
  });
  /** List recent public crew records and their reconciliation status. */
  app.get('/api/records',async()=>({records:await Promise.all((await db.query<{id:string}>('SELECT id FROM crews ORDER BY created_at LIMIT 100')).rows.map(c=>verifyRecord(db,c.id)))}));
  /** Page through public signed crew policies using a bounded offset. */
  app.get<{Querystring:{offset?:string}}>('/api/crew-registry',async(req)=>{
    const offset=z.coerce.number().int().min(0).max(1000000).parse(req.query.offset??0);
    const rows=(await db.query('SELECT id,account,policy,signature,created_at FROM crews ORDER BY created_at,id OFFSET $1 LIMIT 100',[offset])).rows;
    return {crews:rows,nextOffset:rows.length===100?offset+100:null};
  });
  /** Return HTTP 410 for the retired monthly crew-payment endpoint. */
  app.post('/api/crews/:id/payment',async()=>{throw Object.assign(Error('Monthly plans have been replaced by Tokens'),{statusCode:410});});
  registerTokens(app,db,owner,local);
  registerPaidVerification(app,db,owner);
  registerIntegrations(app,db,owner,local);
  registerHosting(app,local);
  /** Return a rate-limited API error for unknown paths. */
  app.get('/api/*',async(_req,reply)=>reply.code(404).send({error:'Not found'}));
  if(existsSync(resolve('dist/web'))){await app.register(staticFiles,{root:resolve('dist/web')});app.setNotFoundHandler((req,reply)=>req.url.startsWith('/api/')?reply.code(404).send({error:'Not found'}):reply.sendFile(req.url.split('?')[0]==='/'?'index.html':'app.html'));}
  return app;
}
