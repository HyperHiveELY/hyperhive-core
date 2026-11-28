import {ArrowUpRight as UiExternal} from '../ui/ProductIcons.js';
import {destinationGroup} from './navigation.js';
import {TokenCa} from '../TokenCa.js';
import {ThemeToggle} from '../ThemeToggle.js';
import './hive-drop.css';
import React,{useEffect,useRef,useState} from 'react';
import {BrandMark,UserRound,ArrowUpRight,ChevronDown,Command,Globe,Menu,Search,X,Plus,CandlestickChart,Wallet,Layers,ShieldCheck,FileText,Activity,Settings,House,Sparkles,Pause,Play,ArrowUpFromLine,LockKeyhole,RefreshCw,Ban,Crosshair,Coins} from '../ui/ProductIcons.js';
import type {Crew} from '../../../../packages/core/domain.js';
import {CrewGlyph,crewVariant} from './Dashboard.js';

export const routes=[['overview','Home',House],['trading','Trading',CandlestickChart],['exits','Auto exits',Crosshair],['activity','Activity',Activity],['wallet','Wallet',Wallet],['setup','Settings',Settings]] as const;
const extras=[['checkout','Checkout administration'],['integrations','Integrations'],['network','Network'],['auditor','Auditor tools'],['deployment','Deployment'],['access','Access'],['hosted','Hosting']];
type Props={view:string;owner:string;local?:boolean;connected:boolean;busy:boolean;modalOpen?:boolean;crews:Crew[];onNavigate:(view:string)=>void;onWallet:()=>void;onCreate:()=>void;onOpen:(id:string)=>void;onAction:(action:string,id:string)=>void;children:React.ReactNode;preview?:boolean;operator?:boolean};
export function WorkspaceShell(p:Props){
 const [command,setCommand]=useState(false),[query,setQuery]=useState(''),[highlight,setHighlight]=useState(0),[profile,setProfile]=useState(false);
 const [dropReady,setDropReady]=useState(false);
 useEffect(()=>{let live=true;setDropReady(false);if(!p.owner||p.preview)return;async function refreshDrop(){try{const r=await fetch('/api/tokens',{credentials:'same-origin'});if(!r.ok)throw Error();const {hive}=await r.json();if(live)setDropReady(!!hive?.eligible&&!hive.error&&!hive.claimedThisWeek&&hive.budgetLeft>=hive.weeklyCredits);}catch{if(live)setDropReady(false);}}refreshDrop();const timer=setInterval(refreshDrop,60000);window.addEventListener('hyperhive-tokens-updated',refreshDrop);return()=>{live=false;clearInterval(timer);window.removeEventListener('hyperhive-tokens-updated',refreshDrop);};},[p.owner,p.preview]);
 const dropDot=dropReady?<span className="hive-drop-dot" role="img" aria-label="Free Tokens ready to claim" title="Free Tokens ready to claim"/>:null;
 const profileRoot=useRef<HTMLDivElement>(null),profileButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!profile)return;const close=(e:PointerEvent)=>{if(!profileRoot.current?.contains(e.target as Node))setProfile(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setProfile(false);profileButton.current?.focus();}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};},[profile]);
 useEffect(()=>setProfile(false),[p.view,p.modalOpen]);
 const search=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDivElement>(null);
 const navigate=(view:string)=>{p.onNavigate(view);};
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&!p.modalOpen){e.preventDefault();setCommand(v=>!v);}if(e.key==='Escape'){setCommand(false);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[p.modalOpen]);
 useEffect(()=>{if(!command)return;setQuery('');setHighlight(0);const previous=document.activeElement as HTMLElement;dialog.current?.querySelector('input')?.focus();return()=>previous?.focus();},[command]);
 const actionIcons=[CandlestickChart,Sparkles,ShieldCheck,Pause,Play,Wallet,ArrowUpFromLine,LockKeyhole,ShieldCheck,RefreshCw,Ban,Crosshair];
 const commands=[{label:'New crew',group:'Workspace',run:p.onCreate},{label:'Help / Docs',group:'Navigate',run:()=>location.assign('/docs')},...routes.map(([id,label,icon])=>({label,icon,group:'Navigate',run:()=>navigate(id)})),...[['models','AI models'],['tokens','AI Tokens'],['cards','Decisions'],['records','Trade records']].map(([id,label])=>({label,group:'Navigate',run:()=>navigate(id)})),...(p.operator||p.preview?extras:[]).map(([id,label])=>({label,group:'Navigate',run:()=>navigate(id)})),...p.crews.flatMap(c=>[{label:'Open '+c.policy.name,group:c.policy.markets.join(' · '),crew:c,run:()=>p.onOpen(c.id)},...['Positions','Inspect latest decision','Account & access','Pause crew','Start crew','Fund crew','Withdraw','Unlock account','Approve agent','Renew agent','Revoke agent','Close positions'].map((label,i)=>({label:label+' · '+c.policy.name,group:'Crew action',crew:c,icon:actionIcons[i],run:()=>p.onAction(['positions','decision','account','pause','start','fund','withdraw','restore','approve','renew','revoke','close'][i],c.id)}))])].filter(c=>(c.label+' '+c.group).toLowerCase().includes(query.toLowerCase())).slice(0,20);
 useEffect(()=>{if(command)document.getElementById('command-'+highlight)?.scrollIntoView({block:'nearest'});},[highlight,command]);
 const choose=(index:number)=>{const c=commands[index];if(c){setCommand(false);c.run();}};
 const group=destinationGroup(p.view);
 const sections=group==='activity'?[['activity','All activity'],['cards','Decisions'],['records','Trade records']]:group==='wallet'?[['wallet','Trading funds'],['tokens','AI Tokens']]:[];
 return <div className={'shell site-workspace'+(p.preview?' design-review-shell':'')}>
  <header className="site-header">
   <a className="site-brand" href="/dashboard" onClick={e=>{e.preventDefault();navigate('overview');}} aria-label="HyperHive home"><BrandMark/><span>HyperHive</span></a>
   <nav className="site-navigation" aria-label="Main navigation">{routes.map(([id,label,I])=><button key={id} aria-current={group===id?'page':undefined} onClick={()=>navigate(id)}><I size={17}/><span>{label}</span>{id==='wallet'&&dropDot}</button>)}</nav>
   <div className="site-utilities"><button ref={search} className="icon-button" onClick={()=>setCommand(true)} aria-label="Search HyperHive" data-global-search="true"><Search size={18}/></button><ThemeToggle/><TokenCa tone="dark"/><span className="site-network"><i className={'dot '+(!p.connected?'offline':'')}/>{p.preview?'Preview':'Hyperliquid'}</span><button className="wallet-button" aria-label={p.owner?'Manage connected wallet':'Connect wallet'} onClick={p.onWallet} disabled={p.busy}><Wallet size={16}/><span>{p.owner?p.owner.slice(0,6)+'…'+p.owner.slice(-4):<><span className="wallet-label-full">Connect wallet</span><span className="wallet-label-short">Connect</span></>}</span></button><div className="profile-control" ref={profileRoot}><button ref={profileButton} className="profile-button" aria-label="Account profile" aria-expanded={profile} aria-controls="account-profile" onClick={()=>setProfile(v=>!v)}><UserRound size={19}/></button>{profile&&<div className="profile-popover" id="account-profile"><div className="profile-mobile-contract"><TokenCa tone="dark"/></div><div className="profile-identity"><UserRound size={22}/><span>{p.owner?'Your account':'Welcome to HyperHive'}<small>{p.owner?p.owner.slice(0,8)+'…'+p.owner.slice(-6):'Connect a wallet to begin'}</small></span></div><button disabled={p.busy} onClick={()=>{setProfile(false);p.onWallet();}}><Wallet size={16}/>{p.owner?'Manage wallet':'Connect wallet'}</button><button onClick={()=>{setProfile(false);navigate('tokens');}}><Coins size={16}/>AI Tokens{dropDot}</button><button onClick={()=>{setProfile(false);navigate('setup');}}><Settings size={16}/>Settings</button><button onClick={()=>{setProfile(false);setCommand(true);}}><Search size={16}/>Search<kbd>⌘ K</kbd></button></div>}</div></div>
  </header>
  <main className="site-main">
   {!!sections.length&&<nav className="destination-tabs" aria-label={group==='wallet'?'Wallet sections':'Activity sections'}>{sections.map(([id,label])=><button key={id} aria-current={p.view===id||p.view==='plans'&&id==='tokens'?'page':undefined} onClick={()=>navigate(id)}>{label}{id==='tokens'&&dropDot}</button>)}</nav>}
   {p.children}
   <footer className="site-footer"><span><i className={'dot '+(!p.connected?'offline':'')}/>{p.preview?'Sample data':p.connected?(p.local?'Local connection · Mainnet':'Mainnet connected'):'Reconnecting'}</span><div><a href="/docs">Docs <UiExternal size={13} className="hh-inline-icon"/></a><a href="/">Website <UiExternal size={13} className="hh-inline-icon"/></a></div></footer>
  </main>
  {command&&<div className="command-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setCommand(false);}}>
   <div ref={dialog} className="command-dialog" role="dialog" aria-modal="true" aria-label="HyperHive commands" onKeyDown={e=>{
    if(e.key==='ArrowDown'){e.preventDefault();setHighlight(i=>Math.min(i+1,commands.length-1));}
    if(e.key==='ArrowUp'){e.preventDefault();setHighlight(i=>Math.max(i-1,0));}
    if(e.key==='Enter'){e.preventDefault();choose(highlight);}
    if(e.key==='Tab'){e.preventDefault();dialog.current?.querySelector('input')?.focus();}
   }}>
    <div className="command-input"><Search size={22}/><input autoFocus aria-label="Search commands" placeholder="Search pages, crews, and actions…" value={query} onChange={e=>{setQuery(e.target.value);setHighlight(0);}} role="combobox" aria-expanded="true" aria-controls="command-results" aria-activedescendant={commands[highlight]?'command-'+highlight:undefined}/><button onClick={()=>setCommand(false)} aria-label="Close commands"><kbd>esc</kbd></button></div>
    <div className="command-results" id="command-results" role="listbox">{commands.length?commands.map((c,i)=><React.Fragment key={c.label}>{(i===0||commands[i-1].group!==c.group)&&<div className="command-group">{c.group==='Crew action'?'Actions':'crew' in c?'Crew':c.group}</div>}<button id={'command-'+i} role="option" aria-selected={highlight===i} className={highlight===i?'selected':''} onMouseEnter={()=>setHighlight(i)} onClick={()=>choose(i)}>{'crew' in c&&c.group!=='Crew action'?<CrewGlyph variant={crewVariant((c.crew as Crew).id)}/>:React.createElement('icon' in c?c.icon:Command,{size:19})}<span>{'crew' in c&&query.toLowerCase().includes((c.crew as Crew).policy.name.toLowerCase())?c.label.replace(' · '+(c.crew as Crew).policy.name,''):c.label}{c.group!=='Crew action'&&<small>{c.group}</small>}</span><ArrowUpRight size={16}/></button></React.Fragment>):<div className="compact-empty">No matching commands</div>}</div>
    <div className="command-footer"><span><kbd>↑ ↓</kbd> Navigate</span><span><kbd>↵</kbd> Open</span><span>Trading actions require confirmation</span></div>
   </div>
  </div>}
 </div>;
}
