import {decryptWallet} from './wallet-crypto.js';
import {emergencyClose} from './wallet.js';

const form=document.querySelector<HTMLFormElement>('form')!;
const file=document.querySelector<HTMLInputElement>('#backup')!;
const password=document.querySelector<HTMLInputElement>('#password')!;
const status=document.querySelector<HTMLElement>('[role=status]')!;
const close=document.querySelector<HTMLButtonElement>('#close')!;
let unlocked:Awaited<ReturnType<typeof decryptWallet>>|undefined;
let running=false;
function lock(){
  unlocked=undefined;
  close.disabled=true;
}
form.addEventListener('input',()=>{lock();status.textContent='';});
form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(running)return;
  lock();
  const selected=file.files?.[0];
  if(!selected||selected.size>10000)return;
  running=true;
  file.disabled=password.disabled=true;
  try{
    const backup=JSON.parse(await selected.text());
    if(backup.format==='hyperhive-wallet-v2'&&backup.purpose!=='crew')throw Error('Select the crew wallet backup.');
    unlocked=await decryptWallet(backup,password.value);
    status.textContent='Crew account '+unlocked.address+'. Confirm this address before closing all positions.';
    close.disabled=false;
  }catch(e){status.textContent=(e as Error).message;}
  finally{password.value='';file.disabled=password.disabled=false;running=false;}
});
close.addEventListener('click',async()=>{
  if(!unlocked||running)return;
  const wallet=unlocked;
  lock();running=true;file.disabled=password.disabled=true;
  try{
    status.textContent='Checking agent permissions and positions on Hyperliquid…';
    await emergencyClose(wallet);
    status.textContent='Recovery complete for '+wallet.address+'. The account is flat and has no open orders.';
  }catch(e){status.textContent=(e as Error).message+' Unlock the backup again to retry.';}
  finally{running=false;file.disabled=password.disabled=false;}
});
