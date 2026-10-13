import type {Crew} from './domain.js';
export type Period='perpDay'|'perpWeek'|'perpMonth'|'perpAllTime';
export type Point=[number,number];
export interface BotSummary {
 crew:Crew; identityReady:boolean; equity:number|null; available:number|null; pnl:number|null;
 exposure:number|null; positionCount:number|null; riskUsed:number|null; error:string|null;
 positions?:{market:string;size:number;entry:number;pnl:number}[];
 histories:Partial<Record<Period,Point[]>>;
}
export interface FeedItem {id:string;crewId:string;botName:string;kind:'idea'|'event';title:string;message:string;reason:string;time:number;status?:string}
export interface DashboardData {bots:BotSummary[];activity:FeedItem[];updatedAt:number}
// Only sum a period for which every account has observations. Never backfill an unknown balance.
/** Build a portfolio history for a selected time range from individual crew observations. */
export function combinedHistory(bots:BotSummary[],period:Period):Point[]{
 if(!bots.length)return [];
 const series=bots.map(b=>(b.histories[period]??[]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])).sort((a,b)=>a[0]-b[0]));
 if(series.some(s=>s.length<2))return [];
 const start=Math.max(...series.map(s=>s[0][0])),end=Math.min(...series.map(s=>s.at(-1)![0]));
 if(end<=start)return [];
 const times=[...new Set([start,end,...series.flatMap(s=>s.map(p=>p[0]).filter(t=>t>=start&&t<=end))])].sort((a,b)=>a-b);
 const indices=series.map(()=>0);
 return times.map(t=>[t,series.reduce((total,s,i)=>{while(indices[i]+1<s.length&&s[indices[i]+1][0]<=t)indices[i]++;return total+s[indices[i]][1];},0)]);
}
/** Sum the available dashboard values for one metric while preserving missing-data semantics. */
export function total(bots:BotSummary[],key:'equity'|'available'|'pnl'|'exposure'|'positionCount'|'riskUsed'):number|null{
 return bots.some(b=>b[key]===null)?null:bots.reduce((sum,b)=>sum+(b[key]??0),0);
}
