import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import type {Hex} from 'viem';
const enc=new TextEncoder();
const b64=(b:Uint8Array)=>btoa(String.fromCharCode(...b));
const unb64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export interface WalletBackup {format:'hyperhive-wallet-v2';purpose:'owner'|'crew'|'treasury'|'exits';address:Hex;salt:string;iv:string;ciphertext:string}
async function derive(password:string,salt:Uint8Array){const base=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:salt as BufferSource,iterations:600000},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function createEncryptedWallet(password:string,purpose:'owner'|'crew'|'treasury'|'exits'){
 if(password.length<12||password.length>1024)throw Error('Use a password of 12–1024 characters');
 const secret=generatePrivateKey(),account=privateKeyToAccount(secret),salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const header={format:'hyperhive-wallet-v2' as const,purpose,address:account.address};
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(JSON.stringify(header))},await derive(password,salt),enc.encode(secret));
 const backup:WalletBackup={...header,salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(encrypted))};return {account,backup};
}
export async function decryptWallet(raw:unknown,password:string){
 const b=raw as WalletBackup;if(!b||!['hyperhive-wallet-v1','hyperhive-wallet-v2'].includes(b.format)||!/^0x[\da-fA-F]{40}$/.test(b.address)||![b.salt,b.iv,b.ciphertext].every(s=>typeof s==='string'&&s.length<200))throw Error('Invalid encrypted wallet backup');
 const salt=unb64(b.salt),iv=unb64(b.iv),ciphertext=unb64(b.ciphertext);if(salt.length!==16||iv.length!==12||ciphertext.length!==82)throw Error('Invalid encrypted wallet backup');
 let bytes:ArrayBuffer;
 try{bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv,...(b.format==='hyperhive-wallet-v2'?{additionalData:enc.encode(JSON.stringify({format:b.format,purpose:b.purpose,address:b.address}))}:{})},await derive(password,salt),ciphertext);}catch{throw Error('Incorrect password or damaged wallet backup');}
 const text=new TextDecoder().decode(bytes);if(!/^0x[\da-fA-F]{64}$/.test(text))throw Error('Invalid decrypted wallet');
 const account=privateKeyToAccount(text as Hex);if(account.address.toLowerCase()!==b.address.toLowerCase())throw Error('Backup address mismatch');new Uint8Array(bytes).fill(0);return account;
}
