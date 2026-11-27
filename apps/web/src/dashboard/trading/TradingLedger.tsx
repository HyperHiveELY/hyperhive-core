import React,{useEffect,useState} from 'react';
import {Layers,ArrowUpRight,ShieldCheck,RefreshCw} from '../../ui/ProductIcons.js';
import {money,signed} from '../Dashboard.js';
import {useResource,type Api} from '../ResearchPages.js';
import {tabNavigation} from '../tabNavigation.js';
import {selectedDetail} from './live-state.js';
import {numeric} from './catalog.js';

type Props={selected:string;detail:any;api:Api;busy:boolean;onAction:(action:string,id:string)=>void;onOpen:(id:string)=>void;accountError?:string};
/** Parent keys this component by crew ID, isolating each crew's history and tab state. */
export function TradingLedger(p:Props){
 const [tab,setTab]=useState('Positions'),detail=selectedDetail(p.detail,p.selected),crew=detail?.crew;
 const fills=useResource(p.selected?'/records/'+encodeURIComponent(p.selected)+'/fills':null,p.api);
 useEffect(()=>{if(!p.selected)return;const timer=setInterval(fills.reload,30000);return()=>clearInterval(timer);},[p.selected,p.api]);
 const accountUnavailable=!!p.accountError||!!detail&&numeric(detail.state?.marginSummary?.accountValue)===null;
 const positions=accountUnavailable?undefined:detail?.state?.assetPositions?.filter((row:any)=>Number(row.position.szi)!==0),orders=accountUnavailable?undefined:detail?.orders;
 const rows=tab==='Positions'?positions:tab==='Orders'?orders:fills.data?.fills;
 const error=tab==='History'?fills.error:accountUnavailable?'Account data unavailable. Refresh the account to check exposure.':'',loading=tab==='History'?fills.loading:!!p.selected&&!detail&&!accountUnavailable;
 const known=Array.isArray(rows)&&!error&&!loading;
 const heads=tab==='Positions'?['Market / side','Size','Entry','P&L','Stop / take profit','Leverage']:tab==='Orders'?['Market / side','Type','Size','Limit / trigger','Reduce only','Created']:['Time','Market / side','Size','Price','Fee','Record'];
 return <section className="tu-ledger" aria-label="Selected crew account data">
  <div className="tu-ledgerhead"><div className="tu-ledgertabs" role="tablist" aria-label="Crew records" onKeyDown={tabNavigation}>{['Positions','Orders','History'].map(t=><button role="tab" tabIndex={tab===t?0:-1} aria-selected={tab===t} aria-controls="tu-ledgerbody" id={'tu-tab-'+t} key={t} onClick={()=>setTab(t)}>{t}{t==='Positions'&&<span>{positions?.length??'—'}</span>}</button>)}</div><small>{crew?.policy.name??'Select a crew'}</small></div>
  <div id="tu-ledgerbody" role="tabpanel" aria-labelledby={'tu-tab-'+tab}>
   {known&&rows.length>0?<>
    <div className="tu-tablescroll" tabIndex={0} role="region" aria-label={tab+' table, scroll horizontally for more columns'}><table><thead><tr>{heads.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
     {tab==='Positions'?positions.map(({position:q}:any)=>{const protection=detail.positions?.find((row:any)=>row.body?.state?.market===q.coin)?.body?.state;return <tr key={q.coin}><td><b>{q.coin}</b><small className={Number(q.szi)>0?'tu-up':'tu-down'}>{Number(q.szi)>0?'Long':'Short'}</small></td><td>{Math.abs(Number(q.szi))}</td><td>{money(q.entryPx)}</td><td className={Number(q.unrealizedPnl)<0?'tu-down':'tu-up'}>{signed(Number(q.unrealizedPnl))}</td><td><span className="tu-down">{money(protection?.stop)}</span><span className="tu-slash"> / </span><span className="tu-up">{money(protection?.tp)}</span></td><td>{q.leverage?.value??'—'}×</td></tr>}):tab==='Orders'?orders.map((o:any)=><tr key={o.oid}><td><b>{o.coin}</b><small>{o.side==='B'?'Buy':o.side==='A'?'Sell':o.side}</small></td><td>{o.orderType??(o.isTrigger?'Trigger':'Limit')}</td><td>{o.sz}</td><td>{money(o.isTrigger?o.triggerPx:o.limitPx)}</td><td>{o.reduceOnly?<span className="tu-protected"><ShieldCheck size={13}/>Yes</span>:'No'}</td><td>{new Date(Number(o.timestamp)).toLocaleString()}</td></tr>):fills.data.fills.map((f:any,i:number)=><tr key={f.tid??i}><td>{new Date(Number(f.body?.time??f.created_at)).toLocaleString()}</td><td><b>{f.body?.coin??'—'}</b><small>{f.body?.side==='B'?'Buy':f.body?.side==='A'?'Sell':f.body?.side??'—'}</small></td><td>{f.body?.sz??'—'}</td><td>{money(f.body?.px)}</td><td>{money(f.body?.fee)}</td><td>{f.status??'—'}</td></tr>)}
    </tbody></table></div><div className="tu-ledgernote"><ShieldCheck size={14}/>All {tab.toLowerCase()} for this bot. Chart selection does not filter its exposure.</div>
   </>:<div className="tu-empty tu-ledgerempty"><Layers size={25}/><b>{!p.selected?'Select a crew to view records':loading?'Loading '+tab.toLowerCase()+'…':error?(tab==='History'?'Trade history unavailable':'Account data unavailable'):!known?'Account data unavailable':tab==='Positions'?'No open positions':tab==='Orders'?'No open orders':'No trade history'}</b><p>{error||(!p.selected?'Your crews’ positions, protection orders and fills appear here.':known?'Records appear here after execution.':'Waiting for verified account data.')}</p>{error&&tab==='History'&&<button onClick={fills.reload}><RefreshCw size={14}/>Retry history</button>}{known&&crew&&!detail.readiness?.ready&&<button disabled={p.busy} onClick={()=>p.onOpen(crew.id)}>Continue setup<ArrowUpRight size={14}/></button>}</div>}
   {!accountUnavailable&&tab==='Positions'&&orders?.some((o:any)=>o.reduceOnly)&&<div className="tu-protectionlist"><div><b>Protective orders</b><button onClick={()=>setTab('Orders')}>View all orders<ArrowUpRight size={13}/></button></div>{orders.filter((o:any)=>o.reduceOnly).map((o:any)=><div key={o.oid}><span>{o.coin} · {o.orderType??'Reduce only'}</span><b>{money(o.isTrigger?o.triggerPx:o.limitPx)}</b></div>)}</div>}
   {!accountUnavailable&&!!positions?.length&&<div className="tu-closepositions"><button disabled={p.busy||!crew} onClick={()=>crew&&p.onAction('close',crew.id)}>Close all positions<ArrowUpRight size={13}/></button><span>Review and sign before submitting.</span></div>}
  </div>
 </section>;
}
