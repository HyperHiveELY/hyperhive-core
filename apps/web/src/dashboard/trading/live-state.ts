import type {Market} from './catalog.js';
import type {Crew} from '../../../../../packages/core/domain.js';

/** Account responses must belong to the selected bot before they can drive controls. */
export function selectedDetail(detail:any,selected:string){return selected&&detail?.crew?.id===selected?detail:null;}
export function botControl(detail:any):{label:string;action:'start'|'pause'|'setup';status:string}{
 if(!detail)return {label:'View setup',action:'setup',status:'Checking account'};
 if(!detail.crew.paused)return {label:'Pause bot',action:'pause',status:detail.readiness?.ready===true?'Running':'Checks need attention'};
 if(detail.readiness?.ready!==true)return {label:'Finish setup',action:'setup',status:'Setup needed · paused'};
 return {label:'Start bot',action:'start',status:'Paused · ready'};
}
export function marketRelationship(market:Market|undefined,crew:Crew|undefined,entryMarkets:{name:string}[],available:boolean){
 const matches=!!crew&&market?.kind==='Perps'&&crew.policy.markets.includes(market.coin);
 if(!market)return {matches,title:'Checking market availability…',note:'Browsing does not change signed bot policies.'};
 if(!crew)return {matches,title:market.kind==='Perps'?'Explore Hyperliquid markets':'Browse-only market',note:market.kind==='Perps'?'Select or create a bot to see its signed markets.':'This bot engine supports native perpetuals.'};
 const title=matches?'In '+crew.policy.name+'’s signed markets':'Not in '+crew.policy.name+'’s signed markets';
 const note=market.kind!=='Perps'?'Browse only. This bot engine supports native perpetuals.':market.delisted?'Delisted market. New entries are unavailable.':!available?'Bot market eligibility is unavailable. Refresh the connection before trading.':!entryMarkets.some(m=>m.name===market.coin)?'Outside the current bot entry universe. Browsing remains available.':matches?'Policy allows this market. Entries still require all risk checks.':'Viewing this chart does not change the bot’s signed policy.';
 return {matches,title,note};
}
