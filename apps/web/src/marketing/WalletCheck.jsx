import React,{useEffect,useRef,useState} from 'react';
import './wallet-check.css';

const validAddress=value=>/^0x[0-9a-fA-F]{40}$/.test(value);
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
const decimal=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value);
const leverage=value=>value===null?'Not available':`${decimal(value)}×`;

function Position({position:p}){
  const distance=p.distanceToLiquidationPct,tone=distance===null?'unknown':distance<=10?'risk':distance<=25?'attention':'healthy';
  return <article className="wallet-check__position" aria-label={`${p.coin} ${p.side} position`}>
    <div className="wallet-check__position-heading"><h3>{p.coin} <span>{p.side}</span></h3><span>{money(p.notional)} position</span></div>
    <div className="wallet-check__distance">
      <p><span>Distance to liquidation</span><strong>{distance===null?'No estimate':`${decimal(distance)}% away`}</strong></p>
      <div className={`wallet-check__bar wallet-check__bar--${tone}`} aria-hidden="true"><span style={{width:`${distance===null?0:Math.min(100,Math.max(2,distance))}%`}}/></div>
      <small>{distance===null?'Hyperliquid has no liquidation price for this position.':`Estimated liquidation at ${money(p.liquidationPx)} · Current price ${money(p.mark)}`}</small>
    </div>
    <div className="wallet-check__badges"><span className={p.hasStop?'is-set':'is-missing'}>{p.hasStop?'Stop set':'No stop'}</span><span className={p.hasTakeProfit?'is-set':'is-missing'}>{p.hasTakeProfit?'Take-profit set':'No take-profit'}</span></div>
    <dl className="wallet-check__position-stats"><div><dt>Leverage</dt><dd>{leverage(p.leverage)}</dd></div><div><dt>Open profit / loss</dt><dd className={p.unrealizedPnl<0?'wallet-check__negative':''}>{money(p.unrealizedPnl)}</dd></div><div><dt>Funding paid · 7 days</dt><dd>{money(p.funding7d)}</dd></div></dl>
    {!p.hasStop&&<a className="wallet-check__fix" href={`/dashboard?exits=${encodeURIComponent(p.coin)}`}>Fix it: add a stop and take-profit <span aria-hidden="true">→</span></a>}
  </article>;
}

