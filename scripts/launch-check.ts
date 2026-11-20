import {createPublicClient,http} from 'viem';
import {CONTRACT_CHAIN_ID} from '../packages/core/chain.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Database} from '../packages/core/db.js';
import {config} from '../packages/core/config.js';
import {integrationSettings} from '../packages/core/integration-settings.js';
import {modelSettings,ppqKey} from '../packages/core/secrets.js';
import {tokenPricing} from '../packages/core/tokens.js';
import {runtimeHealth} from '../packages/core/runtime-health.js';
import {assertProductionConfig} from '../packages/core/production.js';
import {validateModels} from '../packages/ai/models.js';
import {accountState,info,markets} from '../packages/core/venue.js';
import {executionReadiness} from '../apps/api/readiness.js';
import type {Crew} from '../packages/core/domain.js';

// Read-only external calls. Never signs, generates a wallet, infers, sends an
// order, confirms an invoice, or mutates the application database.
if(!config.DATABASE_URL)throw Error('Configure Postgres before running the launch check');
const db=new Database(config.DATABASE_URL);
type Check={id:string;ok:boolean;detail:string};const checks:Check[]=[];
async function check(id:string,action:()=>Promise<{ok:boolean;detail:string}>){try{checks.push({id,...await action()});}catch{checks.push({id,ok:false,detail:'Could not verify; inspect this integration locally.'});}}
try{
 const settings=await integrationSettings(),models=await modelSettings(),key=await ppqKey();
 await check('runtime',async()=>{const r=await runtimeHealth(db);return {ok:r.ok,detail:r.checks.map(c=>`${c.id}: ${c.ok?'healthy':'needed'}`).join(', ')};});
 await check('contract-network',async()=>({ok:await createPublicClient({transport:http(config.ELYSIUM_RPC)}).getChainId()===CONTRACT_CHAIN_ID,detail:'Elysium mainnet (99901)'}));
 await check('markets',async()=>({ok:(await markets()).length>0,detail:'Hyperliquid mainnet market API'}));
 await check('ai-models',async()=>{await validateModels(models.scout,models.skeptic);return {ok:true,detail:`${models.scout} / ${models.skeptic}`};});
 await check('ai-key',async()=>{
  if(!key)return {ok:false,detail:'Enter the AI service key in local Settings.'};
  const r=await fetch('https://api.ppq.ai/queries/history?page=1&page_count=1',{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000),redirect:'error'});
  await r.body?.cancel();return {ok:r.ok,detail:r.ok?'Authenticated read-only request passed. Prepaid balance still needs operator confirmation.':`Authentication check returned HTTP ${r.status}.`};
 });
 await check('checkout',async()=>({ok:(await tokenPricing()).checkoutReady,detail:settings.tokenPayTo?`Receiving wallet: ${settings.tokenPayTo}`:'Create, back up and connect the receiving wallet under Tokens.'}));
 const crews=(await db.query<Crew>('SELECT * FROM crews ORDER BY created_at')).rows;
 checks.push({id:'crew-created',ok:crews.length>0,detail:`${crews.length} crew(s). Fund the crew account, never the agent address.`});
 const crewChecks=[];
 for(const crew of crews){
  try{const [account,agents]=await Promise.all([accountState(crew.account),info.extraAgents({user:crew.account})]);const r=await executionReadiness(db,crew,account,agents);crewChecks.push({id:crew.id,name:crew.policy.name,owner:crew.owner,tradingAccount:crew.account,equityUSDC:Number(account.marginSummary.accountValue),ready:r.ready,checks:r.checks});}
  catch{crewChecks.push({id:crew.id,name:crew.policy.name,tradingAccount:crew.account,ready:false,error:'Could not verify mainnet readiness'});}
 }
 const evidence=(await db.query<any>(`SELECT
  (SELECT count(*)::int FROM token_invoices WHERE status='PAID') paidInvoices,
  (SELECT count(*)::int FROM token_usage WHERE charged>0) chargedModelCalls,
  (SELECT count(*)::int FROM cards WHERE status='FILLED') filledCards,
  (SELECT count(*)::int FROM fills) reconciledFills,
  (SELECT count(*)::int FROM positions) managedPositions,
  (SELECT count(*)::int FROM events WHERE kind='exit') recordedExits,
  (SELECT count(*)::int FROM roots WHERE status='ANCHORED') anchoredHours,
  (SELECT count(*)::int FROM slips WHERE ack IS NULL) unacknowledgedIntents`)).rows[0];
 checks.push({id:'mainnet-acceptance',ok:false,detail:'Requires a reviewed funded payment, actual AI/entry/fill/protection/exit, restart recovery, revocation and withdrawal test. Record counts alone cannot certify this.'});
 await check('production-config',async()=>{assertProductionConfig({...config,NODE_ENV:'production'});return {ok:true,detail:'HTTPS, protected signer and verified TLS database configured'};});
 checks.push({id:'published-image',ok:Boolean(settings.imageDigest),detail:settings.imageDigest??'Build and publish an immutable container image.'},{id:'published-terms',ok:settings.eligibilityEnabled&&Boolean(settings.termsVersion&&(settings.termsUrl||settings.termsText)),detail:'Publish the terms and eligibility settings supplied by your team.'},{id:'hosted-signer',ok:Boolean(settings.hostedOrigin&&settings.roots&&settings.measurement),detail:'Configure and verify Phala, root contracts and the approved software measurement.'});
 const report={checkedAt:new Date().toISOString(),launchReady:false,mode:config.SIGNER_MODE,origin:config.PUBLIC_ORIGIN,checks,crews:crewChecks,evidence,remainingAcceptance:'Verify deployed contracts, signer attestation, operational controls and operator approval before funding.'};
 await mkdir('output/launch',{recursive:true});const path=resolve('output/launch/readiness.json');await writeFile(path,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 for(const c of checks)console.log(`${c.ok?'PASS':'NEEDED'} ${c.id}: ${c.detail}`);
 for(const c of crewChecks)console.log(`${c.ready?'PASS':'NEEDED'} crew ${c.name}: ${c.tradingAccount}`);
 console.log(`Report: ${path}`);console.log('Public launch acceptance: NOT YET VERIFIED');
 if(checks.some(c=>!c.ok)||crewChecks.some(c=>!c.ready))process.exitCode=1;
}finally{await db.close();}
