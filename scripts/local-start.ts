import {spawn,type ChildProcess} from 'node:child_process';
import {mkdir,open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {assertLocalConfig} from '../packages/core/local-mode.js';
assertLocalConfig();
// No shell, no public listener, no credentials in command arguments.
await mkdir('.data/logs',{recursive:true,mode:0o700});
const children=new Set<ChildProcess>(),timers=new Set<ReturnType<typeof setTimeout>>();let closing=false;
function stop(){if(closing)return;closing=true;for(const timer of timers)clearTimeout(timer);for(const child of children)child.kill('SIGTERM');}
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,stop);
for(const [role,args] of [['api',['--import','tsx','--env-file=.env','apps/api/main.ts']],['notifications',['--import','tsx','--env-file=.env','apps/worker/notifications.ts']],['paper',['--import','tsx','--env-file=.env','apps/paper/main.ts']],['worker',['--import','tsx','--env-file=.env','apps/worker/main.ts']],['signer',['--import','tsx','--env-file=.env','apps/signer/main.ts']],['web',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--strictPort']]] as const){
 let failures=0;
 const launch=async()=>{
  if(closing)return;
  const log=await open(`.data/logs/${role}.log`,'a',0o600),started=Date.now();
  const child=spawn(process.execPath,[...args],{cwd:resolve('.'),env:process.env,stdio:['ignore',log.fd,log.fd]});children.add(child);
  let scheduled=false;
  const restart=()=>{
   children.delete(child);if(closing||scheduled)return;scheduled=true;
   failures=Date.now()-started>60000?0:failures+1;
   const delay=Math.min(30000,1000*2**Math.min(failures,5));
   console.error(`${role} stopped. Restarting in ${delay/1000}s; see .data/logs/${role}.log. Other services remain running.`);
   const timer=setTimeout(()=>{timers.delete(timer);void launch().catch(()=>{console.error(`${role} restart failed. Restart the local stack.`);});},delay);timers.add(timer);
  };
  child.once('error',restart);child.once('exit',restart);await log.close();
 };
 await launch();
}
console.log('HyperHive local stack: http://localhost:5188/dashboard (live market data). Paper bots use virtual funds; mainnet bots require funding, agent approval and signed Start. Ctrl+C stops the stack.');
