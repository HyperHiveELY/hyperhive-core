import {X as UiClose} from '../ui/ProductIcons.js';
// DEV-only customer-journey recording fixture. No network, keys, or signing handlers.
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Dashboard,ActivityPage,WalletPage} from './Dashboard.js';
import {CrewDetail} from './CrewDetail.js';
import {WorkspaceShell} from './WorkspaceShell.js';
import {TradingDesk} from './TradingDesk.js';
import {TradeCards,RiskPage,RecordsPage} from './ResearchPages.js';
import {TokensPage} from './TokensPage.js';
import {WalletForm} from './WalletForm.js';
import {CrewDialogContent,type DialogFields} from './CrewDialogs.js';
import type {Crew} from '../../../../packages/core/domain.js';
import type {BotSummary,DashboardData} from '../../../../packages/core/dashboard-view.js';
import './theme.css';

const ownerAddress='0x0000000000000000000000000000000000000001';
const accountAddress='0x0000000000000000000000000000000000000002';
const agentAddress='0x0000000000000000000000000000000000000003';
const receivingAddress='0x0000000000000000000000000000000000000004';
const markets=[{name:'HYPE',markPx:'40',prevDayPx:'39.5',dayNtlVlm:'10000000',funding:'.00001',openInterest:'40000'},{name:'BTC',markPx:'100800',prevDayPx:'98760',dayNtlVlm:'1843000000',funding:'.000012',openInterest:'21650'},{name:'ETH',markPx:'3451',prevDayPx:'3490',dayNtlVlm:'824000000',funding:'.000008',openInterest:'85420'},{name:'SOL',markPx:'157.25',prevDayPx:'152.1',dayNtlVlm:'324000000',funding:'.000019',openInterest:'943000'}];
const cfg={designPreview:true,signerMode:'local',localSetup:false,liveEnabled:true,aiConfigured:true,models:{scout:'HyperHive Scout',skeptic:'HyperHive Skeptic'},integrations:{tokenPayTo:receivingAddress},services:[{role:'signer',updated_at:Date.now(),details:{mode:'local'}}]};
const initialFields:DialogFields={name:'My crew',budget:'300',cap:'15000',chosen:['HYPE'],plan:'crew',password:'',amount:'50',key:'',accepted:false,backup:null};

