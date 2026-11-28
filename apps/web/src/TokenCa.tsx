import React,{useEffect,useState} from 'react';
import {useFlags} from './flags.js';
import './token-ca.css';
/** Copyable $HIVE contract address. Until TOKEN_CA is set on the server it shows an empty, disabled field
 *  (or nothing, with hideEmpty), and becomes copyable as soon as the address is published. */
export function TokenCa({tone='light',className='',hideEmpty=false,label='$HIVE CA'}:{tone?:'light'|'dark';className?:string;hideEmpty?:boolean;label?:string}){
 const {tokenCa}=useFlags(),[copied,setCopied]=useState(false);
 useEffect(()=>{if(!copied)return;const t=setTimeout(()=>setCopied(false),1600);return()=>clearTimeout(t);},[copied]);
 if(!tokenCa){
  if(hideEmpty)return null;
  return <button type="button" disabled className={`token-ca token-ca--${tone} token-ca--empty ${className}`} aria-label="$HIVE contract address, not published yet">
   <span className="token-ca__label">{label}</span><span className="token-ca__short" aria-hidden="true">CA</span>
   <code className="token-ca__address">Coming soon</code>
   <span className="token-ca__action">Copy</span>
  </button>;
 }
 const fallback=()=>{const t=document.createElement('textarea');t.value=tokenCa;t.setAttribute('readonly','');t.style.position='fixed';t.style.opacity='0';document.body.append(t);t.select();try{document.execCommand('copy');}finally{t.remove();}};
 const copy=()=>{
  // Never wait on the clipboard permission before confirming: start the write, fall back if it is refused.
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(tokenCa).catch(fallback);else fallback();
  setCopied(true);
 };
 return <button type="button" className={`token-ca token-ca--${tone} ${className}`} onClick={copy} title={tokenCa} aria-label={`Copy the $HIVE contract address, ${tokenCa}`}>
  <span className="token-ca__label">{label}</span><span className="token-ca__short" aria-hidden="true">CA</span>
  <code className="token-ca__address">{tokenCa.length>14?`${tokenCa.slice(0,6)}…${tokenCa.slice(-4)}`:tokenCa}</code>
  <span className="token-ca__action" aria-live="polite">{copied?'Copied':'Copy'}</span>
 </button>;
}
