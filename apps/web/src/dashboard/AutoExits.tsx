import {uiText} from "../i18n/language.js";
import React,{useEffect,useRef,useState} from 'react';
import type {Hex} from 'viem';
import {formatPrice} from '@nktkas/hyperliquid/utils';
import {exitLoss,validateExitPrices,type ExitPlan,type ExitPosition} from '../../../../packages/core/auto-exits.js';
import {disconnectExitAgent,exitAgentStatus,lockExitAgent,placeAutoExits,removeAutoExits,trackedExitCount,type ExitEdit} from '../auto-exits-wallet.js';
import {Crosshair,RefreshCw,Wallet,Check} from '../ui/ProductIcons.js';
import './auto-exits.css';
type Props={owner:string;coins:string;api:(path:string,body?:unknown)=>Promise<any>;onWallet:()=>void;onBusy:(busy:boolean)=>void;onActivity:()=>void};
const money=(value:number|null)=>value===null||!Number.isFinite(value)?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:value<1?6:2}).format(value);
const price=(value:number|null)=>value===null?'—':new Intl.NumberFormat('en-US',{maximumFractionDigits:6}).format(value);
const missing=(p:ExitPosition)=>!p.existing.sl.length||!p.existing.tp.length;
export function AutoExits({owner,coins,api,onWallet,onBusy,onActivity}:Props){
 const [plan,setPlan]=useState<ExitPlan|null>(null),[filter,setFilter]=useState(coins),[drafts,setDrafts]=useState<Record<string,{stop:string;tp:string}>>({}),[editing,setEditing]=useState<string[]>([]);
 const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[password,setPassword]=useState(''),[tick,setTick]=useState(0);
 const [access,setAccess]=useState<ReturnType<typeof exitAgentStatus>>({saved:false,expired:false,unlocked:false,expiresAt:undefined}),[tracked,setTracked]=useState(0);
 const generation=useRef(0),active=useRef(owner),working=useRef(false);active.current=owner;
 const current=()=>active.current===owner&&!!owner;
 function readAccess(){if(owner){setAccess(exitAgentStatus(owner));setTracked(trackedExitCount(owner));}}
 async function refresh(){
  const version=++generation.current;setLoading(true);
  try{
   const next:ExitPlan=await api('/exits/plan?coins=all');
   if(version!==generation.current||!current())return null;
   if(next.owner.toLowerCase()!==owner.toLowerCase())throw Error('Wallet session changed. Connect again.');
   setPlan(next);setDrafts(Object.fromEntries(next.positions.map(p=>[p.coin,{stop:String(p.stopPrice??''),tp:String(p.tpPrice??'')}])));setEditing([]);readAccess();return next;
  }finally{if(version===generation.current)setLoading(false);}
 }
 useEffect(()=>{setFilter(coins);},[coins]);
 useEffect(()=>{
  active.current=owner;setPlan(null);setPassword('');setError('');setNotice('');setAccess({saved:false,expired:false,unlocked:false,expiresAt:undefined});setTracked(0);
  if(owner)refresh().catch(e=>{if(current())setError(e.message);});
  const hide=()=>lockExitAgent();window.addEventListener('pagehide',hide);
  return()=>{active.current='';generation.current++;lockExitAgent();window.removeEventListener('pagehide',hide);};
 },[owner]);
 useEffect(()=>{const timer=setInterval(()=>setTick(v=>v+1),5000);return()=>clearInterval(timer);},[]);
 const positions=(plan?.positions??[]).filter(p=>filter==='all'||filter.split(',').includes(p.coin.toUpperCase()));
 const edits:ExitEdit[]=positions.filter(p=>missing(p)&&!p.error).map(p=>({coin:p.coin,position:p,stop:p.existing.sl.length?null:Number(drafts[p.coin]?.stop),tp:p.existing.tp.length?null:Number(drafts[p.coin]?.tp)}));
 let invalid='';for(const edit of edits){try{validateExitPrices(edit.position,edit.stop,edit.tp);}catch(e){invalid=`${edit.coin}: ${(e as Error).message}`;break;}}
 const needsPassword=!access.unlocked||access.expired,stale=!!plan&&Date.now()-plan.checkedAt>60000;
 async function act(kind:'add'|'remove'){
  if(working.current)return;working.current=true;setBusy(true);onBusy(true);setError('');setNotice('');
  try{
   if(kind==='add'){
    if(!edits.length||invalid||stale)throw Error(invalid||'Refresh and review prices before adding exits.');
    const result=await placeAutoExits(owner as Hex,password,edits,current);
    if(!current())return;
    let activityIssue='';
    if(result.orders.length){try{await api('/exits/placed',{orders:result.orders});onActivity();}catch{activityIssue='Orders were submitted. The Activity update could not be saved.';}}
    const next=await refresh();if(!current())return;
    if(result.issues.length)setError(result.issues.join(' '));
    else if(next&&edits.every(e=>{const p=next.positions.find(p=>p.coin===e.coin);return p&&!missing(p);}))setNotice('Stops and take-profits are now on Hyperliquid');
    else setError('Some exits need a fresh status check. Refresh before retrying.');
    if(activityIssue)setError(previous=>[previous,activityIssue].filter(Boolean).join(' '));
   }else{
    await removeAutoExits(owner as Hex,password,current);if(!current())return;
    await refresh();setNotice('Auto exits removed. Other orders were left in place.');
   }
  }catch(e){if(current())setError((e as Error).message.slice(0,600));}
  finally{working.current=false;onBusy(false);if(current()){setBusy(false);setPassword('');try{readAccess();}catch(e){setError((e as Error).message);}}}
 }
 function change(coin:string,field:'stop'|'tp',value:string){setNotice('');setDrafts(d=>({...d,[coin]:{...d[coin],[field]:value}}));}
 function normalize(p:ExitPosition,field:'stop'|'tp'){const value=Number(drafts[p.coin]?.[field]);if(Number.isFinite(value)&&value>0&&p.szDecimals!==null)try{change(p.coin,field,formatPrice(value,p.szDecimals));}catch{}}
 return <div className="auto-exits" data-refresh-tick={tick}>
  <div className="page-heading"><div><span className="exits-eyebrow"><Crosshair size={15}/>{uiText("Auto exits · Your wallet")}</span><h1>{uiText("Never hold a position without a stop")}</h1><p className="muted">{uiText("Review your prices, then add stops and take-profits to your open positions.")}</p></div></div>
  <p className="exits-explainer">{uiText("Orders stay on Hyperliquid and can trigger even when HyperHive is offline. Come back to add exits to new positions. ")}<span>{uiText("Not financial advice.")}</span></p>
  {!owner?<section className="panel exits-empty"><Wallet size={30}/><h2>{uiText("Connect your trading wallet")}</h2><p>{uiText("Use the wallet where you opened your Hyperliquid positions.")}</p><button className="primary" onClick={onWallet}>{uiText("Connect wallet")}</button></section>:<>
   <div className="exits-toolbar"><label>{uiText("Positions")}<select aria-label={uiText("Filter positions")} value={filter} disabled={busy} onChange={e=>{setFilter(e.target.value);setNotice('');}}><option value="all">{uiText("All positions")}</option>{filter!=='all'&&!plan?.positions.some(p=>p.coin.toUpperCase()===filter)&&<option value={filter}>{filter}</option>}{plan?.positions.map(p=><option key={p.coin} value={p.coin.toUpperCase()}>{p.coin}</option>)}</select></label><button disabled={busy||loading} onClick={()=>{setError('');setNotice('');refresh().catch(e=>setError(e.message));}}><RefreshCw size={15}/>{uiText("Refresh")}</button></div>
   {error&&<div className="exits-message exits-error" role="alert">{uiText(error)}</div>}
   {notice&&<div className="exits-message exits-success" role="status"><Check size={19}/>{uiText(notice)}</div>}
   {loading&&!plan&&<section className="panel exits-empty" role="status">{uiText("Loading your Hyperliquid positions…")}</section>}
   {!loading&&plan&&!positions.length&&<section className="panel exits-empty"><Crosshair size={30}/><h2>{plan.positions.length?uiText("No open positions match this selection."):uiText("No open positions on this wallet.")}</h2><p>{uiText("Open a position on Hyperliquid, then come back here to add exits.")}</p>{filter!=='all'&&<button onClick={()=>setFilter('all')}>{uiText("Show all positions")}</button>}</section>}
   <div className="exits-list" aria-busy={busy||loading}>{positions.map(p=>{
    const edit=editing.includes(p.coin),stop=p.existing.sl[0]?.price??Number(drafts[p.coin]?.stop),loss=Number.isFinite(stop)&&stop>0?exitLoss(p.entry,stop,p.size,p.side):null;
    return <article className="panel exit-position" key={p.coin}>
     <header><div><h2>{p.coin} <span>{p.side==='long'?uiText("Long"):uiText("Short")}</span></h2><p>{p.size} {p.coin}{uiText(" · Entry $")}{price(p.entry)}{uiText(" · Now $")}{price(p.mark)}</p></div><span className={'exit-status '+(!missing(p)?'is-set':'')}>{!missing(p)?uiText("Already set"):p.existing.sl.length?uiText("Take-profit missing"):p.existing.tp.length?uiText("Stop missing"):uiText("Needs exits")}</span></header>
     <div className="exit-levels">{(['stop','tp'] as const).map(field=>{
      const found=p.existing[field==='stop'?'sl':'tp'],label=field==='stop'?'Stop-loss':'Take-profit';
      return <div key={field}><label htmlFor={`exit-${p.coin}-${field}`}>{uiText(label)}{!!found.length&&<small>{uiText("Already set")}</small>}</label>{edit&&!found.length?<div className="exit-price-input"><span>$</span><input id={`exit-${p.coin}-${field}`} aria-label={("" + String(p.coin) + " " + String(label) + uiText(" price"))} type="number" inputMode="decimal" step="any" min="0" disabled={busy} value={drafts[p.coin]?.[field]??''} onChange={e=>change(p.coin,field,e.target.value)} onBlur={()=>normalize(p,field)}/></div>:<strong>${price(found[0]?.price??(Number(drafts[p.coin]?.[field])||null))}</strong>}{!!found.length&&<small>{found.every(o=>!o.wholePosition&&o.size<p.size)?uiText('Existing order is smaller than this position. Review it on Hyperliquid.'):uiText('Existing orders stay as they are.')}</small>}</div>;
     })}<div><span className="exit-loss-label">{uiText("Max loss at stop · estimate")}</span><strong>{money(loss)}</strong><small>{uiText("From entry, before fees and price gaps.")}</small></div></div>
     <div className="exit-row-footer"><span>{p.tight&&<b className="exit-tight">{uiText("Tight")}</b>}{p.mark&&Number.isFinite(stop)&&stop>0?("" + String((Math.abs(p.mark-stop)/p.mark*100).toFixed(2)) + uiText("% from current price")):uiText("Prices unavailable")}{p.tight?uiText(" · Stop moved closer to stay before liquidation."):''}</span>{missing(p)&&!p.error&&<button disabled={busy} aria-expanded={edit} onClick={()=>setEditing(rows=>edit?rows.filter(c=>c!==p.coin):[...rows,p.coin])}>{edit?uiText("Done editing"):uiText("Edit prices")}</button>}</div>
     {p.error&&<p className="negative" role="status">{uiText(p.error)}</p>}
    </article>;
   })}</div>
   {(!!positions.length||tracked>0)&&<section className="panel exits-submit"><div><h2>{edits.length?uiText("Ready when you are"):uiText("Your current exits")}</h2><p>{uiText("Stops use recent hourly price movement. Take-profit starts at three times the stop distance from the current price.")}</p><p>{uiText("Orders close the whole position at the time they trigger. A stop is not a loss limit: fast price moves, fees and limited liquidity can increase the loss.")}</p></div>
    {needsPassword&&(edits.length>0||tracked>0)&&<label className="exits-password">{access.saved&&!access.expired?uiText("Unlock auto exits"):uiText("Set an auto exits password")}<input type="password" autoComplete={access.saved&&!access.expired?'current-password':'new-password'} minLength={12} maxLength={1024} value={password} disabled={busy} onChange={e=>setPassword(e.target.value)} aria-describedby="exits-password-note"/><small id="exits-password-note">{access.saved&&!access.expired?uiText("Use the password you set on this browser."):uiText("At least 12 characters. This encrypts the trading key on this browser.")}</small></label>}
    {edits.length>0&&<><p className="exits-access-note">{!access.saved||access.expired?uiText("Your wallet will approve “HyperHive exits” for up to 180 days. This gives the agent trading access. HyperHive uses it for exits and never requests transfers or withdrawals."):uiText("Your trading key stays encrypted on this browser. It signs these orders here.")}</p>{invalid&&<p className="negative" role="alert">{invalid}</p>}{stale&&<p role="status">{uiText("Prices are over a minute old. Refresh before adding exits.")}</p>}<button className="primary exits-primary" disabled={busy||loading||!!invalid||stale||(needsPassword&&password.length<12)} onClick={()=>act('add')}>{busy?uiText("Waiting for wallet or Hyperliquid…"):(uiText("Add stops to all (") + String(edits.length) + ")")}</button></>}
   </section>}
   {(access.saved||tracked>0||!!error)&&<div className="exits-manage">{tracked>0&&<button disabled={busy||loading||(needsPassword&&password.length<12)} onClick={()=>act('remove')}>{uiText("Remove auto exits")}</button>}{(access.saved||!!error)&&<button disabled={busy} onClick={async()=>{try{await disconnectExitAgent(owner);readAccess();setPassword('');setNotice('Auto exits disconnected from this browser. Existing orders stay on Hyperliquid. You can revoke “HyperHive exits” in Hyperliquid’s API settings.');}catch(e){setError((e as Error).message);}}}>{uiText("Disconnect")}</button>}<small>{uiText("Remove cancels only exits added from this browser. Disconnect forgets the trading key. You can revoke it on Hyperliquid.")}</small></div>}
  </>}
 </div>;
}
