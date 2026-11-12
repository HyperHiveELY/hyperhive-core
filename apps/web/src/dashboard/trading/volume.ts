import type {Market} from './catalog.js';
export type VolumePeriod='1h'|'6h'|'24h'|'72h';
export type VolumeCandle={t:number;v:string;c:string};
export function periodVolume(m:Market,candles:VolumeCandle[],period:VolumePeriod,now=Date.now()){
 if(period==='24h')return {quote:m.volume,base:m.baseVolume,estimated:false,complete:true,observations:0,description:'Rolling 24 hours · reported by Hyperliquid'};
 const count=parseInt(period),hour=3600000,start=Math.floor(now/hour)*hour-(count-1)*hour;
 const unique=new Map<number,VolumeCandle>();
 for(const c of candles)if(Number.isFinite(c.t)&&c.t>=start&&c.t<=now&&Number.isFinite(+c.v)&&+c.v>=0&&Number.isFinite(+c.c)&&+c.c>0)unique.set(c.t,c);
 const rows=[...unique.values()];
 return {quote:rows.length?rows.reduce((sum,c)=>sum+(+c.v)*(+c.c),0):null,base:rows.length?rows.reduce((sum,c)=>sum+(+c.v),0):null,estimated:true,complete:rows.length===count,observations:rows.length,description:count===1?'Current hourly candle · still in progress':count+' hourly candles · current hour in progress'};
}
