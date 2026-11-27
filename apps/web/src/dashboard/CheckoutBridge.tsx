import React,{useEffect,useState} from 'react';
import {formatEther,formatUnits,type Address} from 'viem';
import {ownerWalletStatus} from '../wallet.js';
import {bridgeKey,bridgeStatus,retrySignedBridge,reviewBridge,savedBridge,signBridge,type BridgeAsset,type BridgeQuote} from '../checkout-bridge.js';

export function CheckoutBridge({owner,usdc,onUnlock}:{owner:Address;usdc:number;onUnlock:()=>void}) {
  const [asset,setAsset]=useState<BridgeAsset>('USDC');
  const [quote,setQuote]=useState<BridgeQuote|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [record,setRecord]=useState(()=>savedBridge(owner,asset));
  useEffect(()=>{setRecord(savedBridge(owner,asset));setQuote(null);setMessage('');},[owner,asset,usdc]);
  const [expired,setExpired]=useState(false);
  useEffect(()=>{setExpired(false);if(!quote)return;const timer=setTimeout(()=>setExpired(true),Math.max(0,quote.expires-Date.now()));return()=>clearTimeout(timer);},[quote]);
  async function run(action:()=>Promise<void>) {
    setBusy(true);setMessage('');
    try {await action();} catch(e) {setMessage((e as Error).message);}
    finally {setRecord(savedBridge(owner,asset));setBusy(false);}
  }
  async function check() {
    if(!record) return;
    const status=await bridgeStatus(record);
    if(['success','refund','refunded','failed'].includes(status)) {
      const key=bridgeKey(owner,asset);
      if(savedBridge(owner,asset)?.hash===record.hash) localStorage.removeItem(key);
    }
    setMessage('Relay status: '+status+'.');
  }
  return <details className="guided-disclosure"><summary>Fund from Robinhood Chain ETH</summary>
    <p>Bridge to your built-in wallet on Elysium. After the funds arrive, confirm the USDC purchase separately.</p>
    <label>Receive on Elysium<select disabled={busy} value={asset} onChange={e=>setAsset(e.target.value as BridgeAsset)}>
      <option value="USDC">USDC for credits</option><option value="HYPE">HYPE for network fees</option></select></label>
    <label>Recipient and refund wallet<code className="wallet-address">{owner}</code></label>
    {record?<><p>Robinhood Chain transaction <a href={'https://robin.etherscan.io/tx/'+record.hash} target="_blank" rel="noreferrer">View receipt</a></p>
      <button disabled={busy} onClick={()=>run(check)}>Check bridge status</button>{record.signed&&record.expires&&Date.now()<record.expires&&<button disabled={busy} onClick={()=>run(async()=>{await retrySignedBridge(record);setMessage('Original signed transaction submitted.');})}>Retry original signed transfer</button>}</>:
      <><button disabled={busy} onClick={()=>run(async()=>{setQuote(null);setQuote(await reviewBridge(owner,asset,usdc));})}>{quote?'Refresh bridge quote':'Review bridge quote'}</button>
      {quote&&<><p>Relay delivers <b>{formatUnits(quote.amount,asset==='USDC'?6:18)} {asset}</b> on Elysium.</p>
        <div className="key-value"><span>Send on Robinhood Chain</span><b>{formatEther(quote.value)} ETH</b></div>
        <div className="key-value"><span>Maximum network fee</span><b>{formatEther(quote.maxFee)} ETH</b></div>
        <div className="key-value"><span>Maximum total debit</span><b>{formatEther(quote.value+quote.maxFee)} ETH</b></div>
        <label>Relay deposit contract<code className="wallet-address">{quote.to}</code></label>
        <small>Quote expires at {new Date(quote.expires).toLocaleTimeString()}. {expired?'Refresh to review the current amount.':''}</small>
        <button className="primary wide" disabled={busy||expired} onClick={()=>ownerWalletStatus().unlocked?run(async()=>{await signBridge(quote);setQuote(null);setMessage('Submitted to Robinhood Chain. Check bridge status for delivery.');}):onUnlock()}>{ownerWalletStatus().unlocked?'Sign bridge for '+asset:'Unlock wallet to sign'}</button></>}</>}
    {message&&<p role="status">{message}</p>}
  </details>;
}
