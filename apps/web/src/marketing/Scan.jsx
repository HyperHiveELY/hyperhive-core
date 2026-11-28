import {uiText,getLanguage} from "../i18n/language.js";
import React,{useEffect,useRef,useState} from 'react';
import './scan.css';

const quick=['BTC','ETH','SOL','HYPE'];
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:value<1?6:2}).format(value);
async function request(url,options={}){
 const response=await fetch(url,{...options,signal:options.signal??AbortSignal.timeout(45000)});
 const body=await response.json();
 if(!response.ok)throw Error(response.status===429?'Too many scans. Try again in an hour.':body.error??'Scans are busy, try again soon');
 return body;
}

export default function Scan(){
 const [markets,setMarkets]=useState([]),[market,setMarket]=useState('BTC'),[search,setSearch]=useState('');
 const [loadingMarkets,setLoadingMarkets]=useState(true),[marketError,setMarketError]=useState(''),[error,setError]=useState('');
 const [busy,setBusy]=useState(false),[step,setStep]=useState(0),[result,setResult]=useState(null);
 const active=useRef(null),progress=useRef(null),picker=useRef(null),resultTitle=useRef(null),initial=useRef(true);
 async function scan(coin){
  if(active.current)return;
  const controller=new AbortController();active.current=controller;
  setBusy(true);setStep(0);setError('');setResult(null);
  const url=new URL(location.href);url.searchParams.set('m',coin);history.replaceState(null,'',url);
  progress.current=setTimeout(()=>setStep(1),3500);
  try{
   const data=await request('/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({market:coin}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
   if(!controller.signal.aborted)setResult(data);
  }catch(e){if(!controller.signal.aborted)setError(e.name==='TimeoutError'?'This scan took too long. Try again.':e.message||'Scans are busy, try again soon');}
  finally{clearTimeout(progress.current);if(active.current===controller){active.current=null;setBusy(false);}}
 }
 async function loadMarkets(signal){
  setLoadingMarkets(true);setMarketError('');
  try{
   const data=await request('/api/scan/markets',{signal});if(signal?.aborted)return;
   if(!data.markets?.length)throw Error('No coins are available right now. Try again soon.');
   setMarkets(data.markets);
   if(initial.current){
    initial.current=false;
    const requested=new URLSearchParams(location.search).get('m');
    const selected=data.markets.find(coin=>coin.toUpperCase()===requested?.toUpperCase());
    setMarket(selected??(data.markets.includes('BTC')?'BTC':data.markets[0]));
    if(selected)void scan(selected);
    else if(requested)setError('That coin is not in the current list. Choose another coin.');
   }
  }catch(e){if(!signal?.aborted)setMarketError(e.message||'Could not load coins. Try again.');}
  finally{if(!signal?.aborted)setLoadingMarkets(false);}
 }
 useEffect(()=>{
  const controller=new AbortController();void loadMarkets(controller.signal);
  return()=>{controller.abort();active.current?.abort();clearTimeout(progress.current);};
 },[]);
 useEffect(()=>{if(result)resultTitle.current?.focus();},[result]);
 function choose(coin){setMarket(coin);setResult(null);setError('');}
 function another(){setResult(null);setError('');setSearch('');picker.current?.focus();}
 const filtered=markets.filter(coin=>coin.toLowerCase().includes(search.trim().toLowerCase()));
 return <main className="scan-page">
  <header className="scan-heading">
   <p className="scan-eyebrow"><span aria-hidden="true"/>{uiText("Free AI scanner · No wallet needed")}</p>
   <h1>{uiText("Get an AI trade read")}<br className="scan-heading__break"/>{uiText(" on any coin")}</h1>
   <p>{uiText("Pick a Hyperliquid coin. The Scouts read the market. The Skeptic checks the idea.")}</p>
  </header>
  <div className="scan-workbench">
   <form className={'scan-picker'+(result?' scan-picker--result':'')} onSubmit={event=>{event.preventDefault();if(markets.includes(market))void scan(market);}}>
    <fieldset disabled={busy||loadingMarkets||Boolean(marketError)}>
     <legend>{uiText("Choose a coin")}</legend>
     <div className="scan-quick">{quick.map(coin=><button key={coin} type="button" aria-pressed={market===coin} disabled={!markets.includes(coin)} onClick={()=>choose(coin)}>{coin}</button>)}</div>
     <label htmlFor="scan-search">{uiText("Find a coin")}</label>
     <input ref={picker} id="scan-search" type="search" placeholder={uiText("Search coins")} value={search} onChange={event=>setSearch(event.target.value)} autoComplete="off"/>
     <label htmlFor="scan-market" className="site-sr">{uiText("Coin to scan")}</label>
     <select id="scan-market" value={market} onChange={event=>choose(event.target.value)}>
      {!filtered.includes(market)&&markets.includes(market)&&<option value={market}>{market}{uiText(" (selected)")}</option>}
      {filtered.map(coin=><option key={coin} value={coin}>{coin}</option>)}
     </select>
     {search&&<p className="scan-hint" role="status">{filtered.length?("" + String(filtered.length) + uiText(" matching coins")):uiText("No matching coins. Try another search.")}</p>}
     <button className="scan-submit" type="submit" disabled={!markets.includes(market)}>{busy?uiText("Scanning…"):(uiText("Scan ") + String(market) + "")}<span aria-hidden="true">↗</span></button>
    </fieldset>
    {loadingMarkets&&<p role="status" className="scan-hint">{uiText("Loading coins…")}</p>}
    {marketError&&<div role="alert" className="scan-error"><p>{uiText(marketError)}</p><button type="button" onClick={()=>void loadMarkets()}>{uiText("Reload coins")}</button></div>}
    <p className="scan-hint">{uiText("Free. No signup. Usually ready in about 10 seconds.")}</p>
   </form>
   <div className="scan-read" aria-busy={busy}>
    {busy?<div className="scan-progress" role="status" aria-live="polite">
     <p className="scan-eyebrow">{uiText("Reading ")}{market}</p>
     <h2>{step===0?uiText("Scouts are reading the market…"):uiText("Skeptic is checking it…")}</h2>
     <ol aria-hidden="true"><li className={step===0?'is-current':'is-done'}><span>01</span>{uiText("Read the market")}</li><li className={step===1?'is-current':''}><span>02</span>{uiText("Check the idea")}</li></ol>
     <p>{uiText("A clear reason. An exit price. A second opinion.")}</p>
    </div>:error?<div className="scan-error scan-error--main" role="alert"><h2>{uiText("Try again soon")}</h2><p>{uiText(error)}</p><p>{uiText("Your scan is free. Choose a coin and press Scan to retry.")}</p></div>:result?<article className={'scan-result'+(result.side?'':' scan-result--quiet')}>
     <div className="scan-result__top"><p>{result.market} <span>{uiText("on Hyperliquid")}</span></p><p>{money(result.mark)}</p></div>
     <h2 ref={resultTitle} tabIndex={-1}>{result.side?uiText(result.side.toUpperCase()):uiText("No trade right now")}</h2>
     {result.side&&<div className="scan-levels"><p>{uiText("Wrong ")}{result.side==='long'?uiText("below"):uiText("above")} <strong>{money(result.invalidationPx)}</strong><span>({result.distancePct.toFixed(2)}{uiText("% away)")}</span></p><p>{uiText("Time frame ")}<strong>{uiText(result.horizonH)}{uiText(" hours")}</strong></p></div>}
     <p className="scan-why">{uiText(result.why)}</p>
     <section className="scan-skeptic" aria-label={uiText("Skeptic review")}><h3>{uiText("Skeptic ")}<span>{result.skeptic.verdict==='PASS'?uiText("Passed"):uiText("Rejected")}</span></h3><ul>{result.skeptic.reasons.map((reason,index)=><li key={index}>{uiText(reason)}</li>)}</ul></section>
     <p className="scan-asof">{uiText("As of ")}<time dateTime={new Date(result.scannedAt).toISOString()}>{new Date(result.scannedAt).toLocaleString(getLanguage(), {month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})}</time>{result.cached&&<span>{uiText(" · cached")}</span>}</p>
     {result.side&&<a className="scan-trade" href={`/dashboard?${new URLSearchParams({trade:result.market,side:result.side,stop:String(result.invalidationPx)})}`}>{uiText("Trade this with a stop and take-profit →")}</a>}
     <button className="scan-another" type="button" onClick={another}>{uiText("Scan another coin")}</button>
     <p className="scan-disclaimer">{uiText("AI reads can be wrong. Not financial advice.")}</p>
    </article>:<div className="scan-empty"><p className="scan-eyebrow">{uiText("Two views. One clear read.")}</p><h2>{uiText("A trade idea.")}<br/>{uiText("Or a reason to wait.")}</h2><p>{uiText("See the direction, the price that proves it wrong, and the Skeptic’s verdict.")}</p><div className="scan-empty__roles"><span>{uiText("01 / Scouts")}</span><span>{uiText("02 / Skeptic")}</span></div><p className="scan-disclaimer">{uiText("AI reads can be wrong. Not financial advice.")}</p></div>}
   </div>
  </div>
 </main>;
}
