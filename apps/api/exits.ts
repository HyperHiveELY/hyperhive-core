import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Hex} from 'viem';
import {z} from 'zod';
import type {Database} from '../../packages/core/db.js';
import {accountState,info,snapshot} from '../../packages/core/venue.js';
import {exitKind,planExit,type ExitPlan,type ExitPosition} from '../../packages/core/auto-exits.js';
const coin=z.string().regex(/^[A-Za-z0-9]{1,15}$/);
const query=z.strictObject({coins:z.string().max(400).default('all').refine(s=>s==='all'||s.split(',').length<=30&&s.split(',').every(c=>coin.safeParse(c).success),'Choose all or a comma-separated list of coins')});
/** Read only the authenticated owner's account; never accept an account override. */
export async function loadExitPlan(owner:Hex,coins:string):Promise<ExitPlan>{
 const [state,orders,[meta,contexts]]=await Promise.all([accountState(owner),info.frontendOpenOrders({user:owner}),info.metaAndAssetCtxs()]);
 const selected=coins==='all'?null:new Set(coins.toUpperCase().split(','));
 const positions=state.assetPositions.map(p=>p.position).filter(p=>Number(p.szi)!==0&&(!selected||selected.has(p.coin.toUpperCase())));
 const rows:ExitPosition[]=[];
 for(let i=0;i<positions.length;i+=3)rows.push(...await Promise.all(positions.slice(i,i+3).map(async p=>{
  try{const market=await snapshot(p.coin),asset=meta.universe.findIndex(m=>m.name===p.coin);if(asset<0)throw Error('Market unavailable');return planExit(p,orders,{...market,asset,szDecimals:meta.universe[asset].szDecimals,mark:Number(contexts[asset].markPx)});}
  catch{return planExit(p,orders);}
 })));
 return {owner,checkedAt:Date.now(),positions:rows};
}
export function registerExits(app:FastifyInstance,db:Database,owner:(req:FastifyRequest)=>Promise<Hex>){
 // Keep the global 120/minute limiter as well as the tighter per-owner read budget.
 app.get('/api/exits/plan',async req=>{
  const who=await owner(req),{coins}=query.parse(req.query);
  await planLimit(who);
  try{return await loadExitPlan(who,coins);}catch{throw Object.assign(Error('Hyperliquid positions could not be loaded. Try again.'),{statusCode:502});}
 });
 app.post('/api/exits/placed',async req=>{
  const who=await owner(req),{orders}=z.strictObject({orders:z.array(z.strictObject({coin,oid:z.number().int().positive().safe(),cloid:z.string().regex(/^0x[\da-f]{32}$/)})).min(1).max(60)}).parse(req.body);
  const open=await info.frontendOpenOrders({user:who});
  for(const item of orders){if(!open.some(o=>o.oid===item.oid&&o.coin===item.coin&&o.cloid===item.cloid&&exitKind(o)))throw Error('An exit is no longer open on this wallet. Refresh positions.');}
  for(const item of orders)await db.query('INSERT INTO auto_exit_events(owner,oid,coin,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(owner,oid) DO NOTHING',[who,item.oid,item.coin,Date.now()]);
  return {ok:true};
 });
}
const reads=new Map<string,{at:number;count:number}>();
async function planLimit(owner:string){
 const now=Date.now();let bucket=reads.get(owner);
 if(!bucket||now-bucket.at>=60000){bucket={at:now,count:0};reads.set(owner,bucket);}
 if(++bucket.count>20)throw Object.assign(Error('Please wait a minute before refreshing positions.'),{statusCode:429});
 if(reads.size>5000)for(const [key,value] of reads)if(now-value.at>=60000)reads.delete(key);
}
