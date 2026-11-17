export type WalletProvider={request:(args:any)=>Promise<any>;on?:(event:string,fn:(...args:any[])=>void)=>void;removeListener?:(event:string,fn:(...args:any[])=>void)=>void;isMetaMask?:boolean;isRabby?:boolean;isPhantom?:boolean;isCoinbaseWallet?:boolean;providers?:WalletProvider[]};
export type WalletChoice={id:string;name:string;icon:string;install?:string;provider?:WalletProvider};
export const walletBrands=[
 {id:'metamask',name:'MetaMask',icon:'/wallets/metamask.svg',install:'https://metamask.io/download/'},
 {id:'phantom',name:'Phantom',icon:'/wallets/phantom.svg',install:'https://phantom.com/download'},
 {id:'rabby',name:'Rabby',icon:'/wallets/rabby.svg',install:'https://rabby.io/'},
 {id:'coinbase',name:'Coinbase Wallet',icon:'/wallets/coinbase.svg',install:'https://www.coinbase.com/wallet/downloads'},
] as const;
export function providerBrand(p:WalletProvider){return p.isPhantom?'phantom':p.isRabby?'rabby':p.isCoinbaseWallet?'coinbase':p.isMetaMask?'metamask':null;}
// Discovery never requests accounts or signatures. Announced metadata is display-only.
export function discoverWallets(onChange:(wallets:WalletChoice[])=>void,target:Window=window){
 const found:WalletChoice[]=[];const seen=new Set<WalletProvider>();
 const publish=()=>onChange([...walletBrands.map(b=>({...b,...found.find(w=>w.id===b.id)})),...found.filter(w=>!walletBrands.some(b=>b.id===w.id))]);
 function add(p:WalletProvider|undefined,info?:{uuid?:string;name?:string;icon?:string;rdns?:string},hint?:string){
  if(!p||typeof p.request!=='function'||seen.has(p))return;seen.add(p);
  const rdns=info?.rdns;const claimed=rdns==='io.metamask'?'metamask':rdns==='app.phantom'?'phantom':rdns==='io.rabby'?'rabby':rdns==='com.coinbase.wallet'?'coinbase':null;
  const brandId=hint??claimed??providerBrand(p),brand=walletBrands.find(b=>b.id===brandId);
  const id=brand&&!found.some(w=>w.id===brand.id)?brand.id:info?.uuid??'injected-'+found.length;
  const icon=brand?.icon??(info?.icon?.startsWith('data:image/')&&info.icon.length<100000?info.icon:'');
  found.push({id,name:brand?.name??info?.name?.slice(0,60)??'Browser wallet',icon,provider:p});publish();
 }
 const announce=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.info&&detail?.provider)add(detail.provider,detail.info);};
 target.addEventListener('eip6963:announceProvider',announce);
 target.dispatchEvent(new Event('eip6963:requestProvider'));
 const legacy=()=>{const w=target as any;add(w.phantom?.ethereum,undefined,'phantom');const providers=w.ethereum?.providers;if(Array.isArray(providers)&&providers.length){for(const p of providers)add(p);}else add(w.ethereum);publish();};
 legacy();const timer=setTimeout(legacy,500);
 return ()=>{clearTimeout(timer);target.removeEventListener('eip6963:announceProvider',announce);};
}
