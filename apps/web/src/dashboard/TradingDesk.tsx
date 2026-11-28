import {uiText,getLanguage} from "../i18n/language.js";
import React,{useState,useEffect} from 'react';
import {TradingToolbar} from './trading/TradingToolbar.js';
import {PaperDesk} from './trading/PaperDesk.js';
import {Plus,Pause,Play,ArrowUpRight,ShieldCheck,Activity,Settings2,ChevronDown,Check,CrewStack,RefreshCw} from '../ui/ProductIcons.js';
import {money,signed} from './Dashboard.js';
import {total,type DashboardData} from '../../../../packages/core/dashboard-view.js';
import type {Api} from './ResearchPages.js';
import {numeric} from './trading/catalog.js';
import {MarketWorkspace} from './trading/MarketWorkspace.js';
import {TradingLedger} from './trading/TradingLedger.js';
import {selectedDetail,botControl,marketRelationship} from './trading/live-state.js';
import './trading/live.css';

type Props={markets:any[];data:DashboardData|null;detail:any;selected:string;onSelect:(id:string)=>void;onAction:(action:string,id:string)=>void;onOpen:(id:string)=>void;onCreate:()=>void;api:Api;busy:boolean;marketTime?:number;marketError?:string;onRefresh?:()=>void};
export function TradingDesk(p:Props){
 const [mode,setMode]=useState<'paper'|'mainnet'>('mainnet');
 useEffect(()=>{let current=true;if(p.selected)p.api('/crews/'+encodeURIComponent(p.selected)+'/paper').then(r=>{if(current)setMode(r.account?'paper':'mainnet');}).catch(()=>{});return()=>{current=false;};},[p.selected,p.api]);
 const bots=p.data?.bots??[],detail=selectedDetail(p.detail,p.selected),crew=detail?.crew;
 const summary=bots.find(b=>b.crew.id===p.selected),control=botControl(detail),checks=detail?.readiness?.checks??[];
 const accountError=(!detail||numeric(detail.state?.marginSummary?.accountValue)===null)?summary?.error??'':'';
 const paperOnly=checks.some((c:any)=>c.id==='paper');
 const card=detail?.cards?.[0],activity=(p.data?.activity??[]).filter(item=>item.crewId===p.selected).slice(0,4);
 const action=(name:string)=>{if(crew&&!p.busy)p.onAction(name,crew.id);};
 if(mode==='paper')return <PaperDesk key={p.selected} selected={p.selected} crew={crew} bots={bots} onSelect={p.onSelect} api={p.api} onMainnet={()=>setMode('mainnet')} onCreate={p.onCreate}/>;
 const inspector=<aside className="tu-bots" aria-label={uiText("Crew controls")}>
  <div className="tu-panelhead"><h2>{uiText("Your crews ")}<span>{p.data?bots.length:'—'}</span></h2>{p.onRefresh&&<button className="tu-icon" aria-label={uiText("Refresh crew account")} onClick={p.onRefresh} disabled={p.busy}><RefreshCw size={14}/></button>}</div>
  {bots.length>0&&<label className="tu-botselect"><CrewStack size={23}/><select aria-label={uiText("Selected crew")} value={p.selected} onChange={e=>p.onSelect(e.target.value)}>{!p.selected&&<option value="">{uiText("Select a crew")}</option>}{bots.map(b=><option key={b.crew.id} value={b.crew.id}>{b.crew.policy.name}</option>)}</select></label>}
  {!crew?<div className="tu-empty"><CrewStack size={26}/><b>{accountError?uiText("Account data unavailable"):p.selected?uiText("Fetching account data…"):bots.length?uiText("Select a crew"):uiText("Build your first crew")}</b><p>{uiText(accountError)|| (p.selected?uiText("Balances and controls appear after the account is verified."):uiText("Create a crew, set your limits, then follow the funding guide."))}</p>{!bots.length&&<button className="tu-primary" onClick={p.onCreate}><Plus size={14}/>{uiText("Build a crew")}</button>}</div>:<>
   <div className="tu-botstatus"><span className={'tu-status '+(control.status==='Running'?'running':'')}><i/>{paperOnly?uiText("Paper testing"):uiText(control.status)}</span><span>{crew.policy.plan==='pro'?5:3}{uiText(" AI scouts")}</span></div>
   {accountError&&<p className="tu-warning" role="status">{uiText(accountError)}</p>}<div className="tu-botbalance"><span>{uiText("Trading balance")}</span><strong>{money(detail.state?.marginSummary?.accountValue)}<small> USDC</small></strong><div className="tu-available"><span>{uiText("Available ")}{money(detail.state?.withdrawable)}</span><span className={(summary?.pnl??0)<0?'tu-down':'tu-up'}>{signed(summary?.pnl??null)}{uiText(" all-time")}</span></div></div>
   <button className="inline-link" onClick={()=>action('models')}>{uiText("AI models ")}<ArrowUpRight size={13}/></button><button className="inline-link" onClick={()=>action('renew')}>{uiText("Trading rules ")}<ArrowUpRight size={13}/></button><div className="tu-botactions"><button className="tu-primary" disabled={p.busy} onClick={()=>paperOnly?setMode('paper'):control.action==='setup'?p.onOpen(crew.id):action(control.action)}>{control.action==='pause'?<Pause size={16}/>:control.action==='start'?<Play size={16}/>:<ArrowUpRight size={16}/>} {paperOnly?uiText("Open practice crew"):uiText(control.label)}</button></div>
   <details className="tu-policy tu-disclosure"><summary><ShieldCheck size={15}/>{uiText("Limits & account")}<ChevronDown size={14}/></summary><div className="tu-policy-content"><div><span>{uiText("Signed markets")}</span><b>{crew.policy.markets.join(' · ')}</b></div><div><span>{uiText("Weekly sizing budget")}</span><b>{crew.policy.weeklyBudget} USDC</b></div><div><span>{uiText("Account cap")}</span><b>{crew.policy.maxAccountValue} USDC</b></div><button disabled={p.busy} onClick={()=>action('account')}><ShieldCheck size={15}/>{uiText("Account & policy")}<ArrowUpRight size={14}/></button></div></details>
   <details className="tu-decision tu-disclosure"><summary><Activity size={15}/>{uiText("Latest decision")}<span>{uiText(card?.status)??uiText("Awaiting scan")}</span><ChevronDown size={14}/></summary>{card?<><b>{card.body?.card?.market} · {card.body?.card?.side}</b><p>{card.verdict?.reasons?.join(' · ')||card.body?.card?.why||uiText(card.reason)||uiText("Open the decision for its recorded evidence.")}</p><button disabled={p.busy} onClick={()=>action('decision')}>{uiText("Inspect decision")}<ArrowUpRight size={14}/></button></>:<p>{uiText("No decision recorded yet. Scout reviews appear here after the crew starts.")}</p>}</details>
   <details className="tu-livechecks"><summary><ShieldCheck size={15}/><span>{checks.length?checks.filter((c:any)=>c.ok).length+' / '+checks.length+uiText(" readiness checks"):uiText("Readiness unavailable")}</span><ChevronDown size={13}/></summary><div>{checks.map((c:any)=><div key={c.id}><span className={c.ok?'tu-up':'tu-pending'}>{c.ok?<Check size={13}/>:<span>○</span>}</span>{uiText(c.label)}</div>)}</div></details>
   <details className="tu-manage"><summary><Settings2 size={15}/>{uiText("Manage crew")}<ChevronDown size={14}/></summary><div>{[['fund','Fund'],['pay','Manage AI Tokens'],['withdraw','Withdraw funds'],['restore','Unlock account'],['approve','Approve agent'],['renew','Renew policy & agent'],['revoke','Revoke agent'],['close','Close all positions']].map(([id,label])=><button key={id} disabled={p.busy} onClick={()=>action(id)}>{uiText(label)}<ArrowUpRight size={13}/></button>)}</div></details>
   <details className="tu-activity tu-disclosure"><summary><Activity size={15}/>{uiText("Crew activity")}<ChevronDown size={14}/></summary>{activity.length?activity.map(item=><button className="tu-activityitem" key={item.id} onClick={()=>p.onOpen(crew.id)}><i/><span><b>{uiText(item.title)}</b><small>{uiText(item.message)}</small><time>{new Date(item.time).toLocaleString(getLanguage())}</time></span><ArrowUpRight size={12}/></button>):<p>{uiText("No recorded activity yet.")}</p>}{activity.length>0&&<button className="tu-allactivity" onClick={()=>action('activity')}>{uiText("View journal")}<ArrowUpRight size={13}/></button>}</details>
  </>}
 </aside>;
 return <div className="tu-root tu-live">

  {p.marketError&&<div className="tu-warning" role="status">{uiText("Crew market eligibility is unavailable. ")}{uiText(p.marketError)}</div>}
  <MarketWorkspace inspector={inspector} toolbar={<TradingToolbar mode="mainnet" onMode={setMode} onCreate={p.onCreate} hasBots={bots.length>0} balance={p.data?money(total(bots,'equity')):'—'} enabled={p.data?bots.filter(b=>!b.crew.paused).length:undefined} count={p.data?bots.length:undefined}/>}>{(market,select)=>{const relation=marketRelationship(market,crew,p.markets,!!p.marketTime&&!p.marketError);return <>
   <div className={'tu-marketrelationship '+(!relation.matches?'is-unmatched':'')}><ShieldCheck size={17}/><div><b>{uiText(relation.title)}</b><span>{uiText(relation.note)}</span></div>{crew&&market&&!relation.matches&&<button onClick={()=>select('Perps:'+crew.policy.markets[0])}>{uiText("View crew market")}<ArrowUpRight size={14}/></button>}</div>
   <TradingLedger key={p.selected||'none'} selected={p.selected} detail={detail} accountError={accountError} api={p.api} busy={p.busy} onAction={p.onAction} onOpen={p.onOpen}/>
  </>;}}</MarketWorkspace>
  <div className="tu-footer"><span>{uiText("Public Hyperliquid quotes · refreshes every minute")}</span><span>{p.data?uiText("Crew accounts updated ")+new Date(p.data.updatedAt).toLocaleTimeString(getLanguage()):uiText("Connect your wallet to load crew accounts")}</span></div>
 </div>;
}
