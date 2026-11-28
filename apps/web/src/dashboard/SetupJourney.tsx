import {uiText} from "../i18n/language.js";
import {FundingStep} from './FundingStep.js';
import {TokensPage} from './TokensPage.js';
import {type Api} from './ResearchPages.js';
import {ArrowUpRight as UiExternal,Check as UiCheck,Circle as UiPending,Square as UiStatus} from '../ui/ProductIcons.js';
import {nextCrewStep,type ReadinessCheck} from './crew-journey.js';
import React,{useState} from 'react';
import {ArrowRight,Check,ChevronRight,Coins,Layers,ShieldCheck,Wallet} from '../ui/ProductIcons.js';

/** The five roles, in the order an idea moves through them. Shared by the newcomer home. */
export const crewRoles=[
 {name:'Scouts',kind:'AI · idea finders',text:'Watch your markets and suggest a trade, with the price that would prove it wrong.'},
 {name:'Skeptic',kind:'AI · second opinion',text:'A different AI tries to reject each idea. It can block a trade, never change one.'},
 {name:'Sizer',kind:'Plain code',text:'Turns your weekly risk budget and current market swings into a size. No leverage slider.'},
 {name:'Executor',kind:'Signer · no AI',text:'Places each order with a take-profit and a stop, then runs every exit. It cannot withdraw.'},
 {name:'Auditor',kind:'Record checker',text:'Matches every fill to a signed slip. Anything unmatched stays visible on your record.'},
] as const;

export function CrewExplainer(){
 return <section className="crew-explainer" aria-labelledby="crew-explainer-title">
  <div className="crew-explainer-heading"><h2 id="crew-explainer-title">{uiText("How your crew works")}</h2><a href="/docs">{uiText("Read the docs ")}<UiExternal size={13} className="hh-inline-icon"/></a></div>
  <ol className="crew-roles">{crewRoles.map(r=><li key={r.name}><b>{uiText(r.name)}</b><small>{uiText(r.kind)}</small><p>{uiText(r.text)}</p></li>)}</ol>
  <p className="crew-risk-note" role="note"><ShieldCheck size={17}/><span>{uiText("Trading perps can lose money, up to everything in the crew account. HyperHive shows ")}<i>{uiText("how")}</i>{uiText(" your account was traded, not what it will make. ")}<a href="/risks">{uiText("Risks & limits")}</a></span></p>
 </section>;
}

