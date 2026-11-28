import {InfoClient,HttpTransport} from '@nktkas/hyperliquid';
import {formatPrice} from '@nktkas/hyperliquid/utils';
import type {Hex} from 'viem';
import type {PrivateKeyAccount} from 'viem/accounts';
import {connect,exchange} from './wallet.js';
import {createEncryptedWallet,decryptWallet,type WalletBackup} from './wallet-crypto.js';
import {existingExits,exitKind,validateExitPrices,type ExitPosition,type ExitKind} from '../../../packages/core/auto-exits.js';
import {orderResult} from '../../../packages/core/execution.js';

const info=new InfoClient({transport:new HttpTransport({isTestnet:false,timeout:15000})});
const lifetime=180*86400000,agentName='HyperHive exits';
const key=(owner:string)=>'hyperhive.exits.agent.v1:'+owner.toLowerCase();
const journalKey=(owner:string)=>'hyperhive.exits.orders.v1:'+owner.toLowerCase();
interface SavedAgent {owner:string;expiresAt:number;backup:WalletBackup}
interface TrackedExit {coin:string;asset:number;cloid:Hex;kind:ExitKind;expiresAfter:number;oid?:number;pending:boolean}
let unlocked:{owner:string;account:PrivateKeyAccount}|null=null;
export function lockExitAgent(){unlocked=null;}
function readAgent(owner:string):SavedAgent|null{
 const raw=localStorage.getItem(key(owner));if(!raw)return null;
 const saved=JSON.parse(raw) as SavedAgent;
 if(saved.owner!==owner.toLowerCase()||saved.backup?.purpose!=='exits'||saved.backup.format!=='hyperhive-wallet-v2'||!Number.isFinite(saved.expiresAt)||saved.expiresAt>Date.now()+lifetime)throw Error('Saved auto exits access is invalid. Disconnect and reconnect it.');
 return saved;
}
export function exitAgentStatus(owner:string){const saved=readAgent(owner);return {saved:!!saved,expired:!!saved&&saved.expiresAt<=Date.now(),unlocked:!!saved&&unlocked?.owner===owner.toLowerCase()&&unlocked.account.address===saved.backup.address,expiresAt:saved?.expiresAt};}
export async function disconnectExitAgent(owner:string){return exclusive(owner,async()=>{lockExitAgent();localStorage.removeItem(key(owner));});}
function journal(owner:string):TrackedExit[]{
 const rows=JSON.parse(localStorage.getItem(journalKey(owner))??'[]') as TrackedExit[];
 if(!Array.isArray(rows)||rows.length>5000||rows.some(r=>!/^0x[\da-f]{32}$/.test(r.cloid)||!Number.isSafeInteger(r.asset)||r.asset<0||!['sl','tp'].includes(r.kind)||!Number.isFinite(r.expiresAfter)))throw Error('Saved exit order history is invalid. Check orders on Hyperliquid.');
 return rows;
}
function saveJournal(owner:string,rows:TrackedExit[]){localStorage.setItem(journalKey(owner),JSON.stringify(rows));}
export function trackedExitCount(owner:string){return journal(owner).length;}
async function assertOwner(owner:string,current:()=>boolean){
 if(!current())throw Error('Wallet changed. Reopen Auto exits.');
 const wallet=await connect();if(wallet.address.toLowerCase()!==owner.toLowerCase()||!current())throw Error('Connect the wallet shown on this page.');return wallet;
}
async function agent(owner:Hex,password:string,current:()=>boolean){
 await assertOwner(owner,current);
 let saved=readAgent(owner);
 if(!saved||saved.expiresAt<=Date.now()){
  const {account,backup}=await createEncryptedWallet(password,'exits');
  await assertOwner(owner,current);
  saved={owner:owner.toLowerCase(),expiresAt:Date.now()+lifetime-60000,backup};
  localStorage.setItem(key(owner),JSON.stringify(saved));unlocked={owner:owner.toLowerCase(),account};
 }
 if(unlocked?.owner!==owner.toLowerCase()||unlocked.account.address!==saved.backup.address){const account=await decryptWallet(saved.backup,password);await assertOwner(owner,current);unlocked={owner:owner.toLowerCase(),account};}
 const account=unlocked.account;
 const approved=(await info.extraAgents({user:owner})).find(a=>a.address.toLowerCase()===account.address.toLowerCase());
 if(!approved){
  const {client}=await assertOwner(owner,current);
  await exchange(client).approveAgent({agentAddress:account.address,agentName:`${agentName} valid_until ${saved.expiresAt}`});
 }
 const verified=(await info.extraAgents({user:owner})).find(a=>a.address.toLowerCase()===account.address.toLowerCase());
 if(!verified||verified.validUntil===null||verified.validUntil<=Date.now()||verified.validUntil>saved.expiresAt||verified.validUntil>Date.now()+lifetime)throw Error('Auto exits approval is not confirmed. Refresh and try again.');
 await assertOwner(owner,current);return account;
}
/** Serialize this owner's writes across tabs, including nonce use and local journal updates. */
function exclusive<T>(owner:string,run:()=>Promise<T>){
 if(!navigator.locks)throw Error('Auto exits needs a browser with secure tab locking. Open an updated browser.');
 return navigator.locks.request('hyperhive-exits:'+owner.toLowerCase(),{mode:'exclusive',ifAvailable:true},lock=>{if(!lock)throw Error('Auto exits is busy in another tab. Wait for it to finish.');return run();});
}
/** Reconcile uncertain submissions before a retry; never infer rejection from a network error. */
async function reconcile(owner:Hex){
 const rows=journal(owner),keep:TrackedExit[]=[];
 for(const row of rows){
  if(!row.pending){keep.push(row);continue;}
  const status=await info.orderStatus({user:owner,oid:row.cloid});
  if(status.status==='unknownOid'){
   if(Date.now()<=row.expiresAfter+5000)throw Error('An earlier order is still being checked. Wait 35 seconds, then refresh.');
  }else if(status.order.status==='open'){keep.push({...row,pending:false,oid:status.order.order.oid});}
  else if(status.order.status==='triggered')throw Error('An exit is triggering now. Refresh after it finishes.');
 }
 saveJournal(owner,keep);return keep;
}
export interface ExitEdit {coin:string;stop:number|null;tp:number|null;position:ExitPosition}
export interface ExitOutcome {orders:{coin:string;oid:number;cloid:string}[];issues:string[]}
/** Place only missing exits after re-reading positions, triggers and marks directly from the venue. */
export async function placeAutoExits(owner:Hex,password:string,edits:ExitEdit[],current:()=>boolean=()=>true):Promise<ExitOutcome>{
 return exclusive(owner,async()=>{
  const account=await agent(owner,password,current);await reconcile(owner);
  const outcome:ExitOutcome={orders:[],issues:[]};
  for(const edit of edits){
   await assertOwner(owner,current);
   const [state,open,[meta,contexts]]=await Promise.all([info.clearinghouseState({user:owner}),info.frontendOpenOrders({user:owner}),info.metaAndAssetCtxs()]);
   const position=state.assetPositions.find(x=>x.position.coin===edit.coin&&Number(x.position.szi)!==0)?.position;
   if(!position){outcome.issues.push(`${edit.coin}: position is now closed.`);continue;}
   const side=Number(position.szi)>0?'long':'short',asset=meta.universe.findIndex(m=>m.name===edit.coin),size=Math.abs(Number(position.szi));
   if(side!==edit.position.side||size!==edit.position.size||Number(position.entryPx)!==edit.position.entry||asset<0){outcome.issues.push(`${edit.coin}: position changed. Refresh and review the new numbers.`);continue;}
   const existing=existingExits(position,open),sl=existing.sl.length?null:edit.stop,tp=existing.tp.length?null:edit.tp;
   if(sl===null&&tp===null)continue;
   // A missing order-list entry is not proof that a previously accepted exit ended.
   let settling=false;
   for(const row of journal(owner).filter(r=>r.coin===edit.coin&&(r.kind==='sl'?sl!==null:tp!==null))){
    const status=await info.orderStatus({user:owner,oid:row.cloid});
    if(status.status==='unknownOid'||status.order.status==='open'||status.order.status==='triggered')settling=true;
   }
   if(settling){outcome.issues.push(`${edit.coin}: an earlier exit is still being checked. Refresh before retrying.`);continue;}
   const mark=Number(contexts[asset].markPx),liquidation=position.liquidationPx===null||Number(position.liquidationPx)===0?null:Number(position.liquidationPx),decimals=meta.universe[asset].szDecimals;
   try{
    validateExitPrices({side,mark,liquidation},sl,tp);
    if([sl,tp].some(p=>p!==null&&Number(formatPrice(p,decimals))!==p))throw Error('Round the edited prices to the market price step.');
   }catch(e){outcome.issues.push(`${edit.coin}: ${(e as Error).message}`);continue;}
   const expiresAfter=Date.now()+30000;
   const orders=([['sl',sl],['tp',tp]] as const).filter((x):x is readonly [ExitKind,number]=>x[1]!==null).map(([kind,price])=>({a:asset,b:side==='short',p:formatPrice(price*(side==='short'?1.1:.9),decimals),s:'0',r:true,t:{trigger:{isMarket:true,triggerPx:formatPrice(price,decimals),tpsl:kind}},c:('0x'+crypto.randomUUID().replaceAll('-','')) as Hex}));
   // Zero size with positionTpsl follows the whole position at trigger time.
   const rows=journal(owner),pending=orders.map(o=>({coin:edit.coin,asset,cloid:o.c,kind:o.t.trigger.tpsl,expiresAfter,pending:true}));
   await assertOwner(owner,current);saveJournal(owner,[...rows,...pending]);
   try{
    const result=await orderResult(()=>exchange(account).order({orders,grouping:'positionTpsl'},{expiresAfter}),orders.length);
    const accepted:TrackedExit[]=[];
    result.response.data.statuses.forEach((status,i)=>{
     if(typeof status==='object'&&'error' in status){outcome.issues.push(`${edit.coin}: ${status.error}`);return;}
     if(typeof status==='object'&&'resting' in status){accepted.push({...pending[i],pending:false,oid:status.resting.oid});outcome.orders.push({coin:edit.coin,oid:status.resting.oid,cloid:orders[i].c});}
     else {accepted.push(pending[i]);outcome.issues.push(`${edit.coin}: order needs a fresh status check.`);}
    });
    saveJournal(owner,[...rows,...accepted]);
   }catch{outcome.issues.push(`${edit.coin}: order status is uncertain. Refresh before retrying.`);break;}
  }
  return outcome;
 });
}
/** Cancel only client IDs journaled by this browser; leave manually placed triggers alone. */
export async function removeAutoExits(owner:Hex,password:string,current:()=>boolean=()=>true){
 return exclusive(owner,async()=>{
  const account=await agent(owner,password,current),rows=await reconcile(owner);
  const open=await info.frontendOpenOrders({user:owner}),ours=rows.filter(r=>open.some(o=>o.coin===r.coin&&o.cloid===r.cloid&&exitKind(o)));
  if(ours.length){await assertOwner(owner,current);await exchange(account).cancelByCloid({cancels:ours.map(r=>({asset:r.asset,cloid:r.cloid}))},{expiresAfter:Date.now()+30000});}
  const remaining=await info.frontendOpenOrders({user:owner});
  saveJournal(owner,rows.filter(r=>remaining.some(o=>o.cloid===r.cloid)));
  if(journal(owner).length)throw Error('Some auto exits are still open. Refresh and try again.');
  return ours.length;
 });
}
