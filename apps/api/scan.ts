import type {FastifyInstance,FastifyRequest,FastifyReply} from 'fastify';
import {z} from 'zod';
import {Database} from '../../packages/core/db.js';
import {config} from '../../packages/core/config.js';
import {markets,snapshot} from '../../packages/core/venue.js';
import {scanMarket,type ScanResult} from '../../packages/ai/scan.js';

const busy=()=>Object.assign(Error('Scans are busy, try again soon'),{statusCode:503});
const input=z.strictObject({market:z.string().trim().min(1).max(15)});
/** Cache completed reads for ten minutes and share in-flight work within the API process. */
export function createScanner(db:Database){
 const cache=new Map<string,{expiresAt:number;result:ScanResult}>(),pending=new Map<string,Promise<ScanResult>>();
 return async(market:string)=>{
  if(config.SCAN_ENABLED!=='true')throw busy();
  const hit=cache.get(market);if(hit&&hit.expiresAt>Date.now())return {...hit.result,cached:true};
  let work=pending.get(market);const shared=Boolean(work);
  if(!work){
   work=(async()=>{
    try{
     const result=await scanMarket(db,await snapshot(market));
     // Keep storage bounded even if the venue's top thirty changes over time.
     for(const [coin,entry] of cache)if(entry.expiresAt<=Date.now())cache.delete(coin);
     if(cache.size>=30)cache.delete(cache.keys().next().value!);
     cache.set(market,{expiresAt:Date.now()+600000,result});return result;
    }catch{throw busy();}
   })();
   pending.set(market,work);
  }
  try{return {...await work,cached:shared};}finally{if(pending.get(market)===work)pending.delete(market);}
 };
}
/** Register public scanner endpoints behind both global and route-specific request limits. */
export function registerScan(app:FastifyInstance,db:Database){
 const scan=createScanner(db);
 const limit=(max:number,timeWindow:string)=>{
  const check=app.createRateLimit({max,timeWindow});
  return async(req:FastifyRequest,reply:FastifyReply)=>{
   const result=await check(req);
   if(!result.isAllowed&&result.isExceeded)return reply.header('Retry-After',result.ttlInSeconds).code(429).send({error:'Too many requests. Try again soon.'});
  };
 };
 app.get('/api/scan/markets',{preHandler:limit(60,'1 minute')},async()=>{
  try{return {markets:(await markets()).map(m=>m.name)};}catch{throw busy();}
 });
 app.post('/api/scan',{preHandler:limit(10,'1 hour')},async(req,reply)=>{
  const parsed=input.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'Choose a coin from the list.'});
  let supported;try{supported=await markets();}catch{throw busy();}
  const market=supported.find(m=>m.name.toUpperCase()===parsed.data.market.toUpperCase())?.name;
  if(!market)return reply.code(400).send({error:'Choose a coin from the supported list.'});
  return scan(market);
 });
}
