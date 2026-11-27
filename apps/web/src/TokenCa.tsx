import React,{useEffect,useState} from 'react';
import {useFlags} from './flags.js';
import './token-ca.css';

/** Copyable $HHIV contract address. Renders nothing until TOKEN_CA is set on the server. */
export function TokenCa({tone='light',className=''}:{tone?:'light'|'dark';className?:string}){
 const {tokenCa}=useFlags(),[copied,setCopied]=useState(false);
 useEffect(()=>{if(!copied)return;const t=setTimeout(()=>setCopied(false),1600);return()=>clearTimeout(t);},[copied]);
 if(!tokenCa)return null;
 const fallback=()=>{const t=document.createElement('textarea');t.value=tokenCa;t.setAttribute('readonly','');t.style.position='fixed';t.style.opacity='0';document.body.append(t);t.select();try{document.execCommand('copy');}finally{t.remove();}};
 const copy=()=>{
  // Never wait on the clipboard permission before confirming: start the write, fall back if it is refused.
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(tokenCa).catch(fallback);else fallback();
  setCopied(true);
 };
 return <button type="button" className={`token-ca token-ca--${tone} ${className}`} onClick={copy} title={tokenCa} aria-label={`Copy the $HHIV contract address, ${tokenCa}`}>
  <span className="token-ca__label">$HHIV CA</span>
  <code className="token-ca__address">{tokenCa.length>14?`${tokenCa.slice(0,6)}…${tokenCa.slice(-4)}`:tokenCa}</code>
  <span className="token-ca__action" aria-live="polite">{copied?'Copied':'Copy'}</span>
 </button>;
}
