import React,{useEffect,useRef} from 'react';
import {Plus,Settings2,ChevronDown} from '../../ui/ProductIcons.js';

type Props={mode:'paper'|'mainnet';onMode:(mode:'paper'|'mainnet')=>void;onCreate:()=>void;hasBots:boolean;balance?:string;enabled?:number;count?:number};
/** Mode is always explicit; secondary account information stays on demand. */
export function TradingToolbar({mode,onMode,onCreate,hasBots,balance,enabled,count}:Props){
 const menu=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const close=(e:PointerEvent)=>{if(menu.current&&!menu.current.contains(e.target as Node))menu.current.open=false;};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[]);
 return <div className="tu-workbar-actions">
  <label className="tu-mode-select"><span className="tu-sr-only">Trading mode</span><select aria-label="Trading mode" value={mode} onChange={e=>onMode(e.target.value as 'paper'|'mainnet')}><option value="paper">Paper</option><option value="mainnet">Mainnet</option></select><ChevronDown size={13}/></label>
  <details ref={menu} className="tu-workmenu" onKeyDown={e=>{if(e.key==='Escape'&&menu.current){menu.current.open=false;menu.current.querySelector('summary')?.focus();}}}><summary aria-label="Workspace options"><Settings2 size={18}/></summary><div>
   {mode==='paper'?<p>Virtual funds · live market data</p>:<dl><div><dt>Crew balance</dt><dd>{balance??'—'}</dd></div><div><dt>Crews running</dt><dd>{enabled??'—'} / {count??'—'}</dd></div></dl>}
   {hasBots&&<button onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');onCreate();}}><Plus size={16}/>New crew</button>}
  </div></details>
 </div>;
}
