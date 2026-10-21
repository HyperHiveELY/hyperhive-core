import type {Sql} from '../../packages/core/db.js';
import {type Crew,type PositionState,weekStart} from '../../packages/core/domain.js';
import type {BotSummary,DashboardData,FeedItem,Period} from '../../packages/core/dashboard-view.js';
import {accountState,info,allFills} from '../../packages/core/venue.js';
const cache=new Map<string,{at:number;value:Promise<{state:Awaited<ReturnType<typeof accountState>>;portfolio:Awaited<ReturnType<typeof info.portfolio>>;fills:Awaited<ReturnType<typeof allFills>>}>}>();
async function exchangeData(account:Crew['account']){
 const previous=cache.get(account);if(previous&&Date.now()-previous.at<30000)return previous.value;
 const value=Promise.all([accountState(account),info.portfolio({user:account}),allFills(account,weekStart())]).then(([state,portfolio,fills])=>({state,portfolio,fills}));
 cache.set(account,{at:Date.now(),value});if(cache.size>200)cache.delete(cache.keys().next().value!);
 try{return await value;}catch(e){cache.delete(account);throw e;}
}
/** Combine persisted crew records with batched venue snapshots for this owner's dashboard. */
export async function dashboard(db:Sql,owner:string,load=exchangeData):Promise<DashboardData>{
 const crews=(await db.query<Crew>('SELECT * FROM crews WHERE owner=$1 ORDER BY created_at',[owner])).rows;
 const bots:BotSummary[]=[],activity:FeedItem[]=[];
 // Bound concurrent venue calls, even for owners with many accounts.
 for(let offset=0;offset<crews.length;offset+=3){
  const batch=await Promise.all(crews.slice(offset,offset+3).map(async crew=>{
   const [identities,positions,cards,events]=await Promise.all([
    db.query('SELECT crew_id FROM identities WHERE crew_id=$1',[crew.id]),
    db.query<{body:{state:PositionState}}>('SELECT body FROM positions WHERE crew_id=$1',[crew.id]),
    db.query<any>('SELECT * FROM cards WHERE crew_id=$1 ORDER BY created_at DESC LIMIT 8',[crew.id]),
    db.query<any>('SELECT * FROM events WHERE crew_id=$1 ORDER BY created_at DESC LIMIT 8',[crew.id]),
   ]);
   activity.push(...cards.rows.map(c=>({id:`card-${c.id}`,crewId:crew.id,botName:crew.policy.name,kind:'idea' as const,title:`${c.body.card.market} ${c.body.card.side} · ${c.status.toLowerCase()}`,message:c.body.card.why,reason:[c.reason,...(c.verdict.reasons??[])].filter(Boolean).join(' · '),time:Number(c.created_at),status:c.status})),...events.rows.map(e=>({id:`event-${e.id}`,crewId:crew.id,botName:crew.policy.name,kind:'event' as const,title:e.kind.replaceAll('_',' '),message:e.message,reason:'Recorded by the execution service.',time:Number(e.created_at)})));
   const bot:BotSummary={crew,identityReady:!!identities.rows.length,equity:null,available:null,pnl:null,exposure:null,positionCount:null,riskUsed:null,error:null,histories:{}};
   try{
    const {state,portfolio,fills}=await load(crew.account);
    bot.equity=Number(state.marginSummary.accountValue);bot.available=Number(state.withdrawable);
    const open=state.assetPositions.filter(x=>Number(x.position.szi)!==0);
    bot.positions=open.map(({position:p})=>({market:p.coin,size:Number(p.szi),entry:Number(p.entryPx),pnl:Number(p.unrealizedPnl)}));
    bot.positionCount=open.length;bot.exposure=open.reduce((s,x)=>s+Math.abs(Number(x.position.positionValue)),0);
    const pnl=portfolio.find(([p])=>p==='perpAllTime')?.[1].pnlHistory.at(-1);
    bot.pnl=pnl?Number(pnl[1]):null;
    for(const [period,data] of portfolio)if(period.startsWith('perp'))bot.histories[period as Period]=data.accountValueHistory.map(([t,v])=>[t,Number(v)]);
    const managed=positions.rows.map(p=>p.body.state);
    // Unknown positions make the risk estimate incomplete; do not show zero risk.
    bot.riskUsed=open.some(x=>!managed.some(p=>p.market===x.position.coin))?null:
     fills.reduce((s,f)=>s+Math.max(0,-Number(f.closedPnl))+Number(f.fee),0)+managed.filter(p=>open.some(x=>x.position.coin===p.market)).reduce((s,p)=>s+Math.max(0,(p.side==='long'?p.entry-p.stop:p.stop-p.entry)*p.size)+.002*p.size*p.entry,0);
   }catch{bot.error='Exchange data unavailable. Try refreshing shortly.';}
   return bot;
  }));bots.push(...batch);
 }
 return {bots,activity:activity.sort((a,b)=>b.time-a.time).slice(0,60),updatedAt:Date.now()};
}