export function FirstCrewJourney({owner,signerOnline,onWallet,onCreate,onSetup,tour=false}:{owner:string;signerOnline:boolean;onWallet:()=>void;onCreate:()=>void;onSetup:()=>void;tour?:boolean}){
 const steps=[{title:'Connect your wallet',note:'You keep the keys',done:!!owner},{title:'Build your crew',note:'Markets, budget & backup',done:false},{title:'Fund & start',note:'Add USDC, approve, sign Start',done:false}];
 const focus=owner?{
  title:'Build your first crew.',
  intro:'A crew is a set of AI scouts and rules that trades from its own Hyperliquid account.',
  help:['Pick the markets your scouts will watch.','Set a weekly risk budget: the most the crew may put at risk in one week.','Save an encrypted backup of the crew account. Only you hold its password.'],
  action:'Build a crew',run:onCreate,icon:<Layers size={27}/>,
 }:{
  title:'Connect your wallet.',
  intro:'Your wallet is how you approve things. HyperHive never holds the key that can withdraw your money.',
  help:['Use MetaMask, Rabby, Phantom or Coinbase Wallet.','No wallet yet? Create one on this device, or restore a saved backup.'],
  action:'Connect wallet',run:onWallet,icon:<Wallet size={27}/>,
 };
 return <div className="first-crew">
  <div className="first-crew-hero"><div><h1>{uiText("Welcome to HyperHive.")}</h1><p>{uiText("Set up a crew that trades Hyperliquid perps for you. AI suggests trades, plain code sizes them, and every order leaves a signed record you can check.")}</p></div><span className="badge">{uiText("Hyperliquid mainnet")}</span></div>
  {tour&&<a className="tour-invite" href="/demo"><span className="tour-invite-play" aria-hidden="true"><ArrowRight size={18}/></span><span><b>{uiText("New here? Watch a crew make two trades, start to finish.")}</b><small>{uiText("A 1-minute guided demo with sample money. No wallet needed.")}</small></span><span className="tour-invite-cta">{uiText("Start the demo")}<ArrowRight size={15}/></span></a>}
  <section className="journey-card first-crew-card" aria-label={uiText("Set up your first crew")}>
  <aside className="journey-outline"><span className="guided-eyebrow">{uiText("Your first crew")}</span>{steps.map((s,i)=><div className={s.done?'complete':i===(owner?1:0)?'current':''} key={s.title} aria-current={i===(owner?1:0)?'step':undefined}><span className="journey-number">{s.done?<Check size={15}/>:i+1}</span><span><b>{uiText(s.title)}</b><small>{uiText(s.note)}</small></span></div>)}<div className="journey-outline-foot"><ShieldCheck size={15}/><span>{uiText("Trading starts only with your signature.")}</span></div></aside>
  <div className="journey-focus"><span className="journey-symbol">{focus.icon}</span><span className="guided-eyebrow">{uiText("Step ")}{owner?'2':'1'}{uiText(" of 3")}</span><h2>{uiText(focus.title)}</h2><p>{uiText(focus.intro)}</p><ul className="journey-step-help">{focus.help.map(h=><li key={h}><Check size={14}/><span>{uiText(h)}</span></li>)}</ul>{owner&&<div className="journey-wallet"><Check size={15}/><span>{uiText("Wallet connected")}</span><code>{owner.slice(0,8)}…{owner.slice(-5)}</code></div>}<button className="primary" onClick={focus.run}>{uiText(focus.action)}<ArrowRight size={16}/></button><span className="journey-time">{uiText("All three steps take about 5 minutes.")}</span></div>
 </section><div className="journey-support"><button onClick={onWallet}><Wallet size={16}/>{owner?uiText("Manage wallet"):uiText("Wallet options")}<ChevronRight size={14}/></button><button onClick={onSetup}><span className={signerOnline?'positive':'muted'}><UiStatus size={9} fill="currentColor" strokeWidth={0}/></span>{uiText("Trading service · ")}{signerOnline?uiText("Online"):uiText("Setup needed")}<ChevronRight size={14}/></button><a href="/docs">{uiText("Read the guide ")}<UiExternal size={13} className="hh-inline-icon"/></a></div>
 <CrewExplainer/></div>;
}

