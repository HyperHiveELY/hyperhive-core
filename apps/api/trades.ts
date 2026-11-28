import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {verifyMessage,type Hex} from 'viem';
import {Database,event,type Sql} from '../../packages/core/db.js';
import {config} from '../../packages/core/config.js';
import {Card,Policy,hash,verifyPolicy,controlMessage,weekStart,type Crew,type Snapshot,type PositionState} from '../../packages/core/domain.js';
import {OwnerTrade,verifyOwnerTrade,tradeReason,type TradeMode} from '../../packages/core/owner-trade.js';
import {signCard,verifyCard} from '../../packages/core/card-signing.js';
import {sizeTrade} from '../../packages/core/risk.js';
import {snapshot,markets,accountState,info,allFills,fundingPaid} from '../../packages/core/venue.js';
import {readPaper,totals,PAPER_FEE,PAPER_SLIPPAGE,type PaperAccount} from '../../packages/paper/account.js';
import {requireAccess} from '../../packages/core/access.js';

const conflict=(message:string)=>Object.assign(Error(message),{statusCode:409});
async function active(db:Sql,c:Crew,paper:PaperAccount|null){
 if(c.owner!==c.policy.owner||c.account!==c.policy.account||c.id!==c.policy.crewId||c.policy.origin!==config.PUBLIC_ORIGIN||!await verifyPolicy(Policy.parse(c.policy),c.signature))throw Error('Renew this crew’s trading policy before placing a trade');
 if(c.broken_since)throw Error('Resolve this crew’s execution record before placing a trade');
 if(paper){if(config.NODE_ENV==='production')throw Error('Paper trading is available in the local workspace only');if(!c.paused||!paper.running||paper.closeRequested)throw Error('Start this paper crew before placing a trade');return;}
 if(config.LIVE_TRADING_ENABLED!=='true')throw Error('Live trading is not enabled');
 if(c.paused)throw Error('Start this crew before placing a trade');
 const command=(await db.query<{action:string;nonce:string;issued_at:number;signature:Hex}>('SELECT action,nonce,issued_at,signature FROM controls WHERE crew_id=$1 AND policy_hash=$2 ORDER BY created_at DESC,nonce DESC LIMIT 1',[c.id,hash(c.policy)])).rows[0];
 if(command?.action!=='resume'||!await verifyMessage({address:c.owner,message:controlMessage(c.id,'resume',command.nonce,hash(c.policy),command.issued_at),signature:command.signature}))throw Error('Start this crew before placing a trade');
}
async function pending(db:Sql,id:string){
 if((await db.query("SELECT id FROM cards WHERE crew_id=$1 AND status IN ('READY','SENDING','PENDING') LIMIT 1",[id])).rows.length)throw conflict('Wait for the current trade to finish');
}
function fresh(card:Card,m:Snapshot){
 if(m.market!==card.market||!Number.isFinite(m.mark)||m.mark<=0||!Number.isFinite(m.atr)||m.atr<=0||!Number.isFinite(m.timestamp)||Date.now()-m.timestamp>10000||m.timestamp>Date.now()+1000)throw Error('Market data is stale');
 if(card.side==='long'?card.invalidationPx>=m.mark:card.invalidationPx<=m.mark)throw Error('Invalidation is on the wrong side');
}
/** Mirror the execution engines' sizing inputs, including adverse entry prices and weekly costs. */
export async function previewTrade(db:Sql,c:Crew,card:Card,m:Snapshot,paper:PaperAccount|null){
 fresh(card,m);
 if(paper){
  if(paper.positions.some(p=>p.market===card.market))throw Error('A paper position is already open in this market');
  const recent=(await db.query<{n:string}>("SELECT count(*)::text n FROM paper_events WHERE crew_id=$1 AND kind='entry' AND body->>'market'=$2 AND body->>'side'=$3 AND created_at>$4",[c.id,card.market,card.side,Date.now()-86400000])).rows[0];
  if(Number(recent.n)>=2)throw Error('Daily entry limit for this market and side');
  return sizeTrade({policy:c.policy,card,market:{...m,mark:m.mark*(card.side==='long'?1+PAPER_SLIPPAGE:1-PAPER_SLIPPAGE)},freeMargin:totals(paper).available,realizedLoss:paper.week===weekStart()?paper.realizedLoss:0,openRisk:paper.positions.reduce((n,p)=>n+p.risk,0),positions:paper.positions.length,herdNotional:0,takerFee:PAPER_FEE,builderFee:PAPER_SLIPPAGE});
 }
 await requireAccess(db,c.owner);
 const [account,fees,fills,funding,states,others,identity]=await Promise.all([accountState(c.account),info.userFees({user:c.account}),allFills(c.account,weekStart()),fundingPaid(c.account,weekStart()),db.query<{body:{state:PositionState;signature:Hex}}>('SELECT body FROM positions WHERE crew_id=$1',[c.id]),db.query<{body:{state:PositionState}}>('SELECT body FROM positions WHERE market=$1',[card.market]),db.query<{signer:Hex}>('SELECT signer FROM identities WHERE crew_id=$1',[c.id])]);
 for(const row of states.rows)if(!identity.rows[0]||!await verifyMessage({address:identity.rows[0].signer,message:{raw:hash(row.body.state)},signature:row.body.signature}))throw Error('Position state signature failed');
 const positions=states.rows.map(p=>p.body.state);
 if(Number(account.marginSummary.accountValue)>c.policy.maxAccountValue)throw Error('Account value exceeds signed funding cap');
 if(account.assetPositions.some(a=>+a.position.szi!==0&&!positions.some(p=>p.market===a.position.coin)))throw Error('An existing position needs to be reconciled first');
 if(positions.some(p=>p.market===card.market))throw Error('A position is already open in this market');
 if((await db.query('SELECT digest FROM slips WHERE crew_id=$1 AND ack IS NULL LIMIT 1',[c.id])).rows.length)throw Error('Wait for the previous order to be confirmed');
 const recent=(await db.query<{n:string}>("SELECT count(*)::text n FROM slips WHERE crew_id=$1 AND body->>'kind'='ENTRY' AND body->'order'->>'market'=$2 AND (body->'order'->>'b')::boolean=$3 AND created_at>$4",[c.id,card.market,card.side==='long',Date.now()-86400000])).rows[0];
 if(Number(recent.n)>=2)throw Error('Daily entry limit for this market and side');
 const sizing=sizeTrade({policy:c.policy,card,market:{...m,mark:m.mark*(card.side==='long'?1.005:.995)},freeMargin:Number(account.withdrawable),realizedLoss:fills.reduce((n,f)=>n+Math.max(0,-Number(f.closedPnl))+Number(f.fee),0)+funding,openRisk:positions.reduce((n,p)=>n+Math.max(0,(p.side==='long'?p.entry-p.stop:p.stop-p.entry)*p.size)+.002*p.size*p.entry,0),positions:positions.length,herdNotional:others.rows.reduce((n,p)=>n+p.body.state.size*m.mark,0),takerFee:Number(fees.userCrossRate),builderFee:config.BUILDER_ADDRESS?.0003:0});
 if(sizing.notional>25000)throw Error('Order exceeds the $25,000 per-entry execution limit');return sizing;
}
/** Register session-owned trade admission, sizing and status reads under the global API rate limit. */
export function registerTrades(app:FastifyInstance,db:Database,owned:(req:FastifyRequest,id:string)=>Promise<Crew>){
 app.get<{Params:{id:string}}>('/api/crews/:id/trades/preview',async req=>{
  const c=await owned(req,req.params.id),q=z.strictObject({market:Policy.shape.markets.element,side:Card.shape.side,stop:z.coerce.number().positive().optional()}).parse(req.query),paper=await readPaper(db,c.id),mode:TradeMode=paper?'paper':'live';
  if(!c.policy.markets.includes(q.market))throw Error('Choose a market in this crew’s policy');
  const m=await snapshot(q.market),suggestedStop=m.mark+(q.side==='long'?-1:1)*1.2*m.atr;
  const card=Card.parse({market:q.market,side:q.side,invalidationPx:q.stop??suggestedStop,horizonH:24,why:'Placed by you'});
  const context={mode,mark:m.mark,atr:m.atr,suggestedStop,checkedAt:m.timestamp,policyHash:hash(c.policy)};
  try{await active(db,c,paper);if(!paper&&(config.CARD_SIGNER_ADDRESS||config.SIGNER_MODE==='phala')&&(!config.CARD_SIGNER_ADDRESS||!config.CARD_SIGNING_KEY))throw Error('Trade signing is not configured on this server');await pending(db,c.id);if(!(await markets()).some(m=>m.name===q.market))throw Error('This market is currently unavailable');return {...context,ok:true,sizing:await previewTrade(db,c,card,m,paper)};}
  catch(error){return {...context,ok:false,reason:tradeReason(error)};}
 });
 app.post<{Params:{id:string}}>('/api/crews/:id/trades',async req=>{
  const c=await owned(req,req.params.id),request=OwnerTrade.parse(req.body);
  try{return await db.transaction(async tx=>{
   const current=(await tx.query<Crew>('SELECT * FROM crews WHERE id=$1 FOR UPDATE',[c.id])).rows[0];
   if(!current||hash(current.policy)!==hash(c.policy))throw conflict('Crew settings changed. Refresh the trade');
   const paper=await readPaper(tx,c.id),mode:TradeMode=paper?'paper':'live';
   if(Date.now()-request.issuedAt>300000||request.issuedAt-Date.now()>30000||!await verifyOwnerTrade(current,mode,request))throw Error('Trade signature invalid or expired');
   if((await tx.query('SELECT nonce FROM owner_trade_nonces WHERE nonce=$1',[request.nonce])).rows.length)throw conflict('This trade request has already been used');
   await active(tx,current,paper);await pending(tx,c.id);
   if(!current.policy.markets.includes(request.card.market))throw Error('Choose a market in this crew’s policy');
   if(!(await markets()).some(m=>m.name===request.card.market))throw Error('This market is currently unavailable');
   const m=await snapshot(request.card.market);await previewTrade(tx,current,request.card,m,paper);fresh(request.card,m);
   const now=Date.now(),body={card:request.card,source:'owner',mode,policyHash:hash(current.policy),inputsHash:hash(m),authorization:{nonce:request.nonce,issuedAt:request.issuedAt,signature:request.signature},...(paper?{paperRevision:paper.revision}:{})},verdict={verdict:'PASS',reasons:['Placed by the owner']},id=hash({crew:c.id,body,now});
   const attestation=config.CARD_SIGNING_KEY?await signCard(config.CARD_SIGNING_KEY as Hex,{id,crewId:c.id,body,verdict,createdAt:now}):null;
   if(!paper&&(config.CARD_SIGNER_ADDRESS||config.SIGNER_MODE==='phala')&&(!config.CARD_SIGNER_ADDRESS||!await verifyCard(config.CARD_SIGNER_ADDRESS as Hex,attestation,{id,crewId:c.id,body,verdict,createdAt:now})))throw Error('Trade signing is not configured on this server');
   await tx.query('INSERT INTO owner_trade_nonces(nonce,crew_id,card_id,created_at) VALUES($1,$2,$3,$4)',[request.nonce,c.id,id,now]);
   await tx.query("INSERT INTO cards(id,crew_id,body,lens,evidence,verdict,status,reason,created_at,updated_at,attestation) VALUES($1,$2,$3,'owner',$4,$5,'READY',NULL,$6,$6,$7)",[id,c.id,JSON.stringify(body),JSON.stringify({market:m}),JSON.stringify(verdict),now,attestation&&JSON.stringify(attestation)]);
   await event(tx,c.id,'owner_trade',`You placed ${request.card.market} ${request.card.side}`);return {id,status:'READY',mode};
  });}catch(error){if(error instanceof Error)error.message=tradeReason(error);throw error;}
 });
 app.get<{Params:{id:string;tradeId:string}}>('/api/crews/:id/trades/:tradeId',async req=>{
  const c=await owned(req,req.params.id),row=(await db.query<{id:string;status:string;reason:string|null;mode:TradeMode}>("SELECT id,status,reason,body->>'mode' AS mode FROM cards WHERE (id=$1 OR id=(SELECT card_id FROM owner_trade_nonces WHERE nonce=$1 AND crew_id=$2)) AND crew_id=$2 AND body->>'source'='owner'",[z.union([z.string().regex(/^0x[0-9a-f]{64}$/),z.string().uuid()]).parse(req.params.tradeId),c.id])).rows[0];
  if(!row)throw Object.assign(Error('Trade not found'),{statusCode:404});return {...row,reason:row.reason?tradeReason(row.reason):null};
 });
}
