import {TradingMarketPicker} from './TradingMarketPicker.js';
import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,LockKeyhole,ShieldCheck} from '../ui/ProductIcons.js';
import {Policy} from '../../../../packages/core/domain.js';
import {PasswordInput} from './PasswordInput.js';
import type {DialogFields} from './CrewDialogs.js';

type Props={fields:DialogFields;change:<K extends keyof DialogFields>(key:K,value:DialogFields[K])=>void;markets:any[];busy:boolean;onSubmit:()=>void;onCancel:()=>void;editing?:boolean;flat?:boolean;unlocked?:boolean;onUnlock?:()=>void};

const policyFields=Policy.pick({name:true,markets:true,weeklyBudget:true,maxAccountValue:true,plan:true});
export function CrewBuilder({fields:f,change,markets,busy,onSubmit,onCancel,editing=false,flat=true,unlocked=false,onUnlock}:Props){
 const steps=editing?['Markets','Limits','Review']:['Markets','Limits','Review','Backup'];
 const limit=f.plan==='pro'?30:10,available=new Set(markets.map(m=>m.name));
 const marketsValid=f.chosen.length>0&&f.chosen.length<=limit&&f.chosen.every(c=>available.has(c));
 const [step,setStep]=useState(0),[validation,setValidation]=useState('');
 const heading=useRef<HTMLHeadingElement>(null),previousStep=useRef(step);
 useEffect(()=>{if(previousStep.current!==step){heading.current?.focus();previousStep.current=step;}},[step]);
 useEffect(()=>setValidation(''),[f.name,f.chosen,f.budget,f.cap,f.plan]);
 const validPolicy=()=>policyFields.extend({maxAccountValue:Policy.shape.maxAccountValue.min(10)}).safeParse({name:f.name,markets:f.chosen,weeklyBudget:Number(f.budget),maxAccountValue:Number(f.cap),plan:f.plan});
 function go(next:number){setValidation('');if(next>step){if(step===0&&(!f.name.trim()||!marketsValid)){setValidation(`Name your crew and choose 1–${limit} available markets.`);return;}if(step>=1&&!marketsValid){setValidation(`Choose 1–${limit} available markets. Go back to adjust your selection.`);return;}if(step>=1&&!validPolicy().success){setValidation('Use a positive risk budget up to 100,000 USDC and an account limit between 10 and 1,000,000 USDC.');return;}}setStep(next);}
 const usd=(n:string)=>Number(n).toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:2});
 return <div className="crew-builder">
  <div className="guided-eyebrow">{editing?'Trading rules':'New crew'} <span>Hyperliquid mainnet</span></div>
  <ol className="step-rail" aria-label={editing?"Trading rules progress":"Create crew progress"}>{steps.map((label,i)=><li key={label} aria-current={step===i?'step':undefined} className={i<step?'complete':i===step?'current':''}><span>{i<step?<Check size={13}/>:i+1}</span>{label}</li>)}</ol>
  <div className="builder-stage">
   <h2 id="dialog-title" ref={heading} tabIndex={-1}>{['What will your crew trade?','Set trading limits.','Review your crew.','Save your account backup.'][step]}</h2>
   <p className="stage-intro">{['Choose the Hyperliquid markets your scouts will watch.','These limits become part of your signed policy.',editing?'Review the new policy before signing.':'Review the policy before creating your trading account.','Your encrypted backup is the way back into this wallet.'][step]}</p>
   <fieldset disabled={busy}>
   {step===0&&<>
    <TradingMarketPicker markets={markets} chosen={f.chosen} limit={limit} onChange={value=>change('chosen',value)}/>
    <details className="rename-crew"><summary>Crew name · {f.name}</summary><label>Crew name<input value={f.name} maxLength={40} onChange={e=>change('name',e.target.value)} placeholder="Name your crew"/></label></details>
   </>}
   {step===1&&<>
    <div className="limit-fields"><label>Weekly risk budget <span className="input-unit"><input type="number" min="0.01" max="100000" step="any" value={f.budget} onChange={e=>change('budget',e.target.value)}/><span>USDC</span></span><small>Used to size trades. Losses can exceed this budget.</small></label><label>Maximum account value <span className="input-unit"><input type="number" min="10" max="1000000" step="any" value={f.cap} onChange={e=>change('cap',e.target.value)}/><span>USDC</span></span><small>New entries stop above this balance.</small></label></div>
    <div className="configuration-choice" aria-label="Crew configuration">{(['crew','pro'] as const).map(p=><button key={p} aria-pressed={f.plan===p} onClick={()=>change('plan',p)}><b>{p==='crew'?'3 scouts':'5 scouts'}</b><small>{p==='crew'?'Up to 10 markets':'Up to 30 markets'}</small>{f.plan===p&&<Check size={15}/>}</button>)}</div><small className="muted">AI scans use Tokens. More scouts can use more Tokens.</small>
   </>}
   {step===2&&<div className="builder-review"><div className="builder-review-name"><ShieldCheck size={24}/><div><h3>{f.name}</h3><span>{f.chosen.join(' · ')}</span></div></div>{[['Markets',f.chosen.join(' · '),0],['Weekly risk budget',usd(f.budget),1],['Account limit',usd(f.cap),1],['Scouts',f.plan==='crew'?'3 scouts':'5 scouts',1]].map(([label,value,target])=><div className="review-line" key={label}><span>{label}</span><b>{value}</b><button aria-label={'Edit '+label} onClick={()=>go(Number(target))}>Edit</button></div>)}<div className="review-line"><span>Policy duration</span><b>180 days</b></div><p>{editing?'Signing replaces your policy and pauses new entries. Approve the new agent, then choose Start when you’re ready.':'Creation signs your policy. Trading starts only after funding, agent approval and a separate Start confirmation.'}</p>{editing&&!flat&&<p className="negative">Close existing positions and cancel open orders before changing trading rules.</p>}{editing&&!unlocked&&<div className="policy-unlock"><h3>Unlock your crew wallet to sign.</h3><p>Use this crew’s encrypted backup. Your password stays in the app.</p><label>Encrypted backup<input type="file" accept=".json,application/json" onChange={e=>change('backup',e.target.files?.[0]??null)}/></label><label>Backup password<PasswordInput value={f.password} autoComplete="current-password" onChange={e=>change('password',e.target.value)}/></label><button type="button" disabled={busy||!f.backup||!f.password} onClick={onUnlock}><LockKeyhole size={15}/>Unlock crew wallet</button></div>}</div>}
   {step===3&&<><div className="backup-cue"><LockKeyhole size={22}/><span><b>Only you hold the backup password.</b><small>HyperHive cannot recover it.</small></span></div><label>Encrypted backup password<PasswordInput value={f.password} autoComplete="new-password" placeholder="At least 12 characters" onChange={e=>change('password',e.target.value)}/></label><label className="checkbox"><input type="checkbox" checked={f.accepted} onChange={e=>change('accepted',e.target.checked)}/>I will save the encrypted backup and password. This crew uses real funds; losses can exceed the risk budget.</label><div className="builder-selection"><span>{f.name}</span><b>{f.chosen.join(' · ')}</b></div></>}
   </fieldset>
   {validation&&<p className="negative" role="alert">{validation}</p>}
  </div>
  <div className="builder-footer"><button disabled={busy} onClick={()=>step?go(step-1):onCancel}>{step?<><ArrowLeft size={15}/>Back</>:'Cancel'}</button><span>{step+1} / {steps.length}</span>{step<steps.length-1?<button className="primary" disabled={busy} onClick={()=>go(step+1)}>{step===2?'Secure account':'Continue'}<ArrowRight size={15}/></button>:<button className="primary" disabled={busy||!marketsValid||!validPolicy().success||(editing?(!flat||!unlocked):(!f.accepted||f.password.length<12))} onClick={onSubmit}>{busy?'Waiting…':editing?'Sign trading rules':'Create account & download backup'}</button>}</div>
 </div>;
}
