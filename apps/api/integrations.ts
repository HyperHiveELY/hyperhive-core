import {verifyDeployment} from '../../packages/core/deployment-verification.js';
import {CONTRACT_CHAIN_ID} from '../../packages/core/chain.js';
import {auditHour} from '../../packages/core/hour-audit.js';
import {countryCodes} from '../../packages/core/countries.js';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {createPublicClient,http,parseAbi,type Hex} from 'viem';
import {Database} from '../../packages/core/db.js';
import {config} from '../../packages/core/config.js';
import {IntegrationSettings,integrationSettings,saveIntegrationSettings} from '../../packages/core/integration-settings.js';
import {saveIntegrationSecrets,secrets} from '../../packages/core/secrets.js';
import {TelegramPreferences,configureTelegram,telegramStatus,beginTelegramLink,disconnectTelegram,enqueueNotification} from '../../packages/core/telegram.js';
import {tokenBenefit,benefitCrew} from '../../packages/core/entitlements.js';
import {accessStatus} from '../../packages/core/access.js';
import {Address,type Crew} from '../../packages/core/domain.js';
import {auditorAbi,rootsAbi,tokenAbi} from '../../packages/core/contract-abis.js';
import {prepareDeployment,reviewedDeployment,SavedDeploymentInput} from '../../packages/core/deployment.js';
import {networkState} from './network.js';
/** Verify Elysium bytecode, payment-token decimals and the configured links between contracts. */
export async function validateContracts(s:IntegrationSettings){
 const fields=['token','auditor','roots','billing','governance','registry','usdc'] as const;
 if(!fields.some(k=>s[k]))return;
 const rpc=createPublicClient({transport:http(config.ELYSIUM_RPC)});if(await rpc.getChainId()!==CONTRACT_CHAIN_ID)throw Error('Expected Elysium mainnet');
 for(const key of fields)if(s[key]&&!await rpc.getCode({address:s[key] as Hex}))throw Error(key+' has no deployed contract');
 const check=(a:string,b:string|undefined,name:string)=>{if(b&&a.toLowerCase()!==b.toLowerCase())throw Error(name+' contract relationship does not match');};
 if(s.token){await rpc.readContract({address:s.token as Hex,abi:tokenAbi,functionName:'totalSupply'});}
 if(s.usdc&&await rpc.readContract({address:s.usdc as Hex,abi:tokenAbi,functionName:'decimals'})!==6)throw Error('Payment token must use 6 decimals');
 if(s.auditor){check(await rpc.readContract({address:s.auditor as Hex,abi:auditorAbi,functionName:'token'}),s.token,'HHIV');check(await rpc.readContract({address:s.auditor as Hex,abi:auditorAbi,functionName:'roots'}),s.roots,'Auditor roots');check(await rpc.readContract({address:s.auditor as Hex,abi:auditorAbi,functionName:'rewardToken'}),s.usdc,'Auditor rewards');}
 if(s.roots)check(await rpc.readContract({address:s.roots as Hex,abi:rootsAbi,functionName:'registry'}),s.registry,'Root registry');
 if(s.billing){const abi=parseAbi(['function token() view returns(address)','function auditors() view returns(address)']);check(await rpc.readContract({address:s.billing as Hex,abi,functionName:'token'}),s.usdc,'Billing token');check(await rpc.readContract({address:s.billing as Hex,abi,functionName:'auditors'}),s.auditor,'Billing auditor');}
}
/** Install operator setup, authenticated access, notification and deployment endpoints. */
export function registerIntegrations(app:FastifyInstance,db:Database,owner:(req:FastifyRequest)=>Promise<Hex>,local:(req:FastifyRequest)=>void){
 /** Return public connection settings and the operator's setup status. */
 app.get('/api/integrations',async()=>({settings:await integrationSettings()}));
 /** Validate and save local operator settings, including configured contract relationships. */
 app.post('/api/setup/integrations',async req=>{local(req);const next=IntegrationSettings.parse(req.body);await validateContracts(next);return {settings:await saveIntegrationSettings(next)};});
 /** Store the local operator's facilitator credential. */
 app.post('/api/setup/facilitator',async req=>{local(req);const {token}=z.strictObject({token:z.string().min(1).max(2000)}).parse(req.body);await saveIntegrationSecrets({X402_FACILITATOR_TOKEN:token});return {saved:true};});
 /** Validate and save a local notification bot connection. */
 app.post('/api/setup/telegram',async req=>{local(req);const {token}=z.strictObject({token:z.string().max(512)}).parse(req.body),old=(await secrets()).TELEGRAM_BOT_USERNAME,result=await configureTelegram(token);if(old&&old!==result.username)await db.transaction(async q=>{await q.query("DELETE FROM integration_cursors WHERE name='telegram'");await q.query('DELETE FROM telegram_pairings');await q.query('DELETE FROM telegram_links');await q.query("UPDATE notification_outbox SET status='CANCELLED' WHERE status='PENDING'");});return result;});
 /** Return the authenticated owner's Telegram link and notification preferences. */
 app.get('/api/telegram',async req=>telegramStatus(db,await owner(req)));
 /** Create an expiring Telegram linking code for the current owner. */
 app.post('/api/telegram/link',async req=>beginTelegramLink(db,await owner(req)));
 /** Disconnect the current owner's chat and cancel pending deliveries. */
 app.post('/api/telegram/disconnect',async req=>{await disconnectTelegram(db,await owner(req));return {disconnected:true};});
 /** Update notification categories for the current owner. */
 app.post('/api/telegram/preferences',async req=>{const who=await owner(req),preferences=TelegramPreferences.parse(req.body);await db.query('INSERT INTO telegram_links(owner,preferences) VALUES($1,$2) ON CONFLICT(owner) DO UPDATE SET preferences=excluded.preferences',[who,JSON.stringify(preferences)]);return {saved:true};});
 /** Queue a test notification for the linked owner. */
 app.post('/api/telegram/test',async req=>{const who=await owner(req);if(!(await telegramStatus(db,who)).linked)throw Error('Link Telegram first');const id=randomUUID();await enqueueNotification(db,who,id,'test','HyperHive\n\nYour alerts are connected.');return {id:who+':'+id,status:'PENDING'};});
 /** Read the owner's delivery result for an outbox item. */
 app.get<{Params:{id:string}}>('/api/telegram/delivery/:id',async req=>{const who=await owner(req);return (await db.query('SELECT status,attempts,sent_at,last_error FROM notification_outbox WHERE id=$1 AND owner=$2',[req.params.id,who])).rows[0]??{status:'NOT_FOUND'};});
 /** Return the current owner's on-chain eligibility and assigned crew. */
 app.get('/api/benefits',async req=>{const who=await owner(req);return {...await tokenBenefit(who,true),crewId:await benefitCrew(db,who)};});
 /** Assign the token benefit to an eligible crew owned by the caller. */
 app.post('/api/benefits/claim',async req=>{const who=await owner(req),{crewId}=z.strictObject({crewId:z.string().uuid()}).parse(req.body),crew=(await db.query<Crew>('SELECT * FROM crews WHERE id=$1 AND owner=$2',[crewId,who])).rows[0];if(!crew||crew.policy.plan!=='crew')throw Error('Choose an owned Crew plan');if(!(await tokenBenefit(who,true)).eligible)throw Error('HHIV balance is below the qualifying threshold');await db.query('INSERT INTO benefit_assignments VALUES($1,$2,$3) ON CONFLICT(owner) DO UPDATE SET crew_id=excluded.crew_id,updated_at=excluded.updated_at',[who,crewId,Date.now()]);return {crewId};});
 /** Return the current owner's eligibility and terms acceptance state. */
 app.get('/api/access',async req=>accessStatus(db,await owner(req)));
 /** Return the deployment's published terms and version. */
 app.get('/api/terms',async()=>{const s=await integrationSettings();return {version:s.termsVersion,text:s.termsText,url:s.termsUrl,published:s.eligibilityEnabled};});
 /** Record the exact published statement accepted by this signed-in wallet. */
 app.post('/api/access/accept',async req=>{
  const who=await owner(req),s=await integrationSettings();
  const b=z.strictObject({country:z.string().refine(c=>countryCodes.includes(c),'Choose a valid country').optional(),version:z.string(),accepted:z.literal(true)}).parse(req.body);
  if(!s.eligibilityEnabled || !s.termsVersion || b.version!==s.termsVersion || !(s.termsText.trim()||s.termsUrl))throw Error('Refresh the current published terms');
  if(s.blockedCountries.length && (!b.country||s.blockedCountries.includes(b.country)))throw Error('This deployment requires an eligible country');
  const now=Date.now();
  await db.transaction(async tx=>{
   await tx.query('INSERT INTO access_terms_history(owner,version,terms_text,terms_url,accepted_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner,version) DO NOTHING',[who,b.version,s.termsText,s.termsUrl??null,now]);
   const {rows:[record]}=await tx.query<{terms_text:string;terms_url:string|null}>('SELECT terms_text,terms_url FROM access_terms_history WHERE owner=$1 AND version=$2',[who,b.version]);
   if(record.terms_text!==s.termsText||record.terms_url!==(s.termsUrl??null))throw Error('The operator must publish these changes under a new terms version');
   await tx.query('INSERT INTO access_acceptances(owner,version,country,accepted_at) VALUES($1,$2,$3,$4) ON CONFLICT(owner) DO UPDATE SET version=excluded.version,country=excluded.country,accepted_at=excluded.accepted_at',[who,b.version,b.country??'',now]);
  });
  return accessStatus(db,who);
 });
 /** Compute an independent completed-hour result for the signed-in operator. */
 app.post('/api/network/audit',async req=>{await owner(req);const {hour}=z.strictObject({hour:z.number().int().positive().max(Math.floor(Date.now()/3600000)-1)}).parse(req.body),s=await integrationSettings();if(!s.measurement||!s.roots)throw Error('Configure the independently verified Phala measurement and root contract before computing a network vote');return auditHour(s.hostedOrigin??config.PUBLIC_ORIGIN,hour,s.measurement as Hex,s.roots as Hex,config.ELYSIUM_RPC);});
 /** Read public network state and an optional operator's obligations. */
 app.get<{Querystring:{owner?:string;hour?:string}}>('/api/network',async req=>networkState(req.query.owner?Address.parse(req.query.owner):undefined,req.query.hour?z.coerce.number().int().positive().max(Math.floor(Date.now()/3600000)).parse(req.query.hour):undefined));
 /** Estimate gas for a reviewed deployment step for the connected deployer. */
 app.post('/api/deployment/quote',async req=>{local(req);const who=await owner(req),{input,nonce,index}=z.strictObject({input:SavedDeploymentInput,nonce:z.number().int().nonnegative(),index:z.number().int().min(0).max(6)}).parse(req.body),plan=await reviewedDeployment(input,nonce),step=plan.transactions[index];if(!step)throw Error('Unknown deployment step');if(step.from!==who)throw Error('Connect the deployer wallet');const rpc=createPublicClient({transport:http(config.ELYSIUM_RPC)});if(await rpc.getChainId()!==CONTRACT_CHAIN_ID)throw Error('Expected Elysium mainnet');const gas=await rpc.estimateGas({account:who,data:step.data}),price=await rpc.getGasPrice(),limit=(gas*120n+99n)/100n;return {gasLimit:String(limit),gasPrice:String(price),maxCost:String(limit*price),quotedAt:Date.now()};});
 /** Verify deployment receipts and active contract configuration against the local build. */
 app.post('/api/deployment/check',async req=>{local(req);await owner(req);return verifyDeployment(req.body);});
 /** Reconstruct a reviewed deployment from public inputs and nonce. */
 app.post('/api/deployment/validate',async req=>{local(req);await owner(req);const {input,nonce}=z.strictObject({input:SavedDeploymentInput,nonce:z.number().int().nonnegative()}).parse(req.body);return reviewedDeployment(input,nonce);});
 /** Prepare an unsigned deployer-bound plan using current chain state. */
 app.post('/api/deployment/prepare',async req=>{local(req);const who=await owner(req);if((req.body as any)?.deployer?.toLowerCase()!==who)throw Error('Use the signed-in deployer wallet');return prepareDeployment(req.body);});
}
