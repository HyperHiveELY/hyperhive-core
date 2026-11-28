import {Database,reserveScanCall,settleScanCall} from '../core/db.js';
import {config} from '../core/config.js';
import {Decision,type Snapshot} from '../core/domain.js';
import {SCOUT,SKEPTIC,Scout,meteredInference} from './inference.js';

export interface ScanResult {
 market:string;mark:number;side:'long'|'short'|null;invalidationPx:number|null;distancePct:number|null;horizonH:number|null;
 why:string;skeptic:{verdict:'PASS'|'KILL';reasons:string[]};scannedAt:number;
}
const publicCopy='Use plain words for a newcomer. Do not name people, companies or products. Do not promise returns. Explain price moves without trading jargon.';
const unsuitable=/\b(?:apy|apr|yield|earn|learn|passive income|guaranteed|partner|protected|insured|covered|receipt|mandate|guard|thesis)\b/i;
const plain=(text:string,fallback:string)=>unsuitable.test(text)?fallback:text;
/** Read one public market with the same analysts and model limits as crew inference. */
export async function scanMarket(db:Database,market:Snapshot):Promise<ScanResult>{
 if(config.SCAN_ENABLED!=='true')throw Error('Scans unavailable');
 if(!Number.isFinite(market.mark)||market.mark<=0||!Number.isFinite(market.atr)||market.atr<=0||Date.now()-market.timestamp>30000||market.timestamp>Date.now()+5000)throw Error('Fresh market data unavailable');
 const {scout,skeptic,call}=await meteredInference({
  reserve:(model,ceiling)=>reserveScanCall(db,model,ceiling,config.SCAN_DAILY_BUDGET_USD),
  settle:(id,cost,status)=>settleScanCall(db,id,cost,status),
 },12000);
 const suggestion=await call(scout,SCOUT+' '+publicCopy,{lens:'One clear trade, or no trade right now',markets:[market]},Scout);
 const card=Scout.parse(suggestion.value).card;
 if(card&&card.market!==market.market)throw Error('Scout selected an unauthorized market');
 const criticism=await call(skeptic,SKEPTIC+' '+publicCopy+' If card is null, return KILL and explain why there is no trade to check.',{card,market},Decision);
 let verdict=Decision.parse(criticism.value);
 if(!card)verdict={verdict:'KILL',reasons:verdict.reasons.length?verdict.reasons:['No clear trade to check.']};
 else if((card.side==='long'?market.mark-card.invalidationPx:card.invalidationPx-market.mark)<.8*market.atr){
  verdict={verdict:'KILL',reasons:['The exit price is too close or on the wrong side of the current price.']};
 }
 if(!verdict.reasons.length)verdict={verdict:'KILL',reasons:['The review did not give a clear reason to proceed.']};
 const accepted=card&&verdict.verdict==='PASS';
 return {
  market:market.market,mark:market.mark,side:accepted?card.side:null,
  invalidationPx:accepted?card.invalidationPx:null,distancePct:accepted?Math.abs(market.mark-card.invalidationPx)/market.mark*100:null,horizonH:accepted?card.horizonH:null,
  why:accepted?plain(card.why,'The Scouts see a possible price move. Review the exit price before deciding.'):
   card?'The Skeptic rejected this trade. There is no trade to act on right now.':'The Scouts did not find a clear trade in the current market.',
  skeptic:{verdict:verdict.verdict,reasons:verdict.reasons.map(reason=>plain(reason,'The review needs clearer evidence.'))},scannedAt:market.timestamp,
 };
}
