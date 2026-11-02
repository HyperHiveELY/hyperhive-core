import React,{useEffect,useRef,useState} from 'react';
import {CandlestickChart,Layers,ArrowLeft,ArrowRight,Check,LockKeyhole,ShieldCheck} from '../ui/ProductIcons.js';
import {Policy} from '../../../../packages/core/domain.js';
import {PasswordInput} from './PasswordInput.js';
import type {DialogFields} from './CrewDialogs.js';

type Props={fields:DialogFields;change:<K extends keyof DialogFields>(key:K,value:DialogFields[K])=>void;markets:any[];busy:boolean;onSubmit:()=>void;onCancel:()=>void};
const steps=['Markets','Limits','Review','Backup'];
const policyFields=Policy.pick({name:true,markets:true,weeklyBudget:true,maxAccountValue:true,plan:true});
export function CrewBuilder({fields:f,change,markets,busy,onSubmit,onCancel}:Props){
 const [step,setStep]=useState(0),[search,setSearch]=useState(''),[validation,setValidation]=useState('');
 const heading=useRef<HTMLHeadingElement>(null),previousStep=useRef(step);
 useEffect(()=>{if(previousStep.current!==step){heading.current?.focus();previousStep.current=step;}},[step]);
 useEffect(()=>setValidation(''),[f.name,f.chosen,f.budget,f.cap,f.plan]);
 const choices=Array.from(new Set([...f.chosen,...markets.map(m=>m.name)])) as string[];
 const validPolicy=()=>policyFields.extend({maxAccountValue:Policy.shape.maxAccountValue.min(10)}).safeParse({name:f.name,markets:f.chosen,weeklyBudget:Number(f.budget),maxAccountValue:Number(f.cap),plan:f.plan});
 function go(next:number){setValidation('');if(next>step){if(step===0&&(!f.name.trim()||!f.chosen.length||f.chosen.length>10)){setValidation('Name your crew and choose 1–10 markets.');return;}if(step>=1&&!validPolicy().success){setValidation('Use a positive risk budget up to 100,000 USDC and an account limit between 10 and 1,000,000 USDC.');return;}}setStep(next);}
 const usd=(n:string)=>Number(n).toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:2});
 return <div className="crew-builder">
  <div className="guided-eyebrow">New crew <span>Hyperliquid mainnet</span></div>
  <ol className="step-rail" aria-label="Create crew progress">{steps.map((label,i)=><li key={label} aria-current={step===i?'step':undefined} className={i<step?'complete':i===step?'current':''}><span>{i<step?<Check size={13}/>:i+1}</span>{label}</li>)}</ol>
  <div className="builder-stage">
   <h2 id="dialog-title" ref={heading} tabIndex={-1}>{['What will your crew trade?','Set trading limits.','Review your crew.','Save your account backup.'][step]}</h2>
   <p className="stage-intro">{['Choose the Hyperliquid markets your scouts will watch.','These limits become part of your signed policy.','Review the policy before creating your trading account.','Your encrypted backup is the way back into this wallet.'][step]}</p>
   <fieldset disabled={busy}>
   {step===0&&<>
    <div className="market-presets" aria-label="Market presets">{[{label:'Hyperliquid',caption:'HYPE',coins:['HYPE']},{label:'The majors',caption:'BTC + ETH',coins:['BTC','ETH']}].map(p=><button key={p.label} aria-pressed={p.coins.length===f.chosen.length&&p.coins.every(c=>f.chosen.includes(c))} onClick={()=>change('chosen',p.coins)}><span className="coin-symbol">{p.coins[0]==='HYPE'?<CandlestickChart size={23}/>:<Layers size={23}/>}</span><span><b>{p.label}</b><small>{p.caption}</small></span><Check size={16}/></button>)}</div>
    <details className="guided-disclosure"><summary>All Hyperliquid markets <span>{f.chosen.length} selected</span></summary><input aria-label="Search markets" placeholder="Search markets" value={search} onChange={e=>setSearch(e.target.value)}/><div className="market-chips">{choices.filter(m=>m.toLowerCase().includes(search.toLowerCase())).map(m=><button key={m} aria-pressed={f.chosen.includes(m)} className={f.chosen.includes(m)?'chosen':''} disabled={!f.chosen.includes(m)&&f.chosen.length>=10} onClick={()=>change('chosen',f.chosen.includes(m)?f.chosen.filter(x=>x!==m):[...f.chosen,m])}>{m}{f.chosen.includes(m)&&<Check size={12}/>}</button>)}</div></details>
    <div className="builder-selection">Watching <b>{f.chosen.join(' · ')||'No markets selected'}</b></div>
    <label>Crew name<input value={f.name} maxLength={40} onChange={e=>change('name',e.target.value)} placeholder="Name your crew"/></label>
   </>}
   {step===1&&<>
    <div className="limit-fields"><label>Weekly risk budget <span className="input-unit"><input type="number" min="0.01" max="100000" step="any" value={f.budget} onChange={e=>change('budget',e.target.value)}/><span>USDC</span></span><small>Used to size trades. Losses can exceed this budget.</small></label><label>Maximum account value <span className="input-unit"><input type="number" min="10" max="1000000" step="any" value={f.cap} onChange={e=>change('cap',e.target.value)}/><span>USDC</span></span><small>New entries stop above this balance.</small></label></div>
    <div className="configuration-choice" aria-label="Crew configuration">{(['crew','pro'] as const).map(p=><button key={p} aria-pressed={f.plan===p} onClick={()=>change('plan',p)}><b>{p==='crew'?'3 scouts':'5 scouts'}</b><small>{p==='crew'?'Crew':'Crew Pro'}</small>{f.plan===p&&<Check size={15}/>}</button>)}</div><small className="muted">AI scans use Tokens. More scouts can use more Tokens.</small>
   </>}
   {step===2&&<div className="builder-review"><div className="builder-review-name"><ShieldCheck size={24}/><div><h3>{f.name}</h3><span>{f.chosen.join(' · ')}</span></div></div>{[['Markets',f.chosen.join(' · '),0],['Weekly risk budget',usd(f.budget),1],['Account limit',usd(f.cap),1],['Scouts',f.plan==='crew'?'3 scouts':'5 scouts',1]].map(([label,value,target])=><div className="review-line" key={label}><span>{label}</span><b>{value}</b><button aria-label={'Edit '+label} onClick={()=>go(Number(target))}>Edit</button></div>)}<div className="review-line"><span>Policy duration</span><b>180 days</b></div><p>Creation signs your policy. Trading starts only after funding, agent approval and a separate Start confirmation.</p></div>}
   {step===3&&<><div className="backup-cue"><LockKeyhole size={22}/><span><b>Only you hold the backup password.</b><small>HyperHive cannot recover it.</small></span></div><label>Encrypted backup password<PasswordInput value={f.password} autoComplete="new-password" placeholder="At least 12 characters" onChange={e=>change('password',e.target.value)}/></label><label className="checkbox"><input type="checkbox" checked={f.accepted} onChange={e=>change('accepted',e.target.checked)}/>I will save the encrypted backup and password. This crew uses real funds; losses can exceed the risk budget.</label><div className="builder-selection"><span>{f.name}</span><b>{f.chosen.join(' · ')}</b></div></>}
   </fieldset>
   {validation&&<p className="negative" role="alert">{validation}</p>}
  </div>
  <div className="builder-footer"><button disabled={busy} onClick={()=>step?go(step-1):onCancel}>{step?<><ArrowLeft size={15}/>Back</>:'Cancel'}</button><span>{step+1} / {steps.length}</span>{step<3?<button className="primary" disabled={busy} onClick={()=>go(step+1)}>{step===2?'Secure account':'Continue'}<ArrowRight size={15}/></button>:<button className="primary" disabled={busy||!f.accepted||f.password.length<12||!validPolicy().success} onClick={onSubmit}>{busy?'Creating…':'Create account & download backup'}</button>}</div>
 </div>;
}
