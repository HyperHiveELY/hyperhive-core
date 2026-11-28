import {beforeAll,beforeEach,afterAll,afterEach,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {Database} from '../packages/core/db.js';
import {config} from '../packages/core/config.js';
import {createServer} from '../apps/api/server.js';
import {crew,wallet,market} from './fixtures.js';
import {Card,hash,controlMessage,policyMessage,weekStart,ZERO,type Crew,type PositionState} from '../packages/core/domain.js';
import {ownerTradeMessage,type OwnerTrade} from '../packages/core/owner-trade.js';
import {verifyCard} from '../packages/core/card-signing.js';
import {sizeTrade} from '../packages/core/risk.js';
import * as venue from '../packages/core/venue.js';
import * as settings from '../packages/core/integration-settings.js';
import {initialPaper,readPaper,savePaper,openPaper,totals,PAPER_FEE,PAPER_SLIPPAGE} from '../packages/paper/account.js';
import {executeOwnerPaperTrade} from '../packages/paper/owner-trades.js';
import {PaperEngine} from '../packages/paper/engine.js';
import {PAPER_REVIEW_VERSION} from '../packages/paper/strategies.js';
import {Signer} from '../apps/signer/engine.js';
import {LOCAL_ROOT,LOCAL_MEASUREMENT} from '../packages/core/local-identity.js';
import {verifyChain} from '../packages/core/proof.js';
vi.mock('@phala/dstack-sdk',()=>({DstackClient:class{}}));
const original={...config},cardKey=generatePrivateKey(),cardSigner=privateKeyToAccount(cardKey),other=privateKeyToAccount(generatePrivateKey());
let db:Database,app:Awaited<ReturnType<typeof createServer>>,c:Crew;
const card:Card={market:'BTC',side:'long',invalidationPx:59400,horizonH:24,why:'Placed by you'};
const quote=()=>({...market,timestamp:Date.now()});
const headers={origin:'http://localhost:5188'},cookies={hh_session:'trade-test-session'};
const get=(path:string)=>app.inject({url:'/api/crews/'+c.id+'/trades'+path,cookies});
const post=(payload:Record<string,unknown>)=>app.inject({method:'POST',url:'/api/crews/'+c.id+'/trades',headers,cookies,payload});
async function signed(changes:Partial<Omit<OwnerTrade,'signature'>>={},mode:'live'|'paper'='live',signer=wallet){const body={card,nonce:crypto.randomUUID(),issuedAt:Date.now(),...changes};return {...body,signature:await signer.signMessage({message:ownerTradeMessage(c.id,hash(c.policy),mode,body)})};}
async function paper(){await db.query('UPDATE crews SET paused=true');c.paused=true;const a={...initialPaper(),strategyVersion:PAPER_REVIEW_VERSION,running:true,nextScan:{trend:Date.now()+600000,crowding:Date.now()+600000,levels:Date.now()+600000}};await db.query('INSERT INTO paper_accounts VALUES($1,$2)',[c.id,JSON.stringify(a)]);return a;}
beforeAll(async()=>{db=await new Database('memory').init();app=await createServer(db);});
beforeEach(async()=>{
 Object.assign(config,{...original,NODE_ENV:'test',LIVE_TRADING_ENABLED:'true',SIGNER_MODE:'phala',CARD_SIGNING_KEY:cardKey,CARD_SIGNER_ADDRESS:cardSigner.address,BUILDER_ADDRESS:undefined});
 for(const table of ['owner_trade_nonces','paper_events','paper_accounts','cards','controls','positions','slips','identities','events','sessions','crews'])await db.query('DELETE FROM '+table);
 c=await crew();c.paused=false;
 await db.query('INSERT INTO crews(id,owner,account,policy,signature,paused,created_at) VALUES($1,$2,$3,$4,$5,false,$6)',[c.id,c.owner,c.account,JSON.stringify(c.policy),c.signature,c.created_at]);
 await db.query('INSERT INTO sessions VALUES($1,$2,$3)',[createHash('sha256').update(cookies.hh_session).digest('hex'),c.owner,Date.now()+60000]);
 const nonce=crypto.randomUUID(),issuedAt=Date.now();await db.query('INSERT INTO controls(nonce,crew_id,action,signature,created_at,policy_hash,issued_at) VALUES($1,$2,\'resume\',$3,$4,$5,$4)',[nonce,c.id,await wallet.signMessage({message:controlMessage(c.id,'resume',nonce,hash(c.policy),issuedAt)}),issuedAt,hash(c.policy)]);
 vi.spyOn(settings,'integrationSettings').mockResolvedValue({aiMarkupBps:2500,tokenThreshold:'10000',termsText:'',blockedCountries:[],eligibilityEnabled:false});
 vi.spyOn(venue,'snapshot').mockImplementation(async()=>quote());vi.spyOn(venue,'markets').mockResolvedValue([{name:'BTC'},{name:'ETH'}] as any);
 vi.spyOn(venue,'accountState').mockResolvedValue({marginSummary:{accountValue:'500'},withdrawable:'400',assetPositions:[]} as any);
 vi.spyOn(venue.info,'userFees').mockResolvedValue({userCrossRate:'0.00045'} as any);vi.spyOn(venue,'allFills').mockResolvedValue([]);vi.spyOn(venue,'fundingPaid').mockResolvedValue(0);
});
afterEach(()=>{vi.restoreAllMocks();Object.assign(config,original);});
afterAll(async()=>{await app.close();await db.close();});
it('requires an owner session and rejects another owner and foreign origins',async()=>{
 expect((await app.inject({url:'/api/crews/'+c.id+'/trades/preview?market=BTC&side=long'})).statusCode).toBe(401);
 await db.query('UPDATE sessions SET owner=$1',[other.address.toLowerCase()]);expect((await get('/preview?market=BTC&side=long')).statusCode).toBe(404);
 expect((await app.inject({method:'POST',url:'/api/crews/'+c.id+'/trades',cookies,headers:{origin:'https://invalid.example'},payload:await signed()})).statusCode).toBe(400);
});
it('creates a signer-compatible attested card, event and recoverable owner-only status',async()=>{
 const request=await signed(),r=await post(request);expect(r.statusCode).toBe(200);expect(r.json()).toMatchObject({status:'READY',mode:'live'});
 const row=(await db.query<any>('SELECT * FROM cards')).rows[0];expect(row.body).toMatchObject({card,source:'owner',mode:'live',policyHash:hash(c.policy)});expect(row.verdict).toEqual({verdict:'PASS',reasons:['Placed by the owner']});
 expect(row.id).toBe(hash({crew:c.id,body:row.body,now:row.created_at}));expect(await verifyCard(cardSigner.address,row.attestation,{id:row.id,crewId:c.id,body:row.body,verdict:row.verdict,createdAt:row.created_at})).toBe(true);
 expect((await db.query<any>('SELECT message FROM events')).rows[0].message).toBe('You placed BTC long');
 expect((await get('/'+row.id)).json()).toMatchObject({id:row.id,status:'READY',mode:'live'});expect((await get('/'+request.nonce)).json().id).toBe(row.id);
 await db.query('UPDATE sessions SET owner=$1',[other.address.toLowerCase()]);expect((await get('/'+row.id)).statusCode).toBe(404);
});
it('rejects replay even after the card finishes, and serializes simultaneous submissions',async()=>{
 const body=await signed();expect((await post(body)).statusCode).toBe(200);await db.query("UPDATE cards SET status='FILLED'");expect((await post(body)).statusCode).toBe(409);
 const requests=await Promise.all([signed(),signed()]),results=await Promise.all(requests.map(post));expect(results.map(r=>r.statusCode).sort()).toEqual([200,409]);expect((await db.query('SELECT id FROM cards')).rows).toHaveLength(2);
});
it('rejects wrong wallets, tampered fields, policy changes, mode changes and stale or future signatures',async()=>{
 for(const body of [await signed({},'live',other),{...await signed(),card:{...card,horizonH:72}},await signed({issuedAt:Date.now()-300001}),await signed({issuedAt:Date.now()+31000}),await signed({},'paper')])expect((await post(body)).statusCode).toBe(400);
 const body=await signed();c.policy={...c.policy,generation:1};c.signature=await wallet.signMessage({message:policyMessage(c.policy)});await db.query('UPDATE crews SET policy=$1,signature=$2',[JSON.stringify(c.policy),c.signature]);expect((await post(body)).statusCode).toBe(400);expect((await db.query('SELECT id FROM cards')).rows).toHaveLength(0);
});
it('validates market, stop side, horizon, reason length and default reason',async()=>{
 for(const change of [{market:'SOL'},{invalidationPx:60001},{invalidationPx:60000},{invalidationPx:0},{horizonH:3},{horizonH:73},{horizonH:4.5},{why:'x'.repeat(401)}])expect((await post(await signed({card:{...card,...change}}))).statusCode).toBe(400);
 const body=await signed();const {why,...withoutWhy}=body.card;expect((await post({...body,card:withoutWhy})).statusCode).toBe(200);expect((await db.query<any>('SELECT body FROM cards')).rows[0].body.card.why).toBe('Placed by you');
});
it('requires a started crew, current policy and fresh market data',async()=>{
 await db.query('UPDATE crews SET paused=true');expect((await post(await signed())).json().error).toMatch(/Start/);await db.query('UPDATE crews SET paused=false');
 await db.query("UPDATE controls SET action='pause'");expect((await post(await signed())).json().error).toMatch(/Start/);await db.query("UPDATE controls SET action='resume'");
 vi.mocked(venue.snapshot).mockResolvedValue({...quote(),timestamp:Date.now()-11000});expect((await post(await signed())).json().error).toMatch(/out of date/);
 vi.mocked(venue.snapshot).mockImplementation(async()=>quote());c.policy={...c.policy,expiresAt:Date.now()-1};c.signature=await wallet.signMessage({message:policyMessage(c.policy)});await db.query('UPDATE crews SET policy=$1,signature=$2',[JSON.stringify(c.policy),c.signature]);expect((await post(await signed())).json().error).toMatch(/Renew/);
});
it('blocks pending scout cards and refuses a missing or mismatched attestation key for live trades',async()=>{
 config.CARD_SIGNING_KEY=undefined;expect((await post(await signed())).json().error).toMatch(/switches on shortly/);config.CARD_SIGNING_KEY=generatePrivateKey();expect((await post(await signed())).json().error).toMatch(/switches on shortly/);config.CARD_SIGNING_KEY=cardKey;
 await db.query("INSERT INTO cards(id,crew_id,body,lens,evidence,verdict,status,created_at,updated_at) VALUES('pending',$1,'{}','trend','{}','{}','SENDING',$2,$2)",[c.id,Date.now()]);expect((await post(await signed())).statusCode).toBe(409);expect((await get('/preview?market=BTC&side=long')).json()).toMatchObject({ok:false,reason:'Wait for the current trade to finish'});
});
it('matches live sizing with signed positions, paid funding, losing fills, fees, herd exposure and adverse entry price',async()=>{
 const p:PositionState={market:'ETH',side:'short',entry:2000,stop:2020,tp:1940,size:.2,extreme:2000,openedAt:Date.now(),horizonH:24,entryDigest:ZERO,lastModify:0,fundingStart:0,fundingPaid:0,risk:4};
 await db.query('INSERT INTO identities VALUES($1,$2,$2,\'{}\',0,$3,$4)',[c.id,wallet.address.toLowerCase(),ZERO,Date.now()]);await db.query('INSERT INTO positions VALUES($1,$2,$3)',[c.id,'ETH',JSON.stringify({state:p,signature:await wallet.signMessage({message:{raw:hash(p)}})})]);
 await db.query('INSERT INTO positions VALUES($1,$2,$3)',['sample-crew','BTC',JSON.stringify({state:{...p,market:'BTC',size:.3}})]);
 vi.mocked(venue.allFills).mockResolvedValue([{closedPnl:'-10',fee:'1'},{closedPnl:'15',fee:'.5'}] as any);vi.mocked(venue.fundingPaid).mockResolvedValue(2);config.BUILDER_ADDRESS=other.address;
 const response=(await get('/preview?market=BTC&side=long&stop=59400')).json();expect(response.ok).toBe(true);
 expect(response.sizing).toEqual(sizeTrade({policy:c.policy,card,market:{...quote(),mark:60000*1.005},freeMargin:400,realizedLoss:13.5,openRisk:4.8,positions:1,herdNotional:18000,takerFee:.00045,builderFee:.0003}));
});
it('reports depleted budget, invalid position signatures, small margin and stale prices as readable preview failures',async()=>{
 vi.mocked(venue.fundingPaid).mockResolvedValue(100);expect((await get('/preview?market=BTC&side=long&stop=59400')).json()).toMatchObject({ok:false,reason:'Weekly risk budget is used up'});
 vi.mocked(venue.fundingPaid).mockResolvedValue(0);vi.mocked(venue.accountState).mockResolvedValue({marginSummary:{accountValue:'1'},withdrawable:'1',assetPositions:[]} as any);expect((await get('/preview?market=BTC&side=long')).json().reason).toMatch(/too small/);
 vi.mocked(venue.snapshot).mockResolvedValue({...quote(),timestamp:Date.now()-20000});expect((await get('/preview?market=BTC&side=long')).json().reason).toMatch(/out of date/);
 vi.mocked(venue.snapshot).mockImplementation(async()=>quote());await db.query('INSERT INTO positions VALUES($1,\'ETH\',$2)',[c.id,JSON.stringify({state:{market:'ETH'},signature:'0x'})]);expect((await get('/preview?market=BTC&side=long')).json().reason).toMatch(/signature/);
});
it('uses the paper engine fee, slippage, weekly rollover and free margin exactly',async()=>{
 const a=await paper();a.week=weekStart()-7*86400000;a.realizedLoss=100;await savePaper(db,c.id,a);
 const r=(await get('/preview?market=BTC&side=long&stop=59400')).json();expect(r).toMatchObject({ok:true,mode:'paper',suggestedStop:59640});
 expect(r.sizing).toEqual(sizeTrade({policy:c.policy,card,market:{...quote(),mark:60000*(1+PAPER_SLIPPAGE)},freeMargin:totals(a).available,realizedLoss:0,openRisk:0,positions:0,herdNotional:0,takerFee:PAPER_FEE,builderFee:PAPER_SLIPPAGE}));
 const fill=openPaper(a,c,card,quote(),ZERO);expect(fill.size).toBe(r.sizing.size);expect(fill.stop).toBe(r.sizing.stop);expect(fill.tp).toBe(r.sizing.tp);
});
it('executes queued owner cards through the paper worker without AI calls or live slips, once only',async()=>{
 await paper();const r=await post(await signed({},'paper'));expect(r.statusCode).toBe(200);
 const analyst=vi.fn(),engine=new PaperEngine(db,async()=>({...quote(),hourly:[]}),analyst);await engine.tick(c);await engine.drain();await engine.tick(c);await engine.drain();
 expect((await get('/'+r.json().id)).json().status).toBe('FILLED');expect((await readPaper(db,c.id))?.positions).toHaveLength(1);expect((await db.query("SELECT * FROM paper_events WHERE kind='entry'")).rows).toHaveLength(1);expect((await db.query('SELECT * FROM slips')).rows).toHaveLength(0);expect(analyst).not.toHaveBeenCalled();
});
it('rejects paper execution if paused or resumed after admission, or if the card was altered',async()=>{
 const a=await paper();const r=await post(await signed({},'paper'));a.revision++;await savePaper(db,c.id,a);await executeOwnerPaperTrade(db,c,async()=>quote());expect((await get('/'+r.json().id)).json().status).toBe('REJECTED');
 const next=await post(await signed({},'paper'));await db.query("UPDATE cards SET body=jsonb_set(body,'{card,horizonH}','72') WHERE id=$1",[next.json().id]);await executeOwnerPaperTrade(db,c,async()=>quote());expect((await get('/'+next.json().id)).json()).toMatchObject({status:'REJECTED',reason:'Trade signature is invalid'});expect((await readPaper(db,c.id))?.positions).toHaveLength(0);
});
it('runs an owner card through the unchanged live signer with a signed entry and both bracket orders',async()=>{
 const response=await post(await signed());expect(response.statusCode).toBe(200);const id=response.json().id;
 let filled=false;let orders:any[]=[];
 const fills:any[]=[];
 vi.mocked(venue.accountState).mockImplementation(async()=>({marginSummary:{accountValue:'500'},withdrawable:'400',assetPositions:filled?[{position:{coin:'BTC',szi:orders[0].s,entryPx:'60000',cumFunding:{sinceOpen:'0'}}}]:[]} as any));
 vi.mocked(venue.allFills).mockImplementation(async()=>fills);
 vi.spyOn(venue.info,'extraAgents').mockResolvedValue([{address:wallet.address}] as any);vi.spyOn(venue.info,'meta').mockResolvedValue({universe:[{name:'BTC'}]} as any);vi.spyOn(venue.info,'frontendOpenOrders').mockResolvedValue([{coin:'BTC',reduceOnly:true,orderType:'Stop Market'},{coin:'BTC',reduceOnly:true,orderType:'Take Profit Market'}] as any);
 const exchange={updateLeverage:vi.fn(async()=>({status:'ok'})),order:vi.fn(async(args:any)=>{orders=args.orders;filled=true;fills.push({oid:1,tid:1,coin:'BTC',time:Date.now(),startPosition:'0',side:'B',sz:orders[0].s,closedPnl:'0',fee:'.01'});return {status:'ok',response:{type:'order',data:{statuses:[{filled:{oid:1,totalSz:orders[0].s,avgPx:'60000'}},{resting:{oid:2}},{resting:{oid:3}}]}}};})};
 const signer=new Signer(db);Object.assign(signer,{slipKey:wallet,measurement:LOCAL_MEASUREMENT,rootContract:LOCAL_ROOT,local:true});vi.spyOn(signer as any,'key').mockResolvedValue(wallet);vi.spyOn(signer as any,'client').mockResolvedValue(exchange);(signer as any).entryTimes.set(id,0);await signer.enter(c);
 expect((await get('/'+id)).json().status).toBe('FILLED');expect(exchange.order).toHaveBeenCalledOnce();expect(orders.map(o=>o.r)).toEqual([false,true,true]);expect(orders.slice(1).map(o=>o.t.trigger.tpsl)).toEqual(['tp','sl']);expect(exchange.order.mock.calls[0][0].grouping).toBe('normalTpsl');
 const slips=(await db.query<any>('SELECT * FROM slips ORDER BY seq')).rows;expect(slips.map(s=>s.body.kind)).toEqual(['CONTROL','LEVERAGE','ENTRY','TP','SL']);expect(await verifyChain(slips)).toBe(true);
});
