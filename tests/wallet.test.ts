import {it,expect} from 'vitest';
import {createEncryptedWallet,decryptWallet} from '../apps/web/src/wallet-crypto.js';
it('recovers a wallet from its encrypted backup without storing a plaintext private key',async()=>{
 const {account,backup}=await createEncryptedWallet('test password for encrypted wallet only','owner');const restored=await decryptWallet(backup,'test password for encrypted wallet only');expect(restored.address).toBe(account.address);expect(Object.keys(backup).sort()).toEqual(['address','ciphertext','format','iv','purpose','salt']);
 await expect(decryptWallet(backup,'wrong password')).rejects.toThrow('Incorrect password');await expect(decryptWallet({...backup,purpose:'crew'},'test password for encrypted wallet only')).rejects.toThrow('Incorrect password');
});
it('rejects weak passwords and malformed backups before decryption',async()=>{await expect(createEncryptedWallet('short','owner')).rejects.toThrow('12');await expect(decryptWallet({},'password')).rejects.toThrow('Invalid');});

it('keeps a receiving wallet recoverable with authenticated purpose and address',async()=>{const {account,backup}=await createEncryptedWallet('test-only receiving password','treasury');expect(backup.purpose).toBe('treasury');expect((await decryptWallet(backup,'test-only receiving password')).address).toBe(account.address);await expect(decryptWallet({...backup,purpose:'owner'},'test-only receiving password')).rejects.toThrow();});
