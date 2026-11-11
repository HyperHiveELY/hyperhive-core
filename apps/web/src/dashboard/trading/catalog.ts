/** Read-only discovery catalog. Never used as a trading authorization universe. */
export type Market={id:string;coin:string;symbol:string;label:string;kind:'Perps'|'Spot'|'HIP-3';venue:string;fullName:string;price:number|null;change:number|null;volume:number|null;funding:number|null;interest:number|null;delisted:boolean;eligible:boolean;maxLeverage:number|null;oracle:number|null;baseVolume:number|null;circulatingSupply:number|null;totalSupply:number|null;tokenId:string|null;tokenIndex:number|null;evmContract:string|null;quote:string};
export const numeric=(v:unknown):number|null=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
export function normalizeMarkets(payload:any,kind:Market['kind'],venue='Hyperliquid'):Market[]{
 if(!Array.isArray(payload)||!Array.isArray(payload[0]?.universe)||!Array.isArray(payload[1]))throw Error('Invalid market catalog response');
 const [meta,contexts]=payload;
 const tokens=new Map<number,any>((meta.tokens??[]).map((t:any)=>[t.index,t]));
 const spotContexts=new Map(contexts.map((c:any)=>[c.coin,c]));
 return meta.universe.map((m:any,i:number)=>{
  const c=kind==='Spot'?(spotContexts.get(m.name)??{}):(contexts[i]??{});
  const base=kind==='Spot'?tokens.get(m.tokens?.[0]):null,quote=kind==='Spot'?tokens.get(m.tokens?.[1]):null;
  const symbol=kind==='Spot'?(base?.name??m.name):m.name.split(':').at(-1);
  const price=numeric(c.markPx),previous=numeric(c.prevDayPx),oi=numeric(c.openInterest);
  return {id:kind+':'+m.name,coin:m.name,symbol,label:kind==='Spot'?symbol+'/'+(quote?.name??'?'):symbol,kind,venue,
   fullName:base?.fullName??'',price,change:price!=null&&previous!=null&&previous>0?(price/previous-1)*100:null,
   volume:numeric(c.dayNtlVlm),funding:numeric(c.funding),interest:oi!=null&&price!=null?oi*price:null,
   delisted:!!m.isDelisted,eligible:false,maxLeverage:numeric(m.maxLeverage),oracle:numeric(c.oraclePx),baseVolume:numeric(c.dayBaseVlm),circulatingSupply:numeric(c.circulatingSupply),totalSupply:numeric(c.totalSupply),tokenId:base?.tokenId??null,tokenIndex:base?.index??null,evmContract:base?.evmContract?.address??null,quote:quote?.name??'USD'};
 });
}
export function eligibleNativeMarkets(markets:Market[]){
 // Mirrors the current entry universe for explanation only. Signer remains authoritative.
 const eligible=new Set(markets.filter(m=>m.kind==='Perps'&&!m.delisted&&m.price!=null&&m.price>0).sort((a,b)=>(b.volume??0)-(a.volume??0)).slice(0,30).map(m=>m.id));
 return markets.map(m=>({...m,eligible:eligible.has(m.id)}));
}
export async function publicInfo(body:object,signal:AbortSignal){
 const response=await fetch('https://api.hyperliquid.xyz/info',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
 if(!response.ok)throw Error('Market data request failed ('+response.status+')');
 return response.json();
}
export async function loadCatalog(signal:AbortSignal){
 const results=await Promise.allSettled([publicInfo({type:'metaAndAssetCtxs'},signal),publicInfo({type:'spotMetaAndAssetCtxs'},signal),publicInfo({type:'perpDexs'},signal)]);
 let rows:Market[]=[];const missing:string[]=[];
 for(const [i,kind] of (['Perps','Spot'] as const).entries()){
  const result=results[i];if(result.status==='fulfilled'){try{rows.push(...normalizeMarkets(result.value,kind));}catch{missing.push(kind);}}else missing.push(kind);
 }
 const dexResult=results[2];
 if(dexResult.status==='fulfilled'&&Array.isArray(dexResult.value)){
  const dexs=dexResult.value.filter((d:any)=>d&&typeof d.name==='string');
  // Limit request concurrency; all venues are discovered, not hard-coded.
  for(let i=0;i<dexs.length;i+=3){
   const batch=dexs.slice(i,i+3),responses=await Promise.allSettled(batch.map((d:any)=>publicInfo({type:'metaAndAssetCtxs',dex:d.name},signal)));
   responses.forEach((r,j)=>{if(r.status==='fulfilled'){try{rows.push(...normalizeMarkets(r.value,'HIP-3',batch[j].name));}catch{missing.push(batch[j].name);}}else missing.push(batch[j].name);});
  }
 }else missing.push('HIP-3 venues');
 if(signal.aborted)throw new DOMException('Aborted','AbortError');
 return {markets:eligibleNativeMarkets(rows),missing,at:Date.now()};
}

export function matchesMarket(m:Market,query:string){
 const q=query.trim().toLowerCase();
 return [m.symbol,m.label,m.coin,m.fullName,...(m.kind==='HIP-3'?[m.venue]:[])].some(t=>t.toLowerCase().includes(q));
}
