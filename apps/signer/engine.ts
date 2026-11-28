import {uninterruptedEntry} from '../../packages/core/position-recovery.js';
import {approvedPoster,rosterAbi} from '../../packages/core/crew-registry.js';
import type {Sql} from '../../packages/core/db.js';
import {CONTRACT_CHAIN_ID,contractChain} from '../../packages/core/chain.js';
import {accessStatus} from '../../packages/core/access.js';
import { ExchangeClient } from '@nktkas/hyperliquid';
import {randomInt} from 'node:crypto';
import { formatPrice, formatSize } from '@nktkas/hyperliquid/utils';
import { DstackClient } from '@phala/dstack-sdk';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { bytesToHex, verifyMessage, createPublicClient,createWalletClient,http,parseAbi,type Hex } from 'viem';

import { Database, event, heartbeat } from '../../packages/core/db.js';
import { config } from '../../packages/core/config.js';
import { info, transport, snapshot, allFills, fundingPaid, accountState, markets } from '../../packages/core/venue.js';
import {verifyCard,type CardAttestation} from '../../packages/core/card-signing.js';
import { Card, Policy, hash, ZERO, verifyPolicy, weekStart, controlMessage, type Crew, type PositionState, type Snapshot } from '../../packages/core/domain.js';
import { sizeTrade, nextExit } from '../../packages/core/risk.js';
import { signSlip, verifySlip, verifyChain, ackMessage,merkleRoot,type SignedSlip } from '../../packages/core/proof.js';
import {orderResult} from '../../packages/core/execution.js';
import {adlSkimSize} from '../../packages/core/exit-actions.js';
import {builderFeeFor} from '../../packages/core/entitlements.js';

import {localMode} from '../../packages/core/local-mode.js';
import {LocalKeys} from './local-keys.js';
import {LOCAL_ROOT,LOCAL_MEASUREMENT,localIdentityMessage,type LocalBinding} from '../../packages/core/local-identity.js';

