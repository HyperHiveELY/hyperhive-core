import {X as UiClose,ArrowRight as UiArrow} from './ui/ProductIcons.js';
import {subscribeWalletChanges,lockOwnerWallet} from './wallet.js';
import {canonicalView} from './dashboard/navigation.js';
import {HostingPage} from './dashboard/HostingPage.js';
import {DeploymentPage} from './dashboard/DeploymentPage.js';
import {AccessPage} from './dashboard/AccessPage.js';
import React,{useEffect,useState,useRef} from 'react';
import {createPublicClient,http,parseAbi,type Hex} from 'viem';
import type {PrivateKeyAccount} from 'viem/accounts';
import {Policy,policyMessage,controlMessage,hash,subscriptionKey} from '../../../packages/core/domain.js';
import {formatUsd} from '../../../packages/eko/format.js';
import {connect,newAccount,restoreAccount,exchange,download,evmWallet,emergencyClose} from './wallet.js';
import {agentName} from '../../../packages/core/agent-name.js';
import {OwnerWallet} from './OwnerWallet.js';
import {Dashboard,ActivityPage,WalletPage} from './dashboard/Dashboard.js';
import {CrewDetail} from './dashboard/CrewDetail.js';
import type {DashboardData} from '../../../packages/core/dashboard-view.js';
import {CrewDialogContent,type DialogFields} from './dashboard/CrewDialogs.js';
import {WorkspaceShell} from './dashboard/WorkspaceShell.js';
import {TradingDesk} from './dashboard/TradingDesk.js';
import {TradeCards,RiskPage,RecordsPage} from './dashboard/ResearchPages.js';
import {SettingsPage,PlansPage,IntegrationsPage,NetworkPage,AuditorPage} from './dashboard/SettingsPages.js';
import {CheckoutSettings} from './dashboard/CheckoutSettings.js';
import './dashboard/theme.css';import './dashboard/brand.css';
async function api(path:string,body?:unknown){const r=await fetch(`/api${path}`,{credentials:'same-origin',...(body!==undefined?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error??'Request failed');if(body!==undefined&&path.startsWith('/setup/'))window.dispatchEvent(new Event('hyperhive-config-updated'));return data;}
const short=(s:string)=>s?`${s.slice(0,6)}…${s.slice(-4)}`:'—';
// Keep the app in a refresh boundary so edits preserve the current workspace view.
export default function App(){
 const [view,setViewState]=useState(()=>canonicalView(location.pathname.split('/')[2])),[cfg,setCfg]=useState<any>(null),[owner,setOwner]=useState(''),[crews,setCrews]=useState<any[]>([]),[selected,setSelected]=useState(''),[detail,setDetail]=useState<any>(null),[markets,setMarkets]=useState<any[]>([]),[modal,setModal]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[key,setKey]=useState(''),[models,setModels]=useState<any[]>([]),[scout,setScout]=useState(''),[skeptic,setSkeptic]=useState(''),[crewWallet,setCrewWallet]=useState<PrivateKeyAccount|null>(null),[password,setPassword]=useState(''),[backup,setBackup]=useState<File|null>(null),[name,setName]=useState('My crew'),[budget,setBudget]=useState('50'),[cap,setCap]=useState('500'),[chosen,setChosen]=useState(['HYPE']),[plan,setPlan]=useState<'crew'|'pro'>(()=>new URLSearchParams(location.search).get('plan')==='pro'?'pro':'crew'),[amount,setAmount]=useState(''),[accepted,setAccepted]=useState(false);
 function setView(next:string){next=canonicalView(next);setViewState(next);history.pushState(null,'',next==='overview'?'/dashboard':`/dashboard/${next==='setup'?'settings':next}`);window.scrollTo({top:0});}
 useEffect(()=>{const back=()=>{const path=location.pathname.split('/')[2];setViewState(canonicalView(path));};window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);},[]);
 const [dashboard,setDashboard]=useState<DashboardData|null>(null),[loading,setLoading]=useState(true),[connected,setConnected]=useState(false);
 const [recordId,setRecordId]=useState('');
 const [crewTab,setCrewTab]=useState<'overview'|'account'|'activity'>('overview'),[marketTime,setMarketTime]=useState<number>(),[marketError,setMarketError]=useState('');
 const refreshGeneration=useRef(0),modelsInitialized=useRef(false);
 const selectedRef=useRef(selected);selectedRef.current=selected;
 async function refresh(){
  const generation=++refreshGeneration.current;
  try{
   const c=await api('/config');if(generation!==refreshGeneration.current)return;setCfg(c);setConnected(true);
   if(!modelsInitialized.current){setScout(c.models.scout);setSkeptic(c.models.skeptic);modelsInitialized.current=true;}
   const response=await fetch('/api/me',{credentials:'same-origin'});
   if(generation!==refreshGeneration.current)return;
   if(response.status===401){setOwner('');setCrews([]);setDashboard(null);setDetail(null);setSelected('');return;}
   if(!response.ok)throw Error('Could not load your wallet session');
   const me=await response.json();if(generation!==refreshGeneration.current)return;setOwner(me.owner);
   const d:DashboardData=await api('/dashboard');if(generation!==refreshGeneration.current)return;
   setDashboard(d);setCrews(d.bots.map(b=>b.crew));
   const currentSelected=selectedRef.current||d.bots[0]?.crew.id;
   if(currentSelected&&!selectedRef.current)setSelected(currentSelected);
   if(currentSelected){try{const result=await api(`/crews/${currentSelected}`);if(generation===refreshGeneration.current&&selectedRef.current===currentSelected)setDetail(result);}catch(e){if(generation===refreshGeneration.current){setDetail(null);setError((e as Error).message);}}}
  }catch(e){if(generation===refreshGeneration.current){setConnected(false);throw e;}}finally{if(generation===refreshGeneration.current)setLoading(false);}
 }
 useEffect(()=>{const update=()=>refresh().catch(e=>setError(e.message));window.addEventListener('hyperhive-config-updated',update);return()=>window.removeEventListener('hyperhive-config-updated',update);},[]);
 useEffect(()=>{refresh().catch(e=>setError(e.message));const t=setInterval(()=>refresh().catch(e=>setError(e.message)),30000);return()=>{clearInterval(t);refreshGeneration.current++;};},[]);
 useEffect(()=>{let cancelled=false;setDetail((current:any)=>current?.crew.id===selected?current:null);if(selected)api(`/crews/${selected}`).then(d=>{if(!cancelled)setDetail(d);}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;};},[selected]);
 useEffect(()=>{let cancelled=false;const update=()=>api('/markets').then(r=>{if(!cancelled){setMarkets(r.markets);setMarketTime(Date.now());setMarketError('');}}).catch(e=>{if(!cancelled)setMarketError(e.message);});update();const t=setInterval(update,30000);return()=>{cancelled=true;clearInterval(t);};},[]);
 useEffect(()=>{const change=()=>{lockOwnerWallet();refreshGeneration.current++;api('/auth/logout',{}).catch(()=>{}).finally(()=>{setOwner('');setSelected('');setCrews([]);setDetail(null);setDashboard(null);setCrewWallet(null);setNotice('Wallet account changed. Connect again to continue.');});};return subscribeWalletChanges(change);},[]);
 const busyRef=useRef(busy);busyRef.current=busy;
 useEffect(()=>{
  if(!modal)return;
  const previous=document.activeElement as HTMLElement|null;
  const dialog=document.querySelector<HTMLElement>('[role="dialog"]');
  const focusable=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary,textarea:not(:disabled),[tabindex="0"]')??[]).filter(el=>el.getClientRects().length>0);
  const target=modal==='create'?dialog?.querySelector<HTMLElement>('#dialog-title'):focusable().find(el=>['INPUT','SELECT'].includes(el.tagName))??focusable()[0];target?.focus();
  const close=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&!busyRef.current){setModal('');setKey('');setPassword('');}
   if(event.key==='Tab'){
    const elements=focusable(),first=elements[0],last=elements.at(-1);
    if(event.shiftKey&&(document.activeElement===first||!elements.includes(document.activeElement as HTMLElement))){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   }
  };
  document.addEventListener('keydown',close);return()=>{document.removeEventListener('keydown',close);previous?.focus();};
 },[modal]);
 function changeDialogField<K extends keyof DialogFields>(field:K,value:DialogFields[K]){const setters={name:setName,budget:setBudget,cap:setCap,chosen:setChosen,plan:setPlan,password:setPassword,amount:setAmount,key:setKey,accepted:setAccepted,backup:setBackup};(setters[field] as (v:DialogFields[K])=>void)(value);}
 async function submitDialog(){
  if(modal==='create'){await createCrew();return;}
  if(modal==='pause')await control('pause');
  else if(modal==='start')await control('resume');
  else if(modal==='renew')await renew();
  else if(modal==='approve')await approve();
  
  else if(modal==='close')await control('close');
  else if(modal==='key'){await api('/setup/ai',{key});setKey('');setNotice('AI service key saved privately. Choose your models in Settings.');}
  else if(modal==='restore'){const w=await restoreAccount(backup!,password);if(w.address.toLowerCase()!==detail.crew.account)throw Error('This backup belongs to another crew');setCrewWallet(w);setPassword('');setNotice('Crew account unlocked in this tab.');}
  else if(modal==='fund'||modal==='withdraw'){if(modal==='fund'){const {address,client}=await connect();if(address.toLowerCase()!==owner.toLowerCase())throw Error('Connect the owner wallet');await exchange(client).usdSend({destination:detail.crew.account,amount});}else await exchange(needWallet()).withdraw3({destination:owner as Hex,amount});setAmount('');setNotice('Transfer submitted to Hyperliquid.');}
  else if(modal==='revoke'){await exchange(needWallet()).approveAgent({agentAddress:'0x0000000000000000000000000000000000000000',agentName:agentName(selected)});setNotice('Agent revocation submitted.');}
  setModal('');
 }
 function createBot(preset?:{name:string;markets:string[]}){setName(preset?.name??'My crew');setChosen(preset?.markets??['HYPE']);setAccepted(false);setPassword('');setModal(owner?'create':'owner');}
 function openBot(id:string){setCrewTab('overview');selectedRef.current=id;setSelected(id);setView('crew');}
 function closeDialog(){if(busy)return;setModal('');setKey('');setPassword('');setBackup(null);setAmount('');}
 async function openAction(action:string,id:string,fundingAmount?:string){
  if(busy)return;
  if(action==='pay'){setView('tokens');return;}
  if(['account','positions','decision','activity'].includes(action)){setCrewTab(action==='account'?'account':action==='activity'?'activity':'overview');selectedRef.current=id;setSelected(id);setView(action==='positions'?'trading':'crew');return;}
  const allowed=['start','pause','fund','withdraw','restore','approve','renew','revoke','close','pay'];if(!allowed.includes(action))return;
  setBusy(true);setError('');
  try{const d=await api('/crews/'+id);selectedRef.current=id;setSelected(id);setDetail(d);setPassword('');setBackup(null);setAmount(action==='fund'?fundingAmount??'':'');
   if(action==='renew'){setName(d.crew.policy.name);setBudget(String(d.crew.policy.weeklyBudget));setCap(String(d.crew.policy.maxAccountValue));setChosen([...d.crew.policy.markets]);setPlan(d.crew.policy.plan);}
   setModal(action);
  }catch(e){setError((e as Error).message.slice(0,300));}finally{setBusy(false);}
 }
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn();await refresh();}catch(e){setError((e as Error).message.slice(0,300));}finally{setBusy(false);}}
 async function signIn(){const {address,client}=await connect();const {message}=await api('/auth/challenge',{address});const signature=await client.signMessage({message});await api('/auth/verify',{message,signature});setOwner(address);}
 async function createCrew(){const {address}=await connect();if(!owner)await signIn();if(owner&&owner.toLowerCase()!==address.toLowerCase())throw Error('Sign in with the wallet that will own this crew');if(!accepted)throw Error('Confirm that you saved your encrypted backup and understand live trading');const access=await api('/access');if(!access.eligible){setModal('');setView('access');throw Error('Review and accept the current access terms before creating a crew');}Policy.pick({name:true,markets:true,weeklyBudget:true,maxAccountValue:true,plan:true}).parse({name,markets:chosen,weeklyBudget:Number(budget),maxAccountValue:Number(cap),plan});const wallet=await newAccount(password);setPassword('');setCrewWallet(wallet);const now=Date.now();const p:Policy={v:1,network:'mainnet',owner:address,account:wallet.address.toLowerCase() as Hex,crewId:crypto.randomUUID(),name,markets:chosen,weeklyBudget:Number(budget),maxAccountValue:Number(cap),plan,generation:0,issuedAt:now,expiresAt:now+180*86400000,origin:cfg.origin};Policy.parse(p);const signature=await wallet.signMessage({message:policyMessage(p)});const r=await api('/crews',{policy:p,signature});selectedRef.current=r.id;setSelected(r.id);setModal('');setView('crew');setNotice('Crew account created. Save the downloaded encrypted backup before funding.');}
 function needWallet(){if(!detail||detail.crew.id!==selected)throw Error('Crew data is refreshing. Try again.');if(!crewWallet||crewWallet.address.toLowerCase()!==detail?.crew.account)throw Error('Unlock this crew’s encrypted wallet backup first');return crewWallet;}
 async function approve(){const wallet=needWallet();if(!detail.identity)throw Error('The signer must be running before agent approval');const verified=await api(`/crews/${selected}/attestation`);if(verified.agent.toLowerCase()!==detail.identity.agent.toLowerCase())throw Error('Verified agent changed; refresh before approving');await exchange(wallet).approveAgent({agentAddress:detail.identity.agent,agentName:`${agentName(selected)} valid_until ${detail.crew.policy.expiresAt}`});if(cfg.builder)await exchange(wallet).approveBuilderFee({builder:cfg.builder,maxFeeRate:'0.05%'});setNotice('Trading-agent approval submitted to Hyperliquid.');}
 async function control(action:'pause'|'resume'|'close'){if(!detail||detail.crew.id!==selected)throw Error('Crew data is refreshing. Try again.');const {address,client}=await connect();if(address!==owner)throw Error('Connect the owner wallet');const nonce=crypto.randomUUID(),issuedAt=Date.now();const signature=await client.signMessage({message:controlMessage(selected,action,nonce,hash(detail.crew.policy),issuedAt)});await api(`/crews/${selected}/control`,{action,nonce,issuedAt,signature});setNotice(`${action==='resume'?'Start':action==='pause'?'Stand down':'Close positions'} instruction signed and queued for the signer.`);}
 async function renew(){const wallet=needWallet(),now=Date.now();const policy=Policy.parse({...detail.crew.policy,name,markets:chosen,weeklyBudget:Number(budget),maxAccountValue:Number(cap),plan,generation:detail.crew.policy.generation+1,issuedAt:now,expiresAt:now+180*86400000});const signature=await wallet.signMessage({message:policyMessage(policy)});await api(`/crews/${selected}/renew`,{policy,signature});setNotice('New policy signed. Wait for the new enclave identity, then approve its new agent key and start the crew.');}

 
 const setup=[['HyperHive AI',cfg?.aiConfigured,cfg?.aiConfigured?'Key saved':'Add your private AI service key'],['Models',cfg?.models?.scout&&cfg?.models?.skeptic,'Choose Scout and Skeptic models'],['Database',cfg?.postgres,'Persistent Postgres connection'],[cfg?.signerMode==='local'?'Local signer':'Enclave',cfg?.services?.some((s:any)=>s.role==='signer'&&s.details?.mode===cfg?.signerMode&&Date.now()-s.updated_at<90000),cfg?.signerMode==='local'?'Agent keys on this Mac · no public port':'Phala signer and attestation'],['Token checkout',Boolean(cfg?.integrations?.tokenPayTo),'Operator receiving wallet configured'],['Trading',cfg?.liveEnabled,'Mainnet enabled · each bot still needs approval and Start']];
 const signerOnline=Boolean(cfg?.services?.some((s:any)=>s.role==='signer'&&s.details?.mode===cfg?.signerMode&&s.details?.liveEnabled&&Date.now()-s.updated_at<90000));
 return <WorkspaceShell operator={!!cfg?.localSetup} view={view} owner={owner} local={cfg?.signerMode==='local'} connected={connected} busy={busy} modalOpen={!!modal} crews={crews} onNavigate={setView} onWallet={()=>setModal('owner')} onCreate={()=>createBot()} onOpen={openBot} onAction={openAction}>
 {error&&<div role="alert" className="toast error">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}><UiClose size={18}/></button></div>}{notice&&<div role="status" className="toast">{notice}<button aria-label="Dismiss notification" onClick={()=>setNotice('')}><UiClose size={18}/></button></div>}
 <section className={'content '+(view==='trading'?'trading-content':'')}>{!connected&&!loading&&<div className="connection-warning" role="status">Connection interrupted. Balances may be out of date.<button onClick={()=>run(refresh)}>Reconnect</button></div>}
 {(view==='overview'||view==='bots')&&<Dashboard tour={!!cfg?.walkthrough} inspectDetail={detail} onInspect={setSelected} data={dashboard} owner={owner} loading={loading} live={!!cfg?.liveEnabled} local={cfg?.signerMode==='local'} signerOnline={signerOnline&&connected} busy={busy||!connected} onCreate={createBot} onWallet={()=>setModal('owner')} onOpen={openBot} onControl={(crew,action)=>openAction(action==='pause'?'pause':'start',crew.id)} onNavigate={setView} onSetup={()=>setView('setup')} mode={view} onAction={openAction}/>}
 {view==='trading'&&<TradingDesk onRefresh={()=>run(refresh)} markets={markets} data={dashboard} detail={detail} selected={selected} onSelect={setSelected} onAction={openAction} onOpen={openBot} onCreate={()=>createBot()} api={api} busy={busy||!connected} marketTime={marketTime} marketError={marketError}/>}
 {view==='activity'&&<ActivityPage data={dashboard} onOpen={openBot} onCreate={()=>createBot()} onTrading={()=>setView('trading')}/>}
 {view==='wallet'&&<WalletPage owner={owner} data={dashboard} onManage={()=>setModal('owner')} onOpen={id=>openAction('account',id)} onCreate={()=>createBot()}/>}
 {view==='crew'&&<CrewDetail api={api} onFund={value=>openAction('fund',selected,value)} onNavigate={setView} onRefresh={()=>run(refresh)} summary={dashboard?.bots.find(b=>b.crew.id===selected)} detail={detail} crews={crews} selected={selected} cfg={cfg} busy={busy} unlocked={!!crewWallet&&crewWallet.address.toLowerCase()===detail?.crew.account} onSelect={setSelected} onBack={()=>setView('bots')} onCreate={()=>createBot()} onModal={action=>openAction(action,selected)} onPause={()=>openAction('pause',selected)} onRenew={()=>openAction('renew',selected)} initialTab={crewTab}/>}
 {view==='cards'&&<TradeCards onNavigate={setView} activity={dashboard?.activity??[]} crews={crews} api={api} onOpen={openBot} onCreate={()=>createBot()}/>}
 {view==='policy'&&<RiskPage crews={crews} onOpen={openBot} onCreate={()=>createBot()} onAction={openAction}/>}
 {view==='records'&&<RecordsPage initialId={recordId} crews={crews} api={api} download={download} onNavigate={setView}/>}
 {['tokens','access','setup'].includes(view)&&detail?.crew?.paused&&<div className="continue-crew"><span>Setting up <b>{detail.crew.policy.name}</b></span><button onClick={()=>setView('crew')}>Continue crew setup <UiArrow size={15}/></button></div>}
 {view==='setup'&&<SettingsPage cfg={cfg} setup={setup} models={models} scout={scout} skeptic={skeptic} busy={busy} onKey={()=>setModal('key')} onCatalog={()=>run(async()=>{setModels((await api('/models')).models);})} onScout={setScout} onSkeptic={setSkeptic} onSave={()=>run(async()=>{await api('/setup/models',{scout,skeptic});setNotice('Model routing saved.');})} onNavigate={setView}/>}
 {(view==='tokens'||view==='plans')&&<PlansPage onConnect={()=>setModal('owner')} api={api} owner={owner} cfg={cfg} crews={crews} selected={selected} onSelect={setSelected} onAction={openAction} onCreate={()=>createBot()} onNavigate={setView}/>}
 {view==='checkout'&&<CheckoutSettings api={api} cfg={cfg} onBack={()=>setView('setup')}/>}
 {view==='integrations'&&<IntegrationsPage owner={owner} cfg={cfg} api={api} onNavigate={setView}/>}
 {view==='network'&&<NetworkPage cfg={cfg} api={api} onNavigate={setView} onRecord={id=>{setRecordId(id);setView('records');}}/>}
 {view==='hosted'&&<HostingPage api={api} cfg={cfg} onNavigate={setView}/>}
 {view==='deployment'&&<DeploymentPage api={api} owner={owner} cfg={cfg} onNavigate={setView}/>}
 {view==='access'&&<AccessPage key={owner} api={api} cfg={cfg} owner={owner} onNavigate={setView}/>}
 {view==='auditor'&&<AuditorPage api={api} owner={owner} onNavigate={setView}/>}
 <footer><span>HyperHive</span><div><a href="/risks">Risk & limits</a><a href="/privacy">Privacy</a><a href="/docs">Documentation</a></div></footer></section>
 {modal&&<div className="modal-backdrop" onClick={closeDialog}><section className={'modal '+(['create','renew'].includes(modal)?'crew-form':'')} data-kind={modal} role="dialog" aria-modal="true" aria-labelledby="dialog-title" onClick={e=>e.stopPropagation()}><button disabled={busy} className="modal-close" aria-label="Close dialog" onClick={closeDialog}><UiClose size={18}/></button>
 {modal==='owner'?<OwnerWallet onBusyChange={setBusy} onReady={async()=>{await signIn();await refresh();setNotice('Wallet connected.');}} onLocked={async()=>{refreshGeneration.current++;setCrewWallet(null);await api('/auth/logout',{});setOwner('');setDetail(null);setSelected('');setCrews([]);setDashboard(null);}}/>:
 <CrewDialogContent onCancel={closeDialog} kind={modal} fields={{name,budget,cap,chosen,plan,password,amount,key,accepted,backup}} change={changeDialogField} detail={detail} cfg={cfg} markets={markets} owner={owner} busy={busy} error={error} unlocked={!!crewWallet&&crewWallet.address.toLowerCase()===detail?.crew.account} onSubmit={()=>run(submitDialog)} onDirectClose={()=>run(async()=>{await emergencyClose(needWallet(),selected);setModal('');setNotice('Agent revoked and account confirmed flat on Hyperliquid.');})}/>}
 {modal!=='owner'&&busy&&<p role="status">Waiting for wallet or network…</p>}{modal!=='owner'&&error&&<p className="negative" role="alert">{error}</p>}
 </section></div>}
 </WorkspaceShell>;
}
