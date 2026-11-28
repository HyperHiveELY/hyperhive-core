import {crewModels} from '../../packages/ai/crew-models.js';
import {approvedPoster} from '../../packages/core/crew-registry.js';
import type {Hex} from 'viem';
import {serviceHealthy} from '../../packages/core/runtime-health.js';
import {accessStatus} from '../../packages/core/access.js';
import type {Database} from '../../packages/core/db.js';
import {config} from '../../packages/core/config.js';
import {localMode} from '../../packages/core/local-mode.js';
import {type Crew,verifyPolicy,hash} from '../../packages/core/domain.js';
import {accountState,info} from '../../packages/core/venue.js';
import {verifyLocalIdentity,type LocalIdentity} from '../../packages/core/local-identity.js';
import {pinnedLocalSigner} from '../signer/local-keys.js';
import {ppqKey} from '../../packages/core/secrets.js';
import {aiCreditAccess,aiTestingExempt,meteringReady} from '../../packages/core/tokens.js';
/** Evaluate signed policy, signer, funding, agent, journal and metering prerequisites for entry. */
export async function executionReadiness(db:Database,crew:Crew,state:Awaited<ReturnType<typeof accountState>>,agents:Awaited<ReturnType<typeof info.extraAgents>>){
 const local=localMode();
 const [identities,services,uncertain,positions]=await Promise.all([
  db.query<any>('SELECT * FROM identities WHERE crew_id=$1',[crew.id]),db.query<{role:string;updated_at:number;details:{mode?:string;liveEnabled?:boolean}}>('SELECT * FROM heartbeats'),
  db.query('SELECT digest FROM slips WHERE crew_id=$1 AND ack IS NULL LIMIT 1',[crew.id]),db.query<{market:string}>('SELECT market FROM positions WHERE crew_id=$1',[crew.id]),
 ]);
 const identity=identities.rows[0];let identityValid=false;
 if(identity){try{if(local)await verifyLocalIdentity(identity as LocalIdentity,crew,await pinnedLocalSigner());else {
   if(identity.quote.policyHash!==hash(crew.policy)||identity.generation!==crew.policy.generation||!config.ROOT_CONTRACT||!config.MEASUREMENT_HASH)throw Error('Policy or registration changed');
   await approvedPoster(config.ELYSIUM_RPC,config.ROOT_CONTRACT as Hex,identity.signer,config.MEASUREMENT_HASH as Hex);
  }identityValid=true;}catch{}}
 const healthy=(role:string)=>services.rows.some(s=>s.role===role&&serviceHealthy(s));
 const accountValue=Number(state.marginSummary.accountValue),models=await crewModels(db,crew.id);
 const checks=[
  {id:'access',label:'Trading eligibility acknowledged',ok:(await accessStatus(db,crew.owner)).eligible},
  {id:'policy',label:'Signed policy is valid',ok:await verifyPolicy(crew.policy,crew.signature)},
  {id:'ai',label:'HyperHive AI models are available',ok:Boolean(await ppqKey())&&Boolean(models.scout&&models.skeptic&&models.scout.split('/')[0]!==models.skeptic.split('/')[0])},
  {id:'worker',label:'AI worker is running',ok:healthy('worker')},
  {id:'signer',label:local?'Local mainnet signer is running':'Mainnet signer is running',ok:config.LIVE_TRADING_ENABLED==='true'&&healthy('signer')},
  {id:'identity',label:local?'Local agent identity is verified':'Agent identity matches the signed policy',ok:identityValid},
  {id:'funded',label:'Trading account has at least 10 USDC equity',ok:Number.isFinite(accountValue)&&accountValue>=10},
  {id:'margin',label:'Free margin is available',ok:Number(state.withdrawable)>0},
  {id:'cap',label:'Balance is within your signed account limit',ok:accountValue<=crew.policy.maxAccountValue},
  {id:'agent',label:'Current trading agent is approved on Hyperliquid',ok:identityValid&&agents.some(a=>a.address.toLowerCase()===identity.agent.toLowerCase()&&(!a.validUntil||a.validUntil>Date.now()))},
  {id:'journal',label:'No unresolved orders or unmanaged positions',ok:!uncertain.rows.length&&!state.assetPositions.some(a=>Number(a.position.szi)!==0&&!positions.rows.some(p=>p.market===a.position.coin))},
  {id:'record',label:'Execution record is intact',ok:!crew.broken_since},
 ];
 if((await db.query('SELECT crew_id FROM paper_accounts WHERE crew_id=$1',[crew.id])).rows.length)checks.push({id:'paper',label:'Paper testing enabled; mainnet starts blocked for this crew',ok:false});
 const testingExempt=await aiTestingExempt(db,crew.owner);
 checks.push({id:'tokens',label:testingExempt?'AI testing access enabled · no Tokens needed':'Tokens are available for AI scans',ok:await aiCreditAccess(db,crew.owner)});
 checks.push({id:'metering',label:'AI usage metering is ready',ok:await meteringReady(db)});
 return {aiTestingExempt:testingExempt,mode:local?'local':'phala',ready:checks.every(c=>c.ok),checks};
}
