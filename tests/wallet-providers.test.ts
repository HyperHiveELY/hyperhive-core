import {afterEach,expect,it,vi} from 'vitest';
import {discoverWallets,providerBrand,type WalletChoice} from '../apps/web/src/wallet-providers.js';
const address='0x1111111111111111111111111111111111111111';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
function browser(){const target=new EventTarget() as EventTarget&{ethereum?:any;phantom?:any};vi.stubGlobal('window',target);const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});return target;}
function announce(target:EventTarget,provider:any,info:any){target.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{provider,info}}));}
it('discovers multiple wallets without prompting and removes its listener on cleanup',()=>{
 vi.useFakeTimers();const target=browser();let choices:WalletChoice[]=[];const meta={request:vi.fn(),isMetaMask:true},rabby={request:vi.fn(),isMetaMask:true,isRabby:true},phantom={request:vi.fn(),isPhantom:true};target.ethereum={...meta,providers:[meta,rabby]};target.phantom={ethereum:phantom};
 const cleanup=discoverWallets(v=>choices=v,target as unknown as Window);announce(target,meta,{uuid:'m',rdns:'io.metamask',name:'MetaMask'});vi.advanceTimersByTime(500);
 expect(choices.find(w=>w.id==='metamask')?.provider).toBe(meta);expect(choices.find(w=>w.id==='rabby')?.provider).toBe(rabby);expect(choices.find(w=>w.id==='phantom')?.provider).toBe(phantom);expect(choices.filter(w=>w.provider===meta)).toHaveLength(1);expect(choices.filter(w=>w.provider)).toHaveLength(3);expect(meta.request).not.toHaveBeenCalled();expect(phantom.request).not.toHaveBeenCalled();
 const before=choices.length;cleanup();announce(target,{request:vi.fn()},{uuid:'late',name:'Late'});expect(choices).toHaveLength(before);expect(providerBrand(rabby)).toBe('rabby');
});
it('accepts announced wallets and ignores unsafe remote icon URLs',()=>{
 const target=browser();let choices:WalletChoice[]=[];target.addEventListener('eip6963:requestProvider',()=>announce(target,{request:vi.fn()},{uuid:'custom',name:'Custom wallet',icon:'https://tracking.invalid/icon.svg'}));
 const cleanup=discoverWallets(v=>choices=v,target as unknown as Window);expect(choices.find(w=>w.id==='custom')?.icon).toBe('');expect(choices.filter(w=>!w.provider)).toHaveLength(4);cleanup();
});
it('uses the selected provider for accounts and chain switching, not the default extension',async()=>{
 vi.resetModules();const target=browser();target.ethereum={request:vi.fn()};const selected={request:vi.fn(async({method}:any)=>method==='eth_requestAccounts'||method==='eth_accounts'?[address]:method==='eth_chainId'?'0x1863d':null)};const wallet=await import('../apps/web/src/wallet.js');
 await wallet.connectExternal(selected,'Phantom');expect(wallet.activeExternalWallet()).toEqual({address,name:'Phantom'});expect((await wallet.connect()).address).toBe(address);const client=await wallet.chainWallet(99901);expect(client.account.address).toBe(address);expect(selected.request).toHaveBeenCalledWith({method:'wallet_switchEthereumChain',params:[{chainId:'0x1863d'}]});expect(target.ethereum.request).not.toHaveBeenCalled();wallet.lockOwnerWallet();
});
it('preserves the current wallet when another connection is rejected or invalid',async()=>{
 vi.resetModules();browser();const wallet=await import('../apps/web/src/wallet.js');await wallet.connectExternal({request:async()=>[address]},'Rabby');
 await expect(wallet.connectExternal({request:async()=>{throw Error('User rejected');}},'MetaMask')).rejects.toThrow('User rejected');expect(wallet.activeExternalWallet()?.name).toBe('Rabby');await expect(wallet.connectExternal({request:async()=>['not an EVM address']},'Phantom')).rejects.toThrow('EVM');expect(wallet.activeExternalWallet()?.name).toBe('Rabby');wallet.lockOwnerWallet();
});
it('moves account and disconnect listeners to the selected wallet and cleans up',async()=>{
 vi.resetModules();browser();const wallet=await import('../apps/web/src/wallet.js');const a={request:async()=>[address],on:vi.fn(),removeListener:vi.fn()},b={request:async()=>[address],on:vi.fn(),removeListener:vi.fn()},change=vi.fn();const stop=wallet.subscribeWalletChanges(change);
 await wallet.connectExternal(a,'A');expect(a.on).toHaveBeenCalledWith('accountsChanged',change);await wallet.connectExternal(b,'B');expect(a.removeListener).toHaveBeenCalledWith('accountsChanged',change);expect(b.on).toHaveBeenCalledWith('disconnect',change);stop();expect(b.removeListener).toHaveBeenCalledWith('disconnect',change);wallet.lockOwnerWallet();expect(wallet.activeExternalWallet()).toBeNull();
});
it('refuses a provider that stays on HyperEVM after an Elysium switch request',async()=>{
 vi.resetModules();browser();const wallet=await import('../apps/web/src/wallet.js');
 await wallet.connectExternal({request:async({method}:any)=>method==='eth_chainId'?'0x3e7':method==='eth_accounts'||method==='eth_requestAccounts'?[address]:null},'Test wallet');
 await expect(wallet.chainWallet(99901)).rejects.toThrow();wallet.lockOwnerWallet();
});