export default function WalletCheck(){
  const [initialAddress]=useState(()=>new URLSearchParams(location.search).get('a')??'');
  const [address,setAddress]=useState(initialAddress),[owner,setOwner]=useState(''),[report,setReport]=useState(null),[checkedAddress,setCheckedAddress]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const request=useRef(null),generation=useRef(0),resultHeading=useRef(null);
  function cancel(){generation.current++;request.current?.abort();}
  async function check(value){
    cancel();setReport(null);setError('');setBusy(false);
    const clean=value.trim();setAddress(clean);
    if(!validAddress(clean)){setError('Enter a full wallet address: 0x followed by 40 characters (0–9 or a–f).');return;}
    const current=generation.current,controller=new AbortController();request.current=controller;setBusy(true);
    const timeout=setTimeout(()=>controller.abort(),20_000);
    try{
      const response=await fetch(`/api/wallet-check/${encodeURIComponent(clean)}`,{signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw Error(response.status===429?'Too many checks. Please try again in an hour.':'We could not check this wallet. Please try again.');
      const data=await response.json();if(current!==generation.current)return;
      setCheckedAddress(clean);setReport(data);
    }catch(e){if(current===generation.current)setError(e.name==='AbortError'?'The check took too long. Please try again.':e.message);}
    finally{clearTimeout(timeout);if(current===generation.current)setBusy(false);}
  }
  useEffect(()=>{
    if(initialAddress)void check(initialAddress);
    const session=new AbortController();
    fetch('/api/me',{credentials:'same-origin',signal:session.signal}).then(r=>r.ok?r.json():null).then(me=>{if(validAddress(me?.owner??''))setOwner(me.owner);}).catch(()=>{});
    return ()=>{cancel();session.abort();};
  },[]);
  useEffect(()=>{if(report)resultHeading.current?.focus({preventScroll:true});},[report]);
  const summary=report?.summary;
  return <main className="wallet-check">
    <header className="wallet-check__intro"><p className="wallet-check__eyebrow">Free wallet check · No connection needed</p><h1>Check any Hyperliquid wallet in 5 seconds</h1><p>See how close positions are to liquidation, spot missing stops, and check trading costs.</p></header>
    <form className="wallet-check__form" onSubmit={event=>{event.preventDefault();void check(address);}} noValidate>
      <label htmlFor="wallet-check-address">Hyperliquid wallet address</label>
      <div className="wallet-check__input-row"><input id="wallet-check-address" name="address" value={address} onChange={event=>{cancel();setAddress(event.target.value);setReport(null);setError('');setBusy(false);}} placeholder="0x…" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={!!error} aria-describedby={error?'wallet-check-error':'wallet-check-help'}/><button type="submit" className="site-btn site-btn--primary" disabled={busy}>{busy?'Checking…':'Check'}</button></div>
      <p id="wallet-check-help">Paste the account address that holds the positions.</p>
      {owner&&<button type="button" className="wallet-check__connected" onClick={()=>void check(owner)} disabled={busy}>Use my connected wallet <span aria-hidden="true">→</span></button>}
      {error&&<p className="wallet-check__error" id="wallet-check-error" role="alert">{error}</p>}
    </form>
    <div className="wallet-check__feedback" role="status" aria-live="polite">{busy?'Reading positions, open orders, and the last 7 days of funding…':report?`Check complete. ${summary.status}.`:''}</div>
    {report&&<section className="wallet-check__report" aria-labelledby="wallet-check-result">
      <div className="wallet-check__report-label"><h2 id="wallet-check-result" tabIndex={-1} ref={resultHeading}>Your wallet report</h2><span>Checked {new Date(report.checkedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span></div>
      <p className="wallet-check__address">{checkedAddress}</p>
      <div className={`wallet-check__verdict wallet-check__verdict--${summary.status==='At risk'?'risk':summary.status==='Needs attention'?'attention':'healthy'}`}>
        <div><span className="wallet-check__status">{summary.status}</span><p>{summary.explanation}</p></div>
        {summary.positionsWithoutStop>0&&<a className="site-btn site-btn--primary wallet-check__fix-all" href="/dashboard?exits=all">Fix all in one tap <span aria-hidden="true">→</span></a>}
      </div>
      <dl className="wallet-check__summary">
        <div><dt>Account value</dt><dd>{money(summary.accountValue)}</dd><small>{money(summary.totalNotional)} in open positions</small></div>
        <div><dt>Leverage</dt><dd>{leverage(summary.effectiveLeverage)}</dd><small>Position value ÷ account value</small></div>
        <div><dt>Positions without a stop</dt><dd>{summary.positionsWithoutStop}<span> / {report.positions.length}</span></dd><small>Stops for the full position size</small></div>
        <div><dt>Funding paid this week</dt><dd>{money(summary.totalFundingPaid7d)}</dd><small>Payments made over the last 7 days</small></div>
      </dl>
      {report.positions.length?<><div className="wallet-check__positions-heading"><h2>Open positions <span>({report.positions.length})</span></h2>{summary.closestToLiquidation&&<p>Closest to liquidation: <strong>{summary.closestToLiquidation.coin} · {decimal(summary.closestToLiquidation.distanceToLiquidationPct)}%</strong></p>}</div><div className="wallet-check__positions">{report.positions.map(p=><Position key={p.coin} position={p}/>)}</div></>
        :<div className="wallet-check__empty"><h2>No open positions</h2><p>There are no positions to review in this account’s main perp market. If you expected positions, check the account address.</p></div>}
      <details className="wallet-check__rules"><summary>How this check works</summary><div>
        <p><strong>At risk:</strong> a position is 10% or less from its estimated liquidation price, or open positions have no positive account value.</p>
        <p><strong>Needs attention:</strong> a position lacks a stop for its full size, account leverage is above 5×, or a liquidation estimate is unavailable. Otherwise, the status is Healthy.</p>
        <p>A stop counts only when it closes the position before the estimated liquidation price. Partial stops alone do not count. Open orders can change or fail to fill.</p>
        <p>Prices use current market midpoints. Funding is the total paid over 7 days, including closed positions; incoming funding is not subtracted. Per-position funding includes earlier trades in the same coin.</p>
        <p>This checks Hyperliquid’s main perp market for this address. Other perp markets and subaccounts are not included. Results may be up to 30 seconds old. A Healthy status does not mean trading is risk-free.</p>
      </div></details>
    </section>}
    <p className="wallet-check__privacy">Read-only. We never see your keys. Not financial advice.</p>
  </main>;
}