type Order={a:number;b:boolean;p:string;s:string;r:boolean;t:{limit:{tif:'Ioc'|'Alo'|'Gtc'}}|{trigger:{isMarket:boolean;triggerPx:string;tpsl:'tp'|'sl'}};c?:Hex};
export class Signer {
  private dstack!:DstackClient;
  private keys=new Map<string,PrivateKeyAccount>();
  private slipKey!:PrivateKeyAccount;
  private measurement!:Hex;
  private nonce=Date.now();
  private localKeys?:LocalKeys;
  private local=false;
  private rootContract:Hex=LOCAL_ROOT;
  private composeHash='';
  private entryTimes=new Map<string,number>();
  private anchoring?:Promise<void>;
  /** Bind an execution engine to its journal database. Call init before starting a service loop. */
  constructor(readonly db:Database){}
  /** Load the pinned local identity or derive enclave keys after verifying the configured measurement. */
  async init(){
    if(!config.DATABASE_URL)throw Error('Signer requires Postgres');
    this.local=localMode();
    if(this.local){
      const existing=await this.db.query("SELECT digest FROM slips LIMIT 1");
      const identities=await this.db.query("SELECT crew_id FROM identities LIMIT 1");
      this.localKeys=await LocalKeys.load(!existing.rows.length&&!identities.rows.length);
      this.slipKey=this.localKeys.signer;this.measurement=LOCAL_MEASUREMENT;
      return;
    }
    if(!config.ROOT_CONTRACT)throw Error('Signer requires a deployed SlipRoot verifying contract');
    if(!config.MEASUREMENT_HASH)throw Error('Set the approved dstack measurement before starting the signer');
    this.rootContract=config.ROOT_CONTRACT as Hex;
    this.dstack=new DstackClient(config.DSTACK_SOCKET);
    const details=await this.dstack.info();
    this.composeHash=details.compose_hash;
    this.measurement=hash({mrtd:details.tcb_info.mrtd,rtmr0:details.tcb_info.rtmr0,rtmr1:details.tcb_info.rtmr1,rtmr2:details.tcb_info.rtmr2,rtmr3:details.tcb_info.rtmr3,composeHash:details.compose_hash});
    if(this.measurement!==config.MEASUREMENT_HASH)throw Error('dstack measurement does not match the approved deployment');
    // Keys come from whichever key service released them. Refuse to derive any key unless that service is the
    // one the operator pinned, so an app still bound to a retired or compromised key service never signs.
    if(!config.KMS_KEY_PROVIDER)throw Error('Set KMS_KEY_PROVIDER to the approved key service before starting the signer');
    if((details.key_provider_info??'').trim()!==config.KMS_KEY_PROVIDER.trim())throw Error('dstack key provider does not match the approved key service');
    this.slipKey=privateKeyToAccount(bytesToHex((await this.dstack.getKey('hyperhive/slip/v1')).key));
  }
  private async key(crew:Crew){
    if(this.localKeys)return this.localKeys.agent(crew.id,crew.policy.generation);
    const name=`hyperhive/crew/${crew.id}/agent/${crew.policy.generation}`;
    if(!this.keys.has(name))this.keys.set(name,privateKeyToAccount(bytesToHex((await this.dstack.getKey(name)).key)));
    return this.keys.get(name)!;
  }
  private async client(crew:Crew){return new ExchangeClient({transport,wallet:await this.key(crew),nonceManager:()=>{this.nonce=Math.max(Date.now(),this.nonce+1);return this.nonce;},defaultExpiresAfter:()=>Date.now()+30000});}
  /** Refresh the crew's generation-bound trading identity and signed local binding or hardware quote. */
  async identity(crew:Crew){
    const previous=(await this.db.query<{generation:number;updated_at:number;signer:string;agent:string;quote:{kind?:string}}>('SELECT generation,updated_at,signer,agent,quote FROM identities WHERE crew_id=$1',[crew.id])).rows[0];
    const agent=await this.key(crew);
    if(previous&&previous.generation===crew.policy.generation&&previous.signer===this.slipKey.address.toLowerCase()&&previous.agent===agent.address.toLowerCase()&&(previous.quote.kind==='local')===this.local&&Date.now()-previous.updated_at<3600000)return;
    if(this.local){
      const now=Date.now();
      const binding:LocalBinding={kind:'local',v:1,network:'mainnet',crewId:crew.id,account:crew.account,agent:agent.address.toLowerCase() as Hex,signer:this.slipKey.address.toLowerCase() as Hex,policyHash:hash(crew.policy),generation:crew.policy.generation,issuedAt:now,expiresAt:now+2*3600000};
      const quote={kind:'local',binding,signature:await this.slipKey.signMessage({message:localIdentityMessage(binding)})};
      await this.db.query('INSERT INTO identities VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(crew_id) DO UPDATE SET agent=excluded.agent,signer=excluded.signer,quote=excluded.quote,generation=excluded.generation,measurement=excluded.measurement,updated_at=excluded.updated_at',[crew.id,binding.agent,binding.signer,JSON.stringify(quote),crew.policy.generation,this.measurement,now]);
      return;
    }
    const report=hash({agent:agent.address.toLowerCase(),signer:this.slipKey.address.toLowerCase(),policyHash:hash(crew.policy),measurement:this.measurement});
    const q=await this.dstack.getQuote(Buffer.from(report.slice(2),'hex'));
    const quote={quote:q.quote,eventLog:q.event_log,reportData:report,policyHash:hash(crew.policy),measurement:this.measurement,composeHash:this.composeHash};
    await this.db.query('INSERT INTO identities VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(crew_id) DO UPDATE SET agent=excluded.agent,signer=excluded.signer,quote=excluded.quote,generation=excluded.generation,measurement=excluded.measurement,updated_at=excluded.updated_at',[crew.id,agent.address.toLowerCase(),this.slipKey.address.toLowerCase(),JSON.stringify(quote),crew.policy.generation,this.measurement,Date.now()]);
  }
  private async journal(crew:Crew,kind:string,order:Record<string,unknown>,cardHash:Hex=ZERO){
    const rows=await this.db.query<{body:SignedSlip['body'];digest:Hex;cloid:Hex;signature:Hex;signer:Hex}>('SELECT * FROM slips WHERE crew_id=$1 ORDER BY seq',[crew.id]);
    if(!await verifyChain(rows.rows)||rows.rows.some(s=>s.signer.toLowerCase()!==this.slipKey.address.toLowerCase()||s.body.chainId!==CONTRACT_CHAIN_ID||s.body.rootContract?.toLowerCase()!==this.rootContract.toLowerCase()))throw Error('Signed journal integrity failed; refusing to sign');
    const last=rows.rows.at(-1),now=Date.now();
    const slip=await signSlip({v:1,account:crew.account,crewId:crew.id,seq:(last?.body.seq??0)+1,previous:last?.digest??ZERO,kind,policyHash:hash(crew.policy),cardHash,measurement:this.measurement,agent:(await this.key(crew)).address,createdAt:now,expiresAt:now+30000,order:{...order,signerMode:this.local?'local':'phala'}},this.slipKey,this.rootContract);
    await this.db.query('INSERT INTO slips(digest,crew_id,seq,previous,body,signature,signer,cloid,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[slip.digest,crew.id,slip.body.seq,slip.body.previous,JSON.stringify(slip.body),slip.signature,slip.signer.toLowerCase(),slip.cloid,now]);return slip;
  }
  private async acknowledge(slip:SignedSlip,response:unknown){const signature=await this.slipKey.signMessage({message:ackMessage(slip.digest,response)});await this.db.query('UPDATE slips SET ack=$2 WHERE digest=$1',[slip.digest,JSON.stringify({response,signature})]);}
  private async send(crew:Crew,kind:string,orders:Order[],grouping:'na'|'normalTpsl'|'positionTpsl',cardHash:Hex=ZERO,evidence:Record<string,unknown>={}){
    // Closing/protective orders must not depend on a fee approval or benefit RPC.
    const chargeBuilder=Boolean(config.BUILDER_ADDRESS)&&orders.some(o=>!o.r);
    const startedAt=Date.now();const slips:SignedSlip[]=[],builderFee=chargeBuilder?await builderFeeFor(crew.owner):0;
    for(let i=0;i<orders.length;i++){const order=orders[i];const slip=await this.journal(crew,i===0?kind:('trigger' in order.t?order.t.trigger.tpsl.toUpperCase():kind),{...order,market:await this.marketName(order.a),grouping,builderFeeTenthBp:builderFee,...evidence},cardHash);orders[i]={...order,c:slip.cloid};slips.push(slip);}
    let response;
    let attempted=false;
    const transmit=async()=>orderResult(async()=>{
      const client=await this.client(crew);
      attempted=true;
      return client.order({orders,grouping,...(chargeBuilder?{builder:{b:config.BUILDER_ADDRESS as Hex,f:builderFee}}:{})});
    },orders.length);
    try{
      if(kind==='ENTRY'){
        response=await this.db.transaction(async tx=>{
          if(!await this.admission(tx,crew))return null;
          if(!this.local)await approvedPoster(config.ELYSIUM_RPC,this.rootContract,this.slipKey.address,this.measurement);
          // The API takes this same row lock before acknowledging a control.
          return transmit();
        });
      }else response=await transmit();
    }
    catch(e){
      if(attempted||kind!=='ENTRY'){
        await event(this.db,crew.id,'uncertain','Exchange response unavailable. Order state must be reconciled before another entry.');
        throw e;
      }
      await event(this.db,crew.id,'entry_blocked',String(e));
    }
    if(!response){
      for(const slip of slips)await this.acknowledge(slip,{submitted:false,reason:'Entry authorization changed'});
      await this.db.query("UPDATE cards SET status='REJECTED',reason='Entry authorization changed' WHERE id=$1",[cardHash]);
      throw Error('Entry authorization changed before submission');
    }
    for(let i=0;i<slips.length;i++)await this.acknowledge(slips[i],response.response.data.statuses[i]);
    if(cardHash!==ZERO)await this.db.query('INSERT INTO execution_steps VALUES($1,$2,$3,$4) ON CONFLICT(card_id,step) DO UPDATE SET started_at=excluded.started_at,finished_at=excluded.finished_at',[cardHash,'executor',startedAt,Date.now()]).catch(()=>{});
    return {slips,response};
  }
  private async marketName(asset:number){const m=await info.meta();return m.universe[asset]?.name??'';}
  private trigger(m:Snapshot,size:number,isBuy:boolean,price:number,tpsl:'tp'|'sl'):Order{
    return {a:m.asset,b:isBuy,p:formatPrice(price*(isBuy?1.05:.95),m.szDecimals),s:formatSize(size,m.szDecimals),r:true,t:{trigger:{isMarket:true,triggerPx:formatPrice(price,m.szDecimals),tpsl}}};
  }
  private async persist(crew:Crew,p:PositionState){const signature=await this.slipKey.signMessage({message:{raw:hash(p)}});await this.db.query('INSERT INTO positions VALUES($1,$2,$3) ON CONFLICT(crew_id,market) DO UPDATE SET body=excluded.body',[crew.id,p.market,JSON.stringify({state:p,signature})]);}
  private async state(crew:Crew){const r=await this.db.query<{body:{state:PositionState;signature:Hex}}>('SELECT body FROM positions WHERE crew_id=$1',[crew.id]);for(const p of r.rows){if(!await verifyMessage({address:this.slipKey.address,message:{raw:hash(p.body.state)},signature:p.body.signature}))throw Error('Position state signature failed');}return r.rows.map(r=>r.body.state);}
  /** Reconcile durable intents with venue evidence and restore only attributable live positions. */
  async recover(crew:Crew){
    const rows=(await this.db.query<SignedSlip&{ack:any}>('SELECT * FROM slips WHERE crew_id=$1 ORDER BY seq',[crew.id])).rows;
    if(!await verifyChain(rows)||rows.some(s=>s.signer.toLowerCase()!==this.slipKey.address.toLowerCase()||s.body.chainId!==CONTRACT_CHAIN_ID||s.body.rootContract?.toLowerCase()!==this.rootContract.toLowerCase()))throw Error('Journal integrity prevents recovery');
    for(const slip of rows.filter(s=>!s.ack)){
      const order=slip.body.order;
      if('a' in order&&'s' in order){
        const state=await info.orderStatus({user:crew.account,oid:slip.cloid});
        if(state.status==='order')await this.acknowledge(slip,{recovered:true,oid:state.order.order.oid,status:state.order.status});
        // Never infer rejection from unknownOid: an uncertain action remains blocked.
      }else if(slip.body.kind==='CANCEL'&&Array.isArray(order.cancels)&&order.cancels.length){
        const results=[];
        for(const cancel of order.cancels){
          const state=await info.orderStatus({user:crew.account,oid:cancel.o});
          if(state.status!=='order'||state.order.order.oid!==cancel.o||! /^(filled|canceled|rejected|.*Canceled|.*Rejected)$/.test(state.order.status))break;
          results.push({oid:cancel.o,status:state.order.status});
        }
        if(results.length===order.cancels.length)await this.acknowledge(slip,{recovered:true,results});
      }else if(slip.body.kind==='LEVERAGE'){
        const asset=await this.marketName(Number(order.asset));
        const data=await info.activeAssetData({user:crew.account,coin:asset});
        if(data.leverage.type==='isolated'&&data.leverage.value===Number(order.leverage))await this.acknowledge(slip,{recovered:true,leverage:data.leverage});
      }else if(slip.body.kind==='CONTROL')await this.acknowledge(slip,{recovered:true,accepted:true});
    }
    // A crash between an accepted entry and persistence can be reconstructed from its signed intent.
    const managed=await this.state(crew),live=await accountState(crew.account);
    for(const {position:p} of live.assetPositions){
      if(+p.szi===0||managed.some(x=>x.market===p.coin))continue;
      const entry=[...rows].reverse().find(s=>s.body.kind==='ENTRY'&&s.body.order.market===p.coin);
      if(!entry)continue;
      const order=await info.orderStatus({user:crew.account,oid:entry.cloid});if(order.status!=='order')continue;
      const fills=await allFills(crew.account,entry.body.createdAt-1000);
      if(!uninterruptedEntry(fills,p.coin,order.order.order.oid,entry.body.order.b===true,Number(p.szi),Number(entry.body.order.s)))continue;
      const children=rows.filter(s=>s.body.cardHash===entry.body.cardHash&&s.body.seq>entry.body.seq);
      const stop=children.find(s=>s.body.kind==='SL'),tp=children.find(s=>s.body.kind==='TP');
      if(!stop||!tp)continue;
      const trigger=(s:SignedSlip)=>Number((s.body.order.t as {trigger:{triggerPx:string}}).trigger.triggerPx);
      const card=(await this.db.query<{body:{card:Card}}>('SELECT body FROM cards WHERE id=$1',[entry.body.cardHash])).rows[0];
      const state:PositionState={market:p.coin,side:+p.szi>0?'long':'short',entry:Number(p.entryPx),size:Math.abs(+p.szi),stop:trigger(stop),tp:trigger(tp),extreme:Number(p.entryPx),openedAt:entry.body.createdAt,horizonH:card?.body.card.horizonH??4,entryDigest:entry.digest,lastModify:0,fundingStart:0,fundingPaid:Math.max(0,-Number(p.cumFunding.sinceOpen)),risk:Math.abs(Number(p.entryPx)-trigger(stop))*Math.abs(+p.szi)};
      await this.persist(crew,state);await this.db.query("UPDATE cards SET status='FILLED' WHERE id=$1",[entry.body.cardHash]);await event(this.db,crew.id,'recovered',`${p.coin}: reconstructed position from signed order and public fills`);
    }
    // Intent is persisted before transmission. Without an ENTRY intent, a
    // pre-send crash cannot have placed this card's trade. Never re-send it.
    const interrupted=await this.db.query<{id:Hex}>("SELECT id FROM cards WHERE crew_id=$1 AND status='SENDING'",[crew.id]);
    for(const card of interrupted.rows){
      const entry=rows.find(s=>s.body.kind==='ENTRY'&&s.body.cardHash===card.id);
      let status:string|undefined;
      if(!entry)status='REJECTED';
      else if(managed.some(p=>p.entryDigest===entry.digest))status='FILLED';
      else if(!live.assetPositions.some(a=>a.position.coin===entry.body.order.market&&Number(a.position.szi)!==0)){
        // A flat balance alone says nothing about an IOC that may have filled and closed.
        const ack=entry.ack;
        if(ack&&await verifyMessage({address:entry.signer,message:ackMessage(entry.digest,ack.response),signature:ack.signature})){
          if(ack.response?.submitted===false||typeof ack.response?.error==='string')status='REJECTED';
          else if(ack.response?.filled?.oid)status='FILLED';
        }
        if(!status){
          const venueOrder=await info.orderStatus({user:crew.account,oid:entry.cloid});
          if(venueOrder.status==='order'){
            if(venueOrder.order.status==='filled')status='FILLED';
            else if(/^(canceled|rejected|.*Canceled|.*Rejected)$/.test(venueOrder.order.status)){
              const order=venueOrder.order.order;
              // Order size is the remaining quantity. An IOC can fill partially before cancellation.
              const original=Number(order.origSz),remaining=Number(order.sz);
              if(original>0&&Number.isFinite(remaining)&&remaining>=0&&remaining<=original)status=remaining<original?'FILLED':'UNFILLED';
            }
          }
        }
      }
      if(status)await this.db.query("UPDATE cards SET status=$2,updated_at=$3 WHERE id=$1 AND status='SENDING'",[card.id,status,Date.now()]);
    }
  }
  /** Verify signed owner commands, process pending closes and reconcile paused state. */
  async controls(crew:Crew){
    // Order by when the API accepted each control, never by the client-supplied clock, so a fast device can't make
    // an older Resume sort after a newer Pause.
    const controls=await this.db.query<{nonce:string;action:'pause'|'resume'|'close';signature:Hex;handled:boolean;issued_at:number}>('SELECT * FROM controls WHERE crew_id=$1 AND policy_hash=$2 ORDER BY created_at,nonce',[crew.id,hash(crew.policy)]);
    let paused=true;
    for(const c of controls.rows){if(!await verifyMessage({address:crew.policy.owner,message:controlMessage(crew.id,c.action,c.nonce,hash(crew.policy),c.issued_at),signature:c.signature}))throw Error('Invalid owner control signature');
      paused=c.action!=='resume';
      if(!c.handled){if(c.action==='close')for(const p of await this.state(crew))await this.closePosition(crew,p,'Owner requested close');const slip=await this.journal(crew,'CONTROL',{action:c.action,nonce:c.nonce,signature:c.signature});await this.acknowledge(slip,{accepted:true});await this.db.query('UPDATE controls SET handled=true WHERE nonce=$1',[c.nonce]);}}
    if((await this.db.query('SELECT crew_id FROM paper_accounts WHERE crew_id=$1',[crew.id])).rows.length)paused=true;
    if(crew.paused!==paused)await this.db.query('UPDATE crews SET paused=$2 WHERE id=$1',[crew.id,paused]);return paused;
  }
  private async cancelBrackets(crew:Crew,m:Snapshot){
    const orders=await info.frontendOpenOrders({user:crew.account});const cancels=orders.filter(o=>o.coin===m.market&&o.reduceOnly).map(o=>({a:m.asset,o:o.oid}));
    if(cancels.length){const slip=await this.journal(crew,'CANCEL',{cancels});await this.acknowledge(slip,await (await this.client(crew)).cancel({cancels}));}
  }
  /** Submit a reduce-only exit for current venue exposure and retain protection after a partial fill. */
  async closePosition(crew:Crew,p:PositionState,reason:string){
    const actual=(await accountState(crew.account)).assetPositions.find(a=>a.position.coin===p.market)?.position;
    if(!actual||Number(actual.szi)===0){await this.db.query('DELETE FROM positions WHERE crew_id=$1 AND market=$2',[crew.id,p.market]);return;}
    const m=await snapshot(p.market),buy=Number(actual.szi)<0;
    const r=await this.send(crew,'EXIT',[{a:m.asset,b:buy,p:formatPrice(m.mark*(buy?1.005:.995),m.szDecimals),s:formatSize(Math.abs(Number(actual.szi)),m.szDecimals),r:true,t:{limit:{tif:'Ioc'}}}],'na');
    const status=r.response.response.data.statuses[0];if(typeof status==='object'&&'error' in status)throw Error(`Close rejected: ${status.error}`);
    const after=(await accountState(crew.account)).assetPositions.find(a=>a.position.coin===p.market)?.position;
    if(after&&Number(after.szi)!==0){p.size=Math.abs(Number(after.szi));await this.persist(crew,p);throw Error('Close partially filled; remaining position retains bracket and will be retried');}
    await this.cancelBrackets(crew,m);await this.db.query('DELETE FROM positions WHERE crew_id=$1 AND market=$2',[crew.id,p.market]);await event(this.db,crew.id,'exit',`${p.market}: ${reason}`);
  }
  private async stillManaged(crew:Crew,position:PositionState,quantity:number){
    const entry=(await this.db.query<SignedSlip>('SELECT * FROM slips WHERE crew_id=$1 AND digest=$2',[crew.id,position.entryDigest])).rows[0];
    if(!entry||entry.body.kind!=='ENTRY'||entry.body.order.market!==position.market||entry.signer.toLowerCase()!==this.slipKey.address.toLowerCase()||!await verifySlip(entry))return false;
    const order=await info.orderStatus({user:crew.account,oid:entry.cloid});
    if(order.status!=='order')return false;
    const fills=await allFills(crew.account,entry.body.createdAt-1000);
    return uninterruptedEntry(fills,position.market,order.order.order.oid,position.side==='long',quantity,Number(entry.body.order.s),true);
  }
  /** Reconcile each managed position and apply its close, skim or bracket policy. */
  async exits(crew:Crew){
    let unresolved=false;
    const positions=await this.state(crew),account=await accountState(crew.account);
    for(const p of positions){
      const actual=account.assetPositions.find(a=>a.position.coin===p.market)?.position;
      if(!actual||Number(actual.szi)===0){await this.cancelBrackets(crew,await snapshot(p.market));await this.db.query('DELETE FROM positions WHERE crew_id=$1 AND market=$2',[crew.id,p.market]);continue;}
      try{
        if(!await this.stillManaged(crew,p,Number(actual.szi)))throw Error('Live fills do not establish continuity with the signed entry');
      }catch(e){
        unresolved=true;
        await event(this.db,crew.id,'recovery',p.market+': '+String(e));
        continue;
      }
      p.size=Math.abs(Number(actual.szi));p.fundingPaid=Math.max(0,-Number(actual.cumFunding.sinceOpen)-p.fundingStart);
      const m=await snapshot(p.market),next=nextExit(p,m);p.extreme=next.extreme;
      if(next.close){await this.closePosition(crew,p,next.close);continue;}
      const previousSkim=(await this.db.query<{created_at:number}>("SELECT created_at FROM slips WHERE crew_id=$1 AND body->>'kind'='ADL_SKIM' AND body->'order'->>'market'=$2 ORDER BY created_at DESC LIMIT 1",[crew.id,p.market])).rows[0]?.created_at??0;
      const skim=adlSkimSize(p,m,Number(account.marginSummary.accountValue),previousSkim);
      if(skim){
        const buy=p.side==='short';
        await this.send(crew,'ADL_SKIM',[{a:m.asset,b:buy,p:formatPrice(m.mark*(buy?1.005:.995),m.szDecimals),s:formatSize(skim,m.szDecimals),r:true,t:{limit:{tif:'Ioc'}}}],'na');
        const remaining=(await accountState(crew.account)).assetPositions.find(x=>x.position.coin===p.market)?.position;
        const size=Math.abs(Number(remaining?.szi??0));
        if(!size){await this.cancelBrackets(crew,m);await this.db.query('DELETE FROM positions WHERE crew_id=$1 AND market=$2',[crew.id,p.market]);continue;}
        p.risk*=size/p.size;p.size=size;await this.persist(crew,p);
      }
      const {sl,restored}=await this.protect(crew,p,m);
      if(restored===false)continue;
      if(restored===null&&next.stop&&sl){
        const order=this.trigger(m,p.size,p.side==='short',next.stop,'sl'),slip=await this.journal(crew,'TRAIL',{...order,market:m.market,oid:sl.oid});
        const r=await orderResult(async()=>await (await this.client(crew)).modify({oid:sl.oid,order:{...order,c:slip.cloid}}),1);await this.acknowledge(slip,r);
        const status=r.response.data.statuses[0];
        if(typeof status==='object'&&'error' in status){await event(this.db,crew.id,'bracket_error',`${p.market}: trailing stop rejected; previous protection retained`);continue;}
        p.stop=next.stop;p.lastModify=Date.now();
      }
      await this.persist(crew,p);
    }
    // An unknown live position blocks entry and is surfaced for recovery, never silently adopted.
    for(const a of account.assetPositions)if(Number(a.position.szi)!==0&&!positions.some(p=>p.market===a.position.coin))await event(this.db,crew.id,'recovery',`${a.position.coin}: position lacks signed management state; new entries are blocked`);
    if(unresolved)throw Error('Position continuity requires reconciliation before another entry');
  }
  /** Make sure the position has both a resting stop-loss and take-profit; re-place whichever is missing at once.
   *  restored: null when both were already resting, true when replaced, false when the venue refused and the
   *  position was closed instead. */
  private async protect(crew:Crew,p:PositionState,m:Snapshot){
    const orders=await info.frontendOpenOrders({user:crew.account});
    const sl=orders.find(o=>o.coin===p.market&&o.reduceOnly&&o.orderType.toLowerCase().includes('stop'));
    const tp=orders.find(o=>o.coin===p.market&&o.reduceOnly&&o.orderType.toLowerCase().includes('take profit'));
    if(sl&&tp)return {sl,restored:null};
    const missing:Order[]=[];
    if(!sl)missing.push(this.trigger(m,p.size,p.side==='short',p.stop,'sl'));
    if(!tp)missing.push(this.trigger(m,p.size,p.side==='short',p.tp,'tp'));
    const r=await this.send(crew,'BRACKET',missing,'positionTpsl');
    if(r.response.response.data.statuses.some(s=>typeof s==='object'&&'error' in s)){await this.closePosition(crew,p,'Protective bracket rejected');return {sl,restored:false};}
    return {sl,restored:true};
  }
  private async registered(crew:Crew){
    if(this.local)return true;
    await approvedPoster(config.ELYSIUM_RPC,this.rootContract,this.slipKey.address,this.measurement);
    const rpc=createPublicClient({transport:http(config.ELYSIUM_RPC)});
    const id=hash(crew.id);
    const head=await rpc.getBlockNumber();
    const request={address:this.rootContract,abi:rosterAbi,functionName:'crewAccount',args:[id]} as const;
    const registered=await rpc.readContract({...request,blockNumber:head>0n?head-1n:head});
    if(registered.toLowerCase()===crew.account)return true;
    if(BigInt(registered)!==0n)throw Error('On-chain registration belongs to another account');
    if(!this.anchoring){
      if(BigInt(await rpc.readContract({...request,blockNumber:head}))!==0n)return false;
      const wallet=createWalletClient({account:this.slipKey,chain:contractChain,transport:http(config.ELYSIUM_RPC)});
      this.anchoring=(async()=>{
        const tx=await wallet.writeContract({address:this.rootContract,abi:rosterAbi,functionName:'registerCrew',args:[id,crew.account]});
        const receipt=await rpc.waitForTransactionReceipt({hash:tx,confirmations:2});
        if(receipt.status!=='success')throw Error('Crew registration reverted');
      })().catch(async e=>{await event(this.db,crew.id,'registration_error',String(e)).catch(()=>{});}).finally(()=>{this.anchoring=undefined;});
    }
    return false;
  }
  private async admission(tx:Sql,crew:Crew){
    const current=(await tx.query<Crew>('SELECT * FROM crews WHERE id=$1 FOR UPDATE',[crew.id])).rows[0];
    if(!current||current.paused||current.broken_since||hash(current.policy)!==hash(crew.policy)||crew.policy.expiresAt<=Date.now())return false;
    if((await tx.query('SELECT crew_id FROM paper_accounts WHERE crew_id=$1',[crew.id])).rows.length)return false;
    const command=(await tx.query<{action:'resume'|'pause'|'close';nonce:string;issued_at:number;signature:Hex}>('SELECT action,nonce,issued_at,signature FROM controls WHERE crew_id=$1 AND policy_hash=$2 ORDER BY created_at DESC,nonce DESC LIMIT 1',[crew.id,hash(crew.policy)])).rows[0];
    return command?.action==='resume'&&verifyMessage({address:crew.owner,message:controlMessage(crew.id,'resume',command.nonce,hash(crew.policy),command.issued_at),signature:command.signature});
  }
  /** Check the signed policy and venue limits before journaling and admitting a candidate trade. */
  async enter(crew:Crew){
    if(config.LIVE_TRADING_ENABLED!=='true')return;
    if(!await verifyPolicy(Policy.parse(crew.policy),crew.signature))throw Error('Signed trading policy is invalid or expired');
    if(!(await accessStatus(this.db,crew.owner)).eligible||await this.controls(crew))return;
    if(crew.broken_since)throw Error('Broken execution record blocks new entries');
    if(crew.policy.plan==='crew'&&crew.policy.markets.length>10)throw Error('Crew plan permits ten markets');
    if(crew.policy.plan==='pro'){
      const entitled=(await this.db.query<{id:string}>("SELECT id FROM crews WHERE owner=$1 AND policy->>'plan'='pro' ORDER BY created_at,id LIMIT 3",[crew.owner])).rows;
      if(!entitled.some(c=>c.id===crew.id))throw Error('This configuration supports up to three crews');
    }
    const agents=await info.extraAgents({user:crew.account}),key=await this.key(crew);
    if(!agents.some(a=>a.address.toLowerCase()===key.address.toLowerCase()&&(!a.validUntil||a.validUntil>Date.now())))throw Error('Trading agent has not been approved');
    const account=await accountState(crew.account),positions=await this.state(crew);
    if(Number(account.marginSummary.accountValue)>crew.policy.maxAccountValue)throw Error('Account value exceeds signed funding cap');
    if(account.assetPositions.filter(a=>+a.position.szi!==0).some(a=>!positions.some(p=>p.market===a.position.coin)))throw Error('Unmanaged position blocks new entries');
    if((await this.db.query("SELECT id FROM cards WHERE crew_id=$1 AND status='SENDING' LIMIT 1",[crew.id])).rows.length)return;
    const uncertain=await this.db.query('SELECT digest FROM slips WHERE crew_id=$1 AND ack IS NULL LIMIT 1',[crew.id]);if(uncertain.rows.length)throw Error('Unacknowledged order requires reconciliation');
    const rows=await this.db.query<{id:Hex;body:{card:Card;policyHash:Hex};verdict:{verdict:string};created_at:number;attestation:CardAttestation|null}>('SELECT * FROM cards WHERE crew_id=$1 AND status=$2 ORDER BY created_at LIMIT 1',[crew.id,'READY']);
    const row=rows.rows[0];if(!row)return;
    if(Date.now()-row.created_at>900000){await this.db.query("UPDATE cards SET status='EXPIRED' WHERE id=$1",[row.id]);return;}
    if(!this.entryTimes.has(row.id))this.entryTimes.set(row.id,Date.now()+randomInt(90001));
    if(Date.now()<this.entryTimes.get(row.id)!)return;
    const card=Card.parse(row.body.card);if(row.body.policyHash!==hash(crew.policy))throw Error('Card policy changed');
    if(row.id!==hash({crew:crew.id,body:row.body,now:row.created_at})||row.verdict.verdict!=='PASS')throw Error('Trade card integrity failed');
    // A database row alone is not authority to trade: the hosted signer only executes cards the worker signed.
    if(config.CARD_SIGNER_ADDRESS||!this.local){
      const signed=config.CARD_SIGNER_ADDRESS&&await verifyCard(config.CARD_SIGNER_ADDRESS as Hex,row.attestation,{id:row.id,crewId:crew.id,body:row.body,verdict:row.verdict,createdAt:row.created_at});
      if(!signed){await this.db.query("UPDATE cards SET status='REJECTED',reason='Card is not signed by the configured card signer' WHERE id=$1",[row.id]);await event(this.db,crew.id,'card_rejected','Unsigned or altered trade card refused');return;}
    }
    const duplicates=(await this.db.query<{n:string}>("SELECT count(*)::text n FROM slips WHERE crew_id=$1 AND body->>'kind'='ENTRY' AND body->'order'->>'market'=$2 AND (body->'order'->>'b')::boolean=$3 AND created_at>$4",[crew.id,card.market,card.side==='long',Date.now()-86400000])).rows[0];
    if(Number(duplicates.n)>=2){await this.db.query("UPDATE cards SET status='REJECTED',reason='Daily entry limit for this market and side' WHERE id=$1",[row.id]);return;}
    if(!(await markets()).some(m=>m.name===card.market))throw Error('Market is outside the current entry universe');
    if(positions.some(p=>p.market===card.market)){await this.db.query("UPDATE cards SET status='REJECTED',reason='Position already open' WHERE id=$1",[row.id]);return;}
    if(!await this.registered(crew))return;
    const sizingStartedAt=Date.now();const m=await snapshot(card.market),fees=await info.userFees({user:crew.account}),fills=await allFills(crew.account,weekStart());
    // Size against the worst accepted entry price, including the IOC slippage envelope.
    const riskMarket={...m,mark:m.mark*(card.side==='long'?1.005:.995)};
    // Funding paid this week is a realised cost like fees and closed losses, so it uses up the same budget.
    const realizedLoss=fills.reduce((s,f)=>s+Math.max(0,-Number(f.closedPnl))+Number(f.fee),0)+await fundingPaid(crew.account,weekStart());
    const others=await this.db.query<{body:{state:PositionState}}>('SELECT body FROM positions WHERE market=$1',[card.market]);
    let sizing;
    try{sizing=sizeTrade({policy:crew.policy,card,market:riskMarket,freeMargin:Number(account.withdrawable),realizedLoss,openRisk:positions.reduce((s,p)=>s+Math.max(0,(p.side==='long'?p.entry-p.stop:p.stop-p.entry)*p.size)+.002*p.size*p.entry,0),positions:positions.length,herdNotional:others.rows.reduce((s,p)=>s+p.body.state.size*m.mark,0),takerFee:Number(fees.userCrossRate),builderFee:config.BUILDER_ADDRESS?.0003:0});}
    catch(e){await this.db.query("UPDATE cards SET status='REJECTED',reason=$2 WHERE id=$1",[row.id,(e as Error).message]);return;}
    if(sizing.notional>25000){await this.db.query("UPDATE cards SET status='REJECTED',reason='Order exceeds the $25,000 per-entry execution limit' WHERE id=$1",[row.id]);return;}
    await this.db.query('INSERT INTO execution_steps VALUES($1,$2,$3,$4) ON CONFLICT(card_id,step) DO UPDATE SET started_at=excluded.started_at,finished_at=excluded.finished_at',[row.id,'sizer',sizingStartedAt,Date.now()]);
    this.entryTimes.delete(row.id);
    const claimed=await this.db.transaction(async tx=>{
      if(!await this.admission(tx,crew))return false;
      return (await tx.query("UPDATE cards SET status='SENDING',updated_at=$2 WHERE id=$1 AND status='READY' RETURNING id",[row.id,Date.now()])).rows.length===1;
    });
    if(!claimed)return;
    const leverageSlip=await this.journal(crew,'LEVERAGE',{asset:m.asset,leverage:sizing.leverage,isCross:false});
    await this.acknowledge(leverageSlip,await (await this.client(crew)).updateLeverage({asset:m.asset,leverage:sizing.leverage,isCross:false}));
    const buy=card.side==='long';
    const result=await this.send(crew,'ENTRY',[
      {a:m.asset,b:buy,p:formatPrice(m.mark*(buy?1.005:.995),m.szDecimals),s:formatSize(sizing.size,m.szDecimals),r:false,t:{limit:{tif:'Ioc'}}},
      this.trigger(m,sizing.size,!buy,sizing.tp,'tp'),this.trigger(m,sizing.size,!buy,sizing.stop,'sl'),
    ],'normalTpsl',row.id,{card:row.body,skeptic:row.verdict,sizer:{market:riskMarket,realizedLoss,freeMargin:Number(account.withdrawable),takerFee:Number(fees.userCrossRate),result:sizing}});
    const state=await accountState(crew.account),actual=state.assetPositions.find(a=>a.position.coin===m.market)?.position;
    if(!actual||+actual.szi===0){await this.db.query("UPDATE cards SET status='UNFILLED',updated_at=$2 WHERE id=$1",[row.id,Date.now()]);return;}
    const entryResult=result.response.response.data.statuses[0];
    const entryFills=await allFills(crew.account,result.slips[0].body.createdAt-1000);
    if(typeof entryResult!=='object'||!('filled' in entryResult)||!uninterruptedEntry(entryFills,m.market,entryResult.filled.oid,buy,Number(actual.szi),sizing.size)){
      throw Error('Live position differs from the acknowledged entry; reconciliation required');
    }
    const position:PositionState={market:m.market,side:card.side,entry:+actual.entryPx!,size:Math.abs(+actual.szi),stop:sizing.stop,tp:sizing.tp,extreme:m.mark,openedAt:Date.now(),horizonH:card.horizonH,entryDigest:result.slips[0].digest,lastModify:0,fundingStart:Math.max(0,-Number(actual.cumFunding.sinceOpen)),fundingPaid:0,risk:sizing.risk};
    await this.persist(crew,position);await this.db.query("UPDATE cards SET status='FILLED',updated_at=$2 WHERE id=$1",[row.id,Date.now()]);
    if(result.response.response.data.statuses.slice(1).some(s=>typeof s==='object'&&'error' in s)){await this.closePosition(crew,position,'Bracket rejected on entry');return;}
    // A partial IOC fill can cancel the grouped take-profit and stop with the unfilled remainder. Re-place them now
    // instead of waiting for the next loop, so the position is never left unprotected if the signer stops.
    if((await this.protect(crew,position,m)).restored===false)return;
    await event(this.db,crew.id,'entry',`${card.side.toUpperCase()} ${m.market} • ${position.size} at ${position.entry}`);
  }
  /** Run recovery, controls and position management per crew, then publish signer liveness. */
  async tick(){
    const crews=(await this.db.query<Crew>('SELECT * FROM crews ORDER BY created_at')).rows;
    for(const crew of crews){try{
      if(crew.id!==crew.policy.crewId||crew.account!==crew.policy.account||crew.owner!==crew.policy.owner||!await verifyPolicy(Policy.parse(crew.policy),crew.signature,Date.now(),true))throw Error('Crew identity or policy signature invalid');
      // Quote refresh or entry failures must never suppress management of existing positions.
      let recovered=true;
      try{await this.identity(crew);await this.recover(crew);}catch(e){recovered=false;await event(this.db,crew.id,'recovery_error',(e as Error).message);}
      let controlled=true;
      try{await this.controls(crew);}catch(e){controlled=false;await event(this.db,crew.id,'control_error',(e as Error).message);}
      await this.exits(crew);if(recovered&&controlled)await this.enter(crew);
    }catch(e){await event(this.db,crew.id,'signer_error',(e as Error).message);}}
    // RPC receipt confirmation may take minutes. It must never block the exit loop.
    if(!this.anchoring)this.anchoring=this.anchor().catch(async e=>{await event(this.db,null,'anchor_error',(e as Error).message).catch(()=>{});}).finally(()=>{this.anchoring=undefined;});
    await heartbeat(this.db,'signer',{mode:this.local?'local':'phala',hardwareAttested:!this.local,measurement:this.measurement,crews:crews.length,liveEnabled:config.LIVE_TRADING_ENABLED==='true'});
  }
  /** Post up to four pending hourly roots in order and persist their confirmed transaction hashes. */
  async anchor(){
    if(this.local||!config.ROOT_CONTRACT||config.LIVE_TRADING_ENABLED!=='true')return;
    const rpc=createPublicClient({transport:http(config.ELYSIUM_RPC)});if(await rpc.getChainId()!==CONTRACT_CHAIN_ID)throw Error('Root RPC is not Elysium');
    const abi=parseAbi(['function lastHour() view returns(uint64)','function lastRoot() view returns(bytes32)','function postSlipRoot(uint64,bytes32,uint32,bytes32)']);
    const contract=config.ROOT_CONTRACT as Hex;
    const last=Number(await rpc.readContract({address:contract,abi,functionName:'lastHour'}));
    const rows=await this.db.query<{hour:string}>('SELECT hour FROM roots WHERE hour>$1 ORDER BY hour LIMIT 4',[last]);
    const wallet=createWalletClient({account:this.slipKey,chain:contractChain,transport:http(config.ELYSIUM_RPC)});
    for(const row of rows.rows){const hour=Number(row.hour),slips=(await this.db.query<SignedSlip>('SELECT * FROM slips WHERE created_at >= $1 AND created_at < $2 ORDER BY seq',[hour*3600000,(hour+1)*3600000])).rows;
      for(const s of slips)if(s.signer.toLowerCase()!==this.slipKey.address.toLowerCase()||s.body.chainId!==CONTRACT_CHAIN_ID||s.body.rootContract?.toLowerCase()!==this.rootContract.toLowerCase()||!await verifySlip(s))throw Error('Cannot anchor invalid or foreign records');
      const root=merkleRoot(slips.map(s=>s.digest));const previous=await rpc.readContract({address:contract,abi,functionName:'lastRoot'});
      const tx=await wallet.writeContract({address:contract,abi,functionName:'postSlipRoot',args:[BigInt(hour),root,slips.length,previous]});
      const receipt=await rpc.waitForTransactionReceipt({hash:tx,confirmations:2});if(receipt.status!=='success')throw Error('Root anchoring reverted');
      await this.db.query("UPDATE roots SET root=$2,tx=$3,status='ANCHORED' WHERE hour=$1",[hour,root,tx]);
    }
  }
}