export function CrewSetupJourney({api,cfg,unlocked=true,onFund,detail,busy,onModal,onNavigate,onRefresh}:{api?:Api;cfg?:any;unlocked?:boolean;onFund?:(amount:string)=>void;detail:any;busy:boolean;onModal:(modal:string)=>void;onNavigate:(view:string)=>void;onRefresh:()=>void}){
 const checks:ReadinessCheck[]=detail.readiness?.checks??[],calculated=nextCrewStep(checks),next=calculated==='start'&&detail.readiness?.ready!==true?'service':calculated,[expanded,setExpanded]=useState(false);
 if(checks.some(c=>c.id==='paper'))return <section className="journey-card crew-activation" aria-label={uiText("Practice trading")}><div className="activation-next"><div><h2>{uiText("Your crew is set up for practice trading.")}</h2><p>{uiText("It trades 100 virtual USDC against live market data with real AI scouts, so you can see how it behaves before risking money. Mainnet trading stays blocked for this crew.")}</p></div><button className="primary" onClick={()=>onNavigate('trading')}>{uiText("Open practice trading")}<ArrowRight size={15}/></button></div></section>;
 const done=(id:string)=>checks.find(c=>c.id===id)?.ok===true;
 const ready=detail.readiness?.ready===true&&next==='start';
 const tasks=[{key:'fund',label:'Trading balance',done:done('funded')&&done('cap')},{key:'tokens',label:detail.readiness?.aiTestingExempt?'AI usage':'AI Tokens',done:done('tokens')},{key:'approve',label:'Trading access',done:done('agent')},{key:'start',label:'Start trading',done:!detail.crew.paused&&ready}];
 const copy:Record<string,[string,string,string,()=>void]>={
  access:['Review your access','Read and accept the trading acknowledgment before continuing.','Review access',()=>onNavigate('access')],
  fund:['Add your trading balance','Send at least 10 USDC to this crew’s Hyperliquid account. Only fund what you are willing to have traded.','Fund trading account',()=>onModal('fund')],
  limits:['Your balance exceeds the account limit','Withdraw the excess or review a new signed policy in Account & access.','Review account',()=>onModal('account')],
  margin:['Free up trading margin','Review your positions and open orders before starting new trades.','Review account',()=>onModal('account')],
  account:['Review your trading account',checks.filter(c=>!c.ok&&['policy','journal','record'].includes(c.id)).map(c=>c.label).join(' · '),'Review account',()=>onModal('account')],
  tokens:['Add Tokens for your scouts','Tokens pay for the AI that looks for trade ideas. 1 USDC buys 1,000 Tokens, shared across all your crews.','Get Tokens',()=>onNavigate('tokens')],
  approve:[unlocked?'Give your crew trading access':'Unlock your trading account',unlocked?'You approve a trading-only key for up to 180 days. It can place and close orders within your policy. It cannot withdraw or transfer your funds.':'Use the encrypted crew backup you saved to approve trading access.',unlocked?'Review agent approval':'Unlock trading account',()=>onModal(unlocked?'approve':'restore')],
  service:['A check needs attention',checks.filter(c=>!c.ok).map(c=>c.label).join(' · ')||'Waiting for the latest account checks.','Review service settings',()=>onNavigate('setup')],
  start:[detail.crew.paused?'Your crew is ready.':'Trading is active.',detail.crew.paused?'Review your limits once more, then sign to start trading with real funds.':'Your crew is trading. Pausing stops new entries; stops and exits keep running.',detail.crew.paused?'Review & start trading':'Review account',()=>onModal(detail.crew.paused?'start':'account')],
 };
 const [title,description,label,action]=copy[next];
 return <section className="journey-card crew-activation" aria-label={uiText("Crew activation")}><div className="activation-heading"><span className="guided-eyebrow">{detail.crew.paused?uiText("Get your crew ready"):uiText("Crew status")}</span><button className="inline-link" disabled={busy} onClick={onRefresh}>{uiText("Refresh checks")}</button></div><ol className="activation-rail">{tasks.map((task,i)=><li key={task.key} className={task.done?'complete':next===task.key?'current':''}><span>{task.done?<Check size={13}/>:i+1}</span>{uiText(task.label)}</li>)}</ol>{next==='fund'&&api&&onFund?<FundingStep api={api} detail={detail} busy={busy} onFund={onFund} onRefresh={onRefresh}/>:next==='tokens'&&api?<TokensPage api={api} owner={detail.crew.owner} cfg={cfg} compact onConnect={()=>onModal('owner')} onPaid={onRefresh}/>:<div className="activation-next"><div><h2>{uiText(title)}</h2><p>{uiText(description)}</p>{next==='fund'&&<code className="journey-address">{detail.crew.account}</code>}</div><button className="primary" disabled={busy||(next==='start'&&!ready)} onClick={action}>{uiText(label)}<ArrowRight size={15}/></button></div>}<button className="journey-check-toggle" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{checks.filter(c=>c.ok).length}{uiText(" of ")}{checks.length}{uiText(" checks passed ")}<ChevronRight size={14}/></button>{expanded&&<div className="journey-checks">{checks.length?checks.map(c=><div key={c.id}><span className={c.ok?'positive':'muted'}>{c.ok?<UiCheck size={13}/>:<UiPending size={13}/>}</span>{uiText(c.label)}</div>):<p>{uiText("Waiting for readiness data.")}</p>}</div>}</section>;
}
