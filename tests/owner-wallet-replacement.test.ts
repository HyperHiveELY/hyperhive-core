import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createOwnerWallet,archivedOwnerWallets,ownerWalletStatus,lockOwnerWallet} from '../apps/web/src/wallet.js';
import {decryptWallet} from '../apps/web/src/wallet-crypto.js';
const key='hyperhive.owner.encrypted.v1';
const old=JSON.stringify({format:'hyperhive-wallet-v2',purpose:'owner',address:'0x'+'11'.repeat(20),ciphertext:'original encrypted data'});
let values:Map<string,string>,failArchive=false;
beforeEach(()=>{
 values=new Map([[key,old]]);failArchive=false;
 vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{if(failArchive&&k.startsWith('hyperhive.owner.archived.'))throw Error('Storage full');values.set(k,v);},key:(i:number)=>[...values.keys()][i]??null,get length(){return values.size;}});
 vi.stubGlobal('window',new EventTarget());
 vi.stubGlobal('document',{createElement:()=>({click:vi.fn()})});
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:test');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
});
afterEach(()=>{lockOwnerWallet();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('keeps the old backup byte-for-byte and creates a distinct encrypted wallet',async()=>{
 const address=await createOwnerWallet('test-only password for fresh wallet',{preserveExisting:true});
 expect(address.toLowerCase()).not.toBe(JSON.parse(old).address);
 const archives=archivedOwnerWallets();expect(archives).toHaveLength(1);expect(values.get(archives[0].id)).toBe(old);
 const fresh=JSON.parse(values.get(key)!);expect((await decryptWallet(fresh,'test-only password for fresh wallet')).address).toBe(address);
 expect(ownerWalletStatus()).toMatchObject({saved:true,unlocked:true,address});
});
it('does not overwrite implicitly or after a password/backup storage failure',async()=>{
 await expect(createOwnerWallet('test-only password')).rejects.toThrow('already exists');
 await expect(createOwnerWallet('short',{preserveExisting:true})).rejects.toThrow('12');
 failArchive=true;await expect(createOwnerWallet('test-only password',{preserveExisting:true})).rejects.toThrow('Storage full');
 expect(values.get(key)).toBe(old);expect(archivedOwnerWallets()).toHaveLength(0);expect(ownerWalletStatus().unlocked).toBe(false);
});