export default function WalkthroughReview(){
 const [view,setView]=useState('overview'),[modal,setModal]=useState(''),[owner,setOwner]=useState(''),[crew,setCrew]=useState<Crew|null>(null),[funds,setFunds]=useState(0),[approved,setApproved]=useState(false),[scanned,setScanned]=useState(false),[fields,setFields]=useState(initialFields),[repeat,setRepeat]=useState(''),[busy,setBusy]=useState(false),[tab,setTab]=useState<'overview'|'account'|'activity'>('overview');
 const [tokenVersion,setTokenVersion]=useState(0);
 const ledger=useRef<any>({available:0,reserved:0,usage:[],invoices:[]});
 const snapshot=useRef<any>(null);
 const now=Date.now();
 const checks=['access','policy','ai','worker','signer','identity','funded','margin','cap','agent','journal','record','tokens','metering'].map((id,i)=>({id,label:['Current access confirmed','Signed policy is valid','HyperHive AI is configured','AI worker is running','Local signer is running','Agent identity verified','Trading account funded','Free margin available','Balance within account limit','Agent approved on Hyperliquid','No unresolved orders','Execution record intact','Tokens available for AI scans','Usage metering ready'][i],ok:id==='funded'||id==='margin'?funds>=10:id==='agent'?approved:id==='tokens'?ledger.current.available>0:true}));
 const card=scanned&&crew?{id:'walkthrough-card',created_at:now-15000,body:{model:'HyperHive Scout',skepticModel:'HyperHive Skeptic',card:{market:'HYPE',side:'long',invalidationPx:38,horizonH:12,why:'Example setup: price is testing a recent range high, but follow-through is uncertain.'},timings:{scout:{startedAt:now-17000,finishedAt:now-15500}}},evidence:{scout:'HyperHive Scout',skeptic:'HyperHive Skeptic'},verdict:{verdict:'KILL',reasons:['Insufficient confirmation for a new entry. Preserve available risk budget.']},status:'REJECTED'}:null;
 const summary:BotSummary|null=crew?{crew,identityReady:true,equity:funds,available:funds,pnl:0,exposure:0,positionCount:0,riskUsed:0,error:null,histories:{},positions:[]}:null;
 const detail=crew?{crew,identity:{agent:agentAddress},orders:[],positions:[],state:{marginSummary:{accountValue:String(funds)},assetPositions:[]},readiness:{ready:checks.every(c=>c.ok),checks},budget:{spent:0},record:{status:'LOCAL_SIGNED',matched:0},cards:card?[card]:[],steps:card?[{card_id:card.id,step:'skeptic',started_at:now-15500,finished_at:now-15000}]:[],events:scanned?[{id:'example-scan',kind:'stand_down',message:'Example scan complete. No order placed.',created_at:now-15000}]:[]}:null;
 snapshot.current=detail;
 const data:DashboardData={bots:summary?[summary]:[],updatedAt:now,activity:card&&crew?[{id:card.id,crewId:crew.id,botName:crew.policy.name,kind:'idea',title:'HYPE long · rejected',message:card.body.card.why,reason:card.verdict.reasons[0],time:card.created_at,status:'REJECTED'}]:[]};
 const api=useCallback(async(path:string,body?:any):Promise<any>=>{
  if(path==='/tokens/pricing')return {tokensPerUsdc:1000,markupBps:2500,payTo:receivingAddress,checkoutReady:true,elysiumCheckoutReady:true,meteringReady:true,minimumUsdc:5,maximumUsdc:500};
  if(path==='/tokens')return structuredClone(ledger.current);
  if(path==='/tokens/invoices'&&body){const invoice={id:'walkthrough-invoice',owner:ownerAddress,amount:String(body.amount),units:body.amount*1000000,pay_to:receivingAddress,nonce:Date.now(),created_at:Date.now(),expires_at:Date.now()+900000,status:'OPEN',tx:null};ledger.current.invoices=[invoice];return {...invoice};}
  if(path==='/tokens/invoices/walkthrough-invoice/confirm'){const invoice=ledger.current.invoices[0];if(invoice.status!=='PAID'){invoice.status='PAID';invoice.tx='0x'+'00'.repeat(32);ledger.current.available+=invoice.units/1000;setTokenVersion(v=>v+1);}return {...invoice};}
  if(body!==undefined)throw Error('This recording fixture cannot submit actions.');
  if(path.startsWith('/crews/'))return snapshot.current;
  if(path==='/records')return {records:[]};
  if(path.includes('/chart'))return {candles:Array.from({length:72},(_,i)=>{const o=39.4+i*.008+Math.sin(i*.35)*.08,c=o+Math.sin(i*1.3)*.05;return {t:Date.now()-(71-i)*3600000,o:String(o),c:String(c),h:String(Math.max(o,c)+.04),l:String(Math.min(o,c)-.04),v:String(80+i*3)};})};
  throw Error('Unimplemented recording fixture request: '+path);
 },[]);
 useEffect(()=>{window.scrollTo({top:0});},[view]);
 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setModal('');};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
 function change<K extends keyof DialogFields>(key:K,value:DialogFields[K]){setFields(f=>({...f,[key]:value}));}
 function open(){setTab('overview');setView('crew');}
 function create(){setFields({...initialFields});setModal('create');}
 function wallet(){setFields(f=>({...f,password:'',accepted:false}));setRepeat('');setModal(owner?'wallet':'wallet-create');}
 function action(name:string){if(['account','decision','activity','positions'].includes(name)){setTab(name==='account'?'account':name==='activity'?'activity':'overview');setView(name==='positions'?'trading':'crew');}else setModal(name==='resume'?'start':name);}
 async function submit(){
  setBusy(true);await new Promise(r=>setTimeout(r,600));
  if(modal==='wallet-create')setOwner(ownerAddress);
  if(modal==='create'){
   const issuedAt=Date.now();setCrew({id:'walkthrough-hype',owner:ownerAddress,account:accountAddress,signature:'',created_at:issuedAt,paid_until:0,paused:true,broken_since:null,policy:{v:1,network:'mainnet',owner:ownerAddress,account:accountAddress,crewId:'walkthrough-hype',name:fields.name,markets:fields.chosen,weeklyBudget:Number(fields.budget),maxAccountValue:Number(fields.cap),plan:fields.plan,generation:0,issuedAt,expiresAt:issuedAt+180*86400000,origin:location.origin}});setView('crew');
  }
  if(modal==='fund')setFunds(Number(fields.amount));
  if(modal==='approve')setApproved(true);
  if(modal==='start'){setCrew(c=>c?{...c,paused:false}:c);setTimeout(()=>{setScanned(true);ledger.current.available-=3.4;ledger.current.usage=[{id:'demo-usage',crew_id:'walkthrough-hype',model:'HyperHive/Scout',reserved:12500,charged:3400,status:'SETTLED',created_at:Date.now()}];setTokenVersion(v=>v+1);},4500);}
  if(modal==='pause')setCrew(c=>c?{...c,paused:true}:c);
  setModal('');setBusy(false);
 }
 const crews=crew?[crew]:[];
 return <WorkspaceShell preview local view={view} owner={owner} connected busy={busy} modalOpen={!!modal} crews={crews} onNavigate={setView} onWallet={wallet} onCreate={create} onOpen={open} onAction={action}>
  <section className="content" data-recording-version={tokenVersion}>
   {(view==='overview'||view==='bots')&&<Dashboard data={data} owner={owner} loading={false} live local signerOnline busy={busy} onCreate={create} onWallet={wallet} onOpen={open} onControl={(_,a)=>action(a)} onNavigate={setView} onSetup={()=>setView('overview')} mode={view} onAction={action} inspectDetail={detail} onInspect={()=>{}}/>}
   {view==='crew'&&summary&&<CrewDetail summary={summary} detail={detail} crews={crews} selected={crew!.id} cfg={cfg} busy={busy} unlocked onSelect={open} onBack={()=>setView('bots')} onCreate={create} onModal={action} onPause={()=>action('pause')} onRenew={()=>action('renew')} onNavigate={setView} onRefresh={()=>{}} initialTab={tab}/>}
   {view==='tokens'&&<TokensPage api={api} owner={owner} cfg={cfg} onConnect={wallet} previewPayment={async()=>{await new Promise(r=>setTimeout(r,700));}}/>}
   {view==='trading'&&<TradingDesk markets={markets} data={data} detail={detail} selected={crew?.id??''} onSelect={open} onAction={action} onOpen={open} onCreate={create} api={api} busy={false} marketTime={now}/>}
   {view==='cards'&&<TradeCards onNavigate={setView} activity={data.activity} crews={crews} api={api} onOpen={open} onCreate={create}/>}
   {view==='activity'&&<ActivityPage data={data} onOpen={open}/>}
   {view==='policy'&&<RiskPage crews={crews} onOpen={open} onCreate={create} onAction={action}/>}
   {view==='wallet'&&<WalletPage owner={owner} data={data} onManage={wallet} onOpen={open}/>}
   {view==='records'&&<RecordsPage crews={crews} api={api} download={()=>{}} onNavigate={setView}/>}
  </section>
  <div style={{position:'fixed',bottom:12,left:16,zIndex:1000,padding:'6px 10px',background:'var(--wl-surface,#151719)',border:'1px solid var(--wl-border,#44484b)',borderRadius:6,fontSize:11,color:'var(--wl-muted,#c4c9ca)',pointerEvents:'none'}}>Simulated session · No real transactions</div>
  {modal&&<div className="modal-backdrop"><section className={'modal '+(modal==='create'?'crew-form':'')} role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button className="modal-close" aria-label="Close dialog" onClick={()=>setModal('')}><UiClose size={18}/></button><span className="eyebrow">DEMO · EXAMPLE ACCOUNT</span>{modal.startsWith('wallet')?<WalletForm mode={modal==='wallet'?'unlocked':'create'} address={owner||null} password={fields.password} repeat={repeat} saved={fields.accepted} file={null} busy={busy} hasExternal onPassword={v=>change('password',v)} onRepeat={setRepeat} onSaved={v=>change('accepted',v)} onFile={()=>{}} onSubmit={submit} onRestore={()=>{}} onExternal={()=>{}} onCopy={()=>{}} onExport={()=>{}} onLock={()=>{setOwner('');setModal('');}}/>:<CrewDialogContent kind={modal} fields={fields} change={change} detail={detail} cfg={cfg} markets={markets} owner={owner} busy={busy} error="" unlocked onSubmit={submit} onDirectClose={()=>{}} onCancel={()=>setModal('')}/>}</section></div>}
 </WorkspaceShell>;
}
