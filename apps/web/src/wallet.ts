import type {WalletProvider} from './wallet-providers.js';
import { createWalletClient,custom,http,type Hex } from 'viem';
import { privateKeyToAccount,generatePrivateKey,type PrivateKeyAccount } from 'viem/accounts';
import {base} from 'viem/chains';
import {CONTRACT_CHAIN_ID,contractChain} from '../../../packages/core/chain.js';
import { ExchangeClient,InfoClient,HttpTransport } from '@nktkas/hyperliquid';
import {formatPrice,formatSize} from '@nktkas/hyperliquid/utils';
import {agentName} from '../../../packages/core/agent-name.js';
import {orderResult} from '../../../packages/core/execution.js';
import {createEncryptedWallet,decryptWallet,type WalletBackup} from './wallet-crypto.js';
declare global {interface Window {ethereum?:any}}
let ownerAccount:PrivateKeyAccount|null=null;
let walletMode:'local'|'external'='local';
let externalProvider:WalletProvider|null=null,externalAddress:Hex|null=null,externalName='Browser wallet';
export function activeExternalWallet(){return walletMode==='external'&&externalProvider&&externalAddress?{address:externalAddress,name:externalName}:null;}
function setExternalProvider(provider:WalletProvider|null){externalProvider=provider;if(typeof window.dispatchEvent==='function')window.dispatchEvent(new Event('hyperhive:wallet-provider'));}
export function subscribeWalletChanges(change:()=>void){let provider:WalletProvider|null=null;const bind=()=>{provider?.removeListener?.('accountsChanged',change);provider?.removeListener?.('disconnect',change);provider=externalProvider;provider?.on?.('accountsChanged',change);provider?.on?.('disconnect',change);};bind();window.addEventListener?.('hyperhive:wallet-provider',bind);return()=>{window.removeEventListener?.('hyperhive:wallet-provider',bind);provider?.removeListener?.('accountsChanged',change);provider?.removeListener?.('disconnect',change);};}
export async function connectExternal(provider:WalletProvider|undefined=window.ethereum,name='Browser wallet'){if(!provider)throw Error('Choose an installed EVM wallet');const accounts=await provider.request({method:'eth_requestAccounts'});const address=accounts?.[0];if(typeof address!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(address))throw Error('Wallet did not provide an EVM account');ownerAccount=null;walletMode='external';externalAddress=address.toLowerCase() as Hex;externalName=name;setExternalProvider(provider);return {address:externalAddress,client:createWalletClient({account:externalAddress,transport:custom(provider)})};}
export function activeWalletMode(){return walletMode;}
const OWNER_STORAGE='hyperhive.owner.encrypted.v1';
export function ownerWalletStatus(){const raw=localStorage.getItem(OWNER_STORAGE);if(!raw)return {saved:false,unlocked:false,address:null};try{return {saved:true,unlocked:Boolean(ownerAccount),address:(JSON.parse(raw) as WalletBackup).address};}catch{return {saved:false,unlocked:false,address:null};}}
const OWNER_ARCHIVE='hyperhive.owner.archived.v1.';
export function archivedOwnerWallets(){
 const wallets:{id:string;address:string}[]=[];
 for(let i=0;i<localStorage.length;i++){const id=localStorage.key(i);if(!id?.startsWith(OWNER_ARCHIVE))continue;try{const b=JSON.parse(localStorage.getItem(id)!);if(/^0x[\da-fA-F]{40}$/.test(b.address))wallets.push({id,address:b.address});}catch{}}
 return wallets;
}
export function exportArchivedOwnerBackup(id:string){
 if(!id.startsWith(OWNER_ARCHIVE))throw Error('Invalid saved backup');
 const raw=localStorage.getItem(id);if(!raw)throw Error('Saved backup not found');
 const backup=JSON.parse(raw);download(`hyperhive-owner-${backup.address.slice(2,10)}-saved.json`,backup);
}
export async function createOwnerWallet(password:string,options:{preserveExisting?:boolean}={}){
 const previous=localStorage.getItem(OWNER_STORAGE);
 if(previous&&!options.preserveExisting)throw Error('An encrypted wallet already exists. Unlock it or create a new wallet while keeping its backup.');
 const {account,backup}=await createEncryptedWallet(password,'owner');
 // Encryption is asynchronous: never replace a wallet changed in another tab.
 if(localStorage.getItem(OWNER_STORAGE)!==previous)throw Error('Your saved wallet changed. Reopen wallet setup.');
 // Preserve the exact encrypted backup before selecting the new wallet. If
 // browser storage is full, fail without changing the active saved wallet.
 if(previous)localStorage.setItem(OWNER_ARCHIVE+crypto.randomUUID(),previous);
 localStorage.setItem(OWNER_STORAGE,JSON.stringify(backup));
 ownerAccount=account;walletMode='local';externalAddress=null;setExternalProvider(null);
 download(`hyperhive-owner-${account.address.slice(2,10)}.json`,backup);return account.address;
}
export async function unlockOwnerWallet(password:string,file?:File){
 if(file&&file.size>10000)throw Error('Invalid wallet backup');
 const raw=file?await file.text():localStorage.getItem(OWNER_STORAGE);if(!raw)throw Error('No saved wallet. Restore your encrypted backup.');
 const backup=JSON.parse(raw);if(backup.format==='hyperhive-wallet-v2'&&backup.purpose!=='owner')throw Error('Use your owner-wallet backup here. Crew and receiving-wallet backups have separate restore controls.');
 const account=await decryptWallet(backup,password);localStorage.setItem(OWNER_STORAGE,JSON.stringify(backup));ownerAccount=account;walletMode='local';externalAddress=null;setExternalProvider(null);return account.address;
}
export function lockOwnerWallet(){ownerAccount=null;externalAddress=null;walletMode='local';setExternalProvider(null);}
export function exportOwnerBackup(){const raw=localStorage.getItem(OWNER_STORAGE);if(!raw)throw Error('No saved wallet');const b=JSON.parse(raw);download(`hyperhive-owner-${b.address.slice(2,10)}.json`,b);}
export async function connect(){
 if(walletMode==='local'&&ownerAccount)return {address:ownerAccount.address.toLowerCase() as Hex,client:createWalletClient({account:ownerAccount,chain:contractChain,transport:http()})};
 if(walletMode==='local'&&localStorage.getItem(OWNER_STORAGE))throw Error('Unlock your built-in wallet using the wallet button first');
 const provider=externalProvider??window.ethereum;if(!provider)throw Error('Choose a wallet using the wallet button');const client=createWalletClient({transport:custom(provider)});const [address]=await client.requestAddresses();if(!address)throw Error('No wallet account selected');return {address:address.toLowerCase() as Hex,client:createWalletClient({account:address,transport:custom(provider)})};
}
export function exchange(wallet:PrivateKeyAccount|Awaited<ReturnType<typeof connect>>['client'],nonce?:number){return new ExchangeClient({transport:new HttpTransport({isTestnet:false}),wallet,signatureChainId:'0xa4b1',...(nonce===undefined?{}:{nonceManager:()=>nonce})});}
export async function payForTokens(invoice:{owner:string;pay_to:string;amount:string;nonce:number;expires_at:number}){
 if(Date.now()>=Number(invoice.expires_at))throw Error('This purchase expired. Check payment history before creating another.');
 const {address,client}=await connect();if(address!==invoice.owner.toLowerCase())throw Error('Connect the wallet that created this purchase');
 // Every retry uses exactly the same nonce, recipient and amount. A lost response
 // must never lead to a second debit with a new nonce.
 const payer=new ExchangeClient({transport:new HttpTransport({isTestnet:false}),wallet:client,signatureChainId:'0xa4b1',nonceManager:()=>Number(invoice.nonce)});
 await payer.usdSend({destination:invoice.pay_to as Hex,amount:invoice.amount});
}
export async function emergencyClose(wallet:PrivateKeyAccount,crewId?:string){
  const client=exchange(wallet),info=new InfoClient({transport:new HttpTransport({isTestnet:false})});
  // Stop the enclave's trading permission before closing, including when our server is unavailable.
  const activeNames=async()=>(await info.extraAgents({user:wallet.address}))
    .filter(a=>!a.validUntil||a.validUntil>Date.now()).map(a=>a.name.replace(/ valid_until [0-9]+$/,''));
  const names=crewId?[agentName(crewId)]:await activeNames();
  if(names.some(name=>!/^hh-[0-9a-f]{13}$/.test(name)))throw Error('Review the non-HyperHive agent on this account in Hyperliquid before recovery.');
  for(const name of new Set(names))await client.approveAgent({agentAddress:'0x0000000000000000000000000000000000000000',agentName:name});
  if(!crewId&&(await activeNames()).length)throw Error('Agent revocation is still pending. Retry after it is confirmed.');
  const meta=await info.meta();
  const asset=(coin:string)=>{const index=meta.universe.findIndex(m=>m.name===coin);if(index<0)throw Error(`Unknown market ${coin}`);return {index,...meta.universe[index]};};
  const resting=await info.frontendOpenOrders({user:wallet.address});
  const entries=resting.filter(o=>!o.reduceOnly).map(o=>({a:asset(o.coin).index,o:o.oid}));
  if(entries.length)await client.cancel({cancels:entries});
  const state=await info.clearinghouseState({user:wallet.address}),mids=await info.allMids();
  for(const {position:p} of state.assetPositions){
    if(+p.szi===0)continue;const m=asset(p.coin),buy=+p.szi<0,mark=Number(mids[p.coin]);
    if(!Number.isFinite(mark)||mark<=0)throw Error(`No reliable price for ${p.coin}; existing stops remain`);
    const r=await orderResult(()=>client.order({orders:[{a:m.index,b:buy,p:formatPrice(mark*(buy?1.005:.995),m.szDecimals),s:formatSize(Math.abs(+p.szi),m.szDecimals),r:true,t:{limit:{tif:'Ioc'}}}],grouping:'na'}),1);
    const result=r.response.data.statuses[0];if(typeof result==='object'&&'error' in result)throw Error(`Close rejected: ${result.error}`);
  }
  const remaining=await info.clearinghouseState({user:wallet.address});
  if(remaining.assetPositions.some(p=>+p.position.szi!==0))throw Error('Some positions remain after partial fills. Agent access is revoked; existing stops remain. Retry close.');
  const orders=await info.frontendOpenOrders({user:wallet.address});
  if(orders.length)await client.cancel({cancels:orders.map(o=>({a:asset(o.coin).index,o:o.oid}))});
  if((await info.frontendOpenOrders({user:wallet.address})).length)throw Error('Orders remain on the account. Retry recovery.');

}
export async function newAccount(password:string){
  const {account,backup}=await createEncryptedWallet(password,'crew');
  download(`hyperhive-wallet-${account.address.slice(2,10)}.json`,backup);return account;
}
export async function restoreAccount(file:File,password:string){
  if(file.size>10000)throw Error('Invalid wallet backup');return decryptWallet(JSON.parse(await file.text()),password);
}
export function download(name:string,data:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function chainWallet(chainId:typeof CONTRACT_CHAIN_ID|8453=CONTRACT_CHAIN_ID){
 const chain=chainId===CONTRACT_CHAIN_ID?contractChain:base;
 if(walletMode==='local'&&ownerAccount)return createWalletClient({account:ownerAccount,chain,transport:http()});
 const {address}=await connect();const provider=externalProvider??window.ethereum;if(!provider)throw Error('Reconnect your wallet');
 try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x'+chainId.toString(16)}]});}
 catch(e){if((e as any).code!==4902)throw e;await provider.request({method:'wallet_addEthereumChain',params:[{chainId:'0x'+chainId.toString(16),chainName:chain.name,nativeCurrency:chain.nativeCurrency,rpcUrls:[chain.rpcUrls.default.http[0]],blockExplorerUrls:[chain.blockExplorers!.default.url]}]});}
 if(Number(await provider.request({method:'eth_chainId'}))!==chainId)throw Error('Wallet is on the wrong network');
 const accounts=await provider.request({method:'eth_accounts'});if(accounts[0]?.toLowerCase()!==address)throw Error('Wallet account changed. Reconnect before signing.');
 return createWalletClient({account:address,chain,transport:custom(provider)});
}
export async function evmWallet(){return chainWallet(CONTRACT_CHAIN_ID);}
