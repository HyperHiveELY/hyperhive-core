import React,{useEffect,useState} from 'react';
import {ReceivingWallet} from './ReceivingWallet.js';
import {type Api} from './ResearchPages.js';
export function CheckoutSettings({api,cfg,onBack}:{api:Api;cfg:any;onBack:()=>void}){
 const [pricing,setPricing]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [payTo,setPayTo]=useState(cfg?.integrations?.elysiumCreditPayTo??''),[markup,setMarkup]=useState(String((cfg?.integrations?.aiMarkupBps??2500)/100));
 async function refresh(){setPricing(await api('/tokens/pricing'));}
 useEffect(()=>{refresh().catch(e=>setError(e.message));},[api]);
 async function run(fn:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await fn();await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!cfg?.localSetup)return <p>Checkout administration is available only to the local operator.</p>;
 return <div className="operator-flow"><button className="back-link" onClick={onBack}>Back to Settings</button><div className="page-heading"><div><h1>Checkout setup</h1><p>One-time HyperHive administration. Customers only buy Tokens.</p></div></div>
 {error&&<p role="alert" className="connection-warning">{error}</p>}{notice&&<p role="status" className="connection-warning">{notice}</p>}
 <div className="continue-crew"><span>{pricing?.elysiumCheckoutReady?'Checkout is accepting payments.':'Set your Elysium USDC receiving address to open checkout.'}</span><button disabled={busy} onClick={()=>run(refresh)}>Check status</button></div>
 <section className="panel setup-panel"><details open className="guided-disclosure"><summary>Elysium receiving address and pricing</summary><div className="two-col"><label>Elysium USDC receiving address<input value={payTo} onChange={e=>setPayTo(e.target.value)} placeholder="0x…" spellCheck={false}/></label><label>AI service markup · %<input type="number" min="0" max="100" step="0.01" value={markup} onChange={e=>setMarkup(e.target.value)}/></label></div><p>Use an address you control on Elysium mainnet. Confirm the address before accepting payments. The markup covers AI service overhead; it does not guarantee a profit.</p><button disabled={busy||!/^0x[\da-fA-F]{40}$/.test(payTo)||markup.trim()===''||!Number.isFinite(Number(markup))} onClick={()=>run(async()=>{await api('/setup/tokens',{network:'elysium',payTo,markupBps:Math.round(Number(markup)*100)});setNotice('Token checkout settings saved.');})}>Save checkout settings</button></details><details><summary>Legacy HyperCore receiving wallet</summary><ReceivingWallet api={api} markupBps={Math.round(Number(markup)*100)} preview={!!cfg?.designPreview} onSaved={()=>{refresh().catch(e=>setError(e.message));}}/></details>{pricing&&!pricing.meteringReady&&<button disabled={busy} onClick={()=>run(async()=>{await api('/setup/tokens/metering',{reviewed:true});setNotice('Metering review acknowledged.');})}>I reviewed usage costs · resume AI metering</button>}</section>
 </div>;
}
