import {uiText} from "../i18n/language.js";
import React,{useEffect,useRef,useState} from 'react';
import type {Crew} from '../../../../packages/core/domain.js';
import {hash} from '../../../../packages/core/domain.js';
import {ownerTradeMessage,type OwnerTrade,type TradeMode} from '../../../../packages/core/owner-trade.js';
import type {Sizing} from '../../../../packages/core/risk.js';
import {connect} from '../wallet.js';
import type {Api} from './ResearchPages.js';
import './trade-builder.css';

export type TradeIntent={market?:string;side?:'long'|'short';stop?:string;horizonH?:number;crewId?:string};
const INTENT_KEY='hyperhive-trade-intent';
/** Keep scanner intent through wallet setup and crew creation in this browser tab. */
export function readTradeIntent():TradeIntent|null{
 const query=new URLSearchParams(location.search),market=query.get('trade');
 if(market&&/^[A-Za-z0-9]{1,15}$/.test(market))return {market,side:query.get('side')==='short'?'short':'long',...(Number(query.get('stop'))>0?{stop:query.get('stop')!}:{})};
 try{const saved=JSON.parse(sessionStorage.getItem(INTENT_KEY)??'null');if(saved&&typeof saved==='object'&&!Array.isArray(saved))return saved;}catch{}return null;
}
export function saveTradeIntent(intent:TradeIntent|null){try{if(intent)sessionStorage.setItem(INTENT_KEY,JSON.stringify(intent));else sessionStorage.removeItem(INTENT_KEY);}catch{}}
type Preview={ok:boolean;reason?:string;mode:TradeMode;mark:number;atr:number;suggestedStop:number;checkedAt:number;policyHash:string;sizing?:Sizing};
type Status={id:string;status:string;reason?:string|null;mode?:TradeMode};
type Props={api:Api;owner:string;crews:Crew[];selected:string;intent:TradeIntent;onClose:()=>void;onWallet:(intent:TradeIntent)=>void;onCreate:(intent:TradeIntent)=>void;onSetup:(intent:TradeIntent)=>void;onCrew:(id:string)=>void};
const dollars=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:n<1?6:2}).format(n);
const labels:Record<string,string>={READY:'Pending',SENDING:'Sent',FILLED:'Filled',UNFILLED:'Not filled',REJECTED:'Rejected',EXPIRED:'Expired',KILLED:'Rejected'};
export function TradeBuilder(p:Props){
 const initial=p.crews.find(c=>c.id===p.intent.crewId)??p.crews.find(c=>c.id===p.selected&&(!p.intent.market||c.policy.markets.includes(p.intent.market)))??p.crews.find(c=>p.intent.market&&c.policy.markets.includes(p.intent.market))??p.crews[0];
 const [crewId,setCrewId]=useState(initial?.id??''),[market,setMarket]=useState(p.intent.market??initial?.policy.markets[0]??''),[side,setSide]=useState<'long'|'short'>(p.intent.side??'long'),[stop,setStop]=useState(p.intent.stop??''),[horizon,setHorizon]=useState(p.intent.horizonH??24),[preview,setPreview]=useState<Preview|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState<Status|null>(null),[retry,setRetry]=useState(0);
 const dialog=useRef<HTMLDialogElement>(null),request=useRef<{crewId:string;body:OwnerTrade}|null>(null),crew=p.crews.find(c=>c.id===crewId);
 const intent=():TradeIntent=>({crewId,market,side,stop,horizonH:horizon});
 useEffect(()=>{if(!crew&&initial){setCrewId(initial.id);if(!market)setMarket(initial.policy.markets[0]);}},[crew,initial,market]);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();const url=new URL(location.href);for(const key of ['trade','side','stop'])url.searchParams.delete(key);history.replaceState(history.state,'',url.pathname+url.search+url.hash);return()=>previous?.focus();},[]);
 useEffect(()=>{saveTradeIntent({crewId,market,side,stop,horizonH:horizon});},[crewId,market,side,stop,horizon]);
 useEffect(()=>{
  setPreview(null);setError('');if(!p.owner||!crew||!crew.policy.markets.includes(market)||sent)return;
  if(stop!==''&&(!Number.isFinite(Number(stop))||Number(stop)<=0)){setError('Enter a price above zero');return;}
  let cancelled=false;setLoading(true);
  const update=async()=>{try{
   const result:Preview=await p.api(`/crews/${crew.id}/trades/preview?${new URLSearchParams({market,side,...(stop?{stop}:{})})}`);
   if(cancelled)return;setPreview(result);setError('');if(!stop&&Number.isFinite(result.suggestedStop)&&result.suggestedStop>0)setStop(String(Number(result.suggestedStop.toPrecision(8))));
  }catch(e){if(!cancelled){setPreview(null);setError((e as Error).message);}}finally{if(!cancelled)setLoading(false);}};
  const timer=setTimeout(update,250),interval=setInterval(update,6000);return()=>{cancelled=true;clearTimeout(timer);clearInterval(interval);};
 },[p.api,p.owner,crew,market,side,stop,sent?.id,retry]);
 useEffect(()=>{
  if(!sent||!['READY','SENDING'].includes(sent.status))return;let cancelled=false;
  const update=async()=>{try{const result:Status=await p.api(`/crews/${crewId}/trades/${sent.id}`);if(!cancelled){setSent(current=>({...current,...result}));setError('');}}catch(e){if(!cancelled)setError('Status is unavailable. '+(e as Error).message);}};
  const timer=setInterval(update,4000);return()=>{cancelled=true;clearInterval(timer);};
 },[p.api,crewId,sent?.id,sent?.status]);
 const change=()=>{request.current=null;setPreview(null);setError('');};
 async function checkStatus(){if(!request.current)return;try{const result:Status=await p.api(`/crews/${request.current.crewId}/trades/${request.current.body.nonce}`);setSent(result);saveTradeIntent(null);setError('');}catch(e){setError((e as Error).message);}}
 async function place(){
  if(!crew||!preview?.ok||!preview.sizing||busy)return;
  setBusy(true);setError('');
  try{
   if(hash(crew.policy)!==preview.policyHash)throw Error('Crew settings changed. Refresh the trade');
   if(Date.now()-preview.checkedAt>10000)throw Error('Prices are out of date. Wait for a fresh preview');
   const {address,client}=await connect();if(address.toLowerCase()!==p.owner.toLowerCase())throw Error('Connect the wallet that owns this crew');
   if(!request.current){
    const body={card:{market,side,invalidationPx:Number(stop),horizonH:horizon,why:'Placed by you'},nonce:crypto.randomUUID(),issuedAt:Date.now()};
    const signature=await client.signMessage({message:ownerTradeMessage(crew.id,hash(crew.policy),preview.mode,body)});
    request.current={crewId:crew.id,body:{...body,signature}};
   }
   const result:Status=await p.api(`/crews/${request.current.crewId}/trades`,request.current.body);setSent(result);saveTradeIntent(null);
  }catch(e){
   if(request.current){try{const result:Status=await p.api(`/crews/${request.current.crewId}/trades/${request.current.body.nonce}`);setSent(result);saveTradeIntent(null);return;}catch{}}
   setError((e as Error).message);
  }finally{setBusy(false);}
 }
 const valid=!!crew&&crew.policy.markets.includes(market),s=preview?.sizing;
 return <dialog ref={dialog} className="trade-builder" aria-labelledby="trade-builder-title" onCancel={e=>{e.preventDefault();if(!busy)p.onClose();}}>
  <div className="trade-builder-head"><span>{preview?preview.mode==='paper'?uiText("Paper trade"):uiText("Live trade"):uiText("New trade")}</span><button type="button" aria-label={uiText("Close trade builder")} disabled={busy} onClick={p.onClose}>×</button></div>
  <h2 id="trade-builder-title">{sent?`${market} ${side}`:uiText("New trade")}</h2>
  <p className="trade-builder-intro">{sent?uiText("Sent to your crew. Stop and take-profit go on with the entry."):uiText("Choose a direction. Your crew sizes the trade within your limits.")}</p>
  {!p.owner?<div className="trade-builder-empty"><p>{uiText("Connect or unlock your wallet to choose a crew. Your trade idea stays here.")}</p><button className="primary" onClick={()=>p.onWallet(intent())}>{uiText("Connect wallet")}</button></div>:!p.crews.length?<div className="trade-builder-empty"><p>{uiText("Create a crew first. Your trade idea will be ready when you return.")}</p><button className="primary" onClick={()=>p.onCreate(intent())}>{uiText("Create crew")}</button></div>:sent?<>
   <div className="trade-builder-status" role="status"><b>{labels[sent.status]??uiText(sent.status)}</b><span>{uiText(sent.reason)??(sent.status==='READY'?uiText("Your crew is checking the trade. Keep this sheet open for updates."):sent.status==='SENDING'?uiText("Waiting for the entry to be confirmed."):sent.status==='FILLED'?sent.mode==='paper'?uiText("Recorded with virtual funds."):uiText("Your entry has filled."):sent.status==='UNFILLED'?uiText("The entry did not fill. No new position was opened."):uiText("Check your crew’s activity for details."))}</span></div>
   <p className="trade-builder-disclaimer">{uiText("Not financial advice")}{sent.mode==='paper'?uiText(" · Virtual funds only"):''}</p>
   {error&&<p role="alert" className="negative">{uiText(error)}</p>}
   <button className="primary trade-builder-submit" onClick={()=>{p.onClose();p.onCrew(crewId);}}>{uiText("View crew")}</button>
  </>:<form onSubmit={e=>{e.preventDefault();void place();}}>
   <fieldset disabled={busy}>
    {p.crews.length>1?<label>{uiText("Crew")}<select value={crewId} onChange={e=>{change();setCrewId(e.target.value);const next=p.crews.find(c=>c.id===e.target.value);if(next&&!next.policy.markets.includes(market)){setMarket(next.policy.markets[0]);setStop('');}}}>{p.crews.map(c=><option key={c.id} value={c.id}>{c.policy.name}</option>)}</select></label>:<p className="trade-builder-crew">{crew?.policy.name}</p>}
    <label>{uiText("Market")}<select value={valid?market:''} onChange={e=>{change();setMarket(e.target.value);setStop('');}}>{!valid&&<option value="">{uiText("Choose a market")}</option>}{crew?.policy.markets.map(m=><option key={m}>{m}</option>)}</select></label>
    {!valid&&<p role="status">{market?("" + String(market) + uiText(" is outside this crew’s markets. Choose another crew or market.")):uiText("Choose a market to continue.")}</p>}
    <div className="trade-builder-sides" role="group" aria-label={uiText("Trade direction")}>{(['long','short'] as const).map(value=><button key={value} type="button" aria-pressed={side===value} onClick={()=>{change();setSide(value);setStop('');}}>{value==='long'?uiText("↗ Long"):uiText("↘ Short")}</button>)}</div>
    <label>{uiText("Where is this idea wrong?")}<div className="trade-builder-price"><span>$</span><input aria-label={uiText("Where is this idea wrong? Price")} type="number" inputMode="decimal" step="any" min="0.00000001" required value={stop} onChange={e=>{change();setStop(e.target.value);}} placeholder={uiText("Fetching price…")}/></div><small>{preview?(uiText("Current price ") + String(dollars(preview.mark)) + uiText(". Your crew may move the stop farther away to allow for price swings.")):uiText("The suggested stop uses recent price swings.")}</small></label>
    <label>{uiText("How many hours?")}<input type="number" min="4" max="72" step="1" required value={horizon} onChange={e=>{request.current=null;setHorizon(Number(e.target.value));}}/></label>
    <div className="trade-builder-horizons" role="group" aria-label={uiText("Time horizon")}>{[4,24,72].map(hours=><button type="button" key={hours} aria-pressed={horizon===hours} onClick={()=>{request.current=null;setHorizon(hours);}}>{hours}{uiText("h")}</button>)}</div>
   </fieldset>
   <div className="trade-builder-preview" aria-live="polite" aria-busy={loading}>
    {loading?<p>{uiText("Checking size and prices…")}</p>:error?<p role="alert" className="negative">{uiText(error)}</p>:preview&&!preview.ok?<p>{uiText(preview.reason)}</p>:s?<><div><span>{uiText("Size")}</span><b>{dollars(s.notional)}</b><span>{uiText("Leverage")}</span><b>{s.leverage}{uiText("x")}</b><span>{uiText("Stop")}</span><b>{dollars(s.stop)}</b><span>{uiText("Take-profit")}</span><b>{dollars(s.tp)}</b></div><p>{uiText("Most you can lose ≈ ")}<strong>{dollars(s.risk)}</strong></p><small>{uiText("Estimate at the stop, including fees. Gaps and slippage can increase losses. Size updates again when your crew places the trade.")}</small></>:<p>{uiText("Choose a market to see your trade size.")}</p>}
   </div>
   <p className="trade-builder-disclaimer">{uiText("Not financial advice")}{preview?.mode==='paper'?uiText(" · Virtual funds only"):''}</p>
   {preview&&!preview.ok&&<button className="trade-builder-wallet" type="button" disabled={busy} onClick={()=>p.onSetup(intent())}>{uiText("Open crew setup · keep this idea")}</button>}
   <button className="primary trade-builder-submit" disabled={busy||loading||!valid||!preview?.ok||!s||!stop||horizon<4||horizon>72||!Number.isInteger(horizon)}>{busy?uiText("Waiting for wallet or network…"):uiText("Place trade")}</button>
   {error&&<button className="trade-builder-retry" type="button" disabled={busy} onClick={()=>{setRetry(n=>n+1);}}>{uiText("Refresh preview")}</button>}
   {request.current&&<button className="trade-builder-retry" type="button" disabled={busy} onClick={()=>void checkStatus()}>{uiText("Check trade status")}</button>}
   <button className="trade-builder-wallet" type="button" disabled={busy} onClick={()=>p.onWallet(intent())}>{uiText("Connect or unlock wallet")}</button>
  </form>}
 </dialog>;
}
