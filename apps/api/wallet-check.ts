import type {FastifyInstance,FastifyRequest} from 'fastify';
import {Address} from '../../packages/core/domain.js';
import {createWalletCheckCache} from '../../packages/core/wallet-check.js';

/** Preserve standard request metadata while omitting wallet addresses, including shared page URLs. */
export function walletCheckRequestLog(req:FastifyRequest){
  const url=/^\/check\/?(?:\?|$)/.test(req.url)?'/check':/^\/api\/wallet-check(?:\/|\?|$)/.test(req.url)?'/api/wallet-check/:address':req.url;
  const version=req.headers?.['accept-version'];
  return {method:req.method,url,version:Array.isArray(version)?version.join(','):version,host:req.host,remoteAddress:req.ip,remotePort:req.socket?.remotePort};
}

/** Public, read-only lookup. Keep the global limiter and apply a separate hourly client budget. */
export function registerWalletCheck(app:FastifyInstance){
  const cache=createWalletCheckCache(),limit=app.createRateLimit({max:30,timeWindow:'1 hour'});
  app.addHook('onClose',async()=>cache.close());
  app.get<{Params:{address:string}}>('/api/wallet-check/:address',{
    // URLs contain wallet addresses; this route must not persist them in request logs.
    logLevel:'silent',
    preHandler:async(req,reply)=>{
      const result=await limit(req);
      if(!result.isAllowed&&result.isExceeded)return reply.header('Retry-After',result.ttlInSeconds).code(429).send({error:'Too many checks. Please try again in an hour.'});
    },
  },async(req,reply)=>{
    reply.header('Cache-Control','no-store');
    const address=Address.safeParse(req.params.address);
    if(!address.success)return reply.code(400).send({error:'Enter a wallet address starting with 0x followed by 40 letters or numbers.'});
    try{return await cache.get(address.data);}
    catch{return reply.code(502).send({error:'We could not read the complete wallet data from Hyperliquid. Please try again.'});}
  });
}
