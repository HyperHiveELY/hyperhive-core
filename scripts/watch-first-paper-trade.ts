import {Database} from '../packages/core/db.js';
import {readPaper,totals} from '../packages/paper/account.js';
import {appendFile,writeFile,mkdir} from 'node:fs/promises';
const id=process.argv[2];if(!id)throw Error('Crew ID required');
const db=await new Database().init();let cursor=0,first:any=null,observedAt=0,lastHealth='',stop=false;
process.on('SIGTERM',()=>{stop=true;});process.on('SIGINT',()=>{stop=true;});
await mkdir('output/first-paper-trade',{recursive:true});
const started=Date.now();const samples:any[]=[];
try{while(!stop){
 const a=await readPaper(db,id);const c=(await db.query<any>('SELECT paused FROM crews WHERE id=$1',[id])).rows[0];
 const health=(await db.query<any>("SELECT role,updated_at,details FROM heartbeats WHERE role IN ('paper','signer')")).rows;
 const signer=health.find(s=>s.role==='signer'),paper=health.find(s=>s.role==='paper');
 const state={mainnetPaused:c?.paused,globalLiveEntries:signer?.details?.liveEnabled,paperRunning:a?.running,paperHealthy:!!paper&&Date.now()-paper.updated_at<30000,error:a?.error??null};
 if(JSON.stringify(state)!==lastHealth){console.log(JSON.stringify({kind:'health',...state}));lastHealth=JSON.stringify(state);}
 const events=(await db.query<any>('SELECT id,kind,body,created_at FROM paper_events WHERE crew_id=$1 AND id>$2 ORDER BY id',[id,cursor])).rows;
 for(const e of events){cursor=Math.max(cursor,Number(e.id));if(e.kind==='entry'&&!first){first=e;observedAt=Date.now();console.log(JSON.stringify({kind:'FIRST_PAPER_ENTRY',...e}));}
  if(Number(e.created_at)>=started&&['decision','entry','exit','error','skipped'].includes(e.kind))console.log(JSON.stringify({kind:e.kind,id:e.id,time:e.created_at,strategy:e.body.strategy,verdict:e.body.verdict,reasons:e.body.reasons,body:['entry','exit','error','skipped'].includes(e.kind)?e.body:undefined}));
 }
 if(first&&a){const sample={at:Date.now(),account:totals(a),cash:a.cash,positions:a.positions};samples.push(sample);await appendFile('output/first-paper-trade/performance.ndjson',JSON.stringify(sample)+'\n');
  const decision=(await db.query<any>("SELECT body FROM paper_events WHERE crew_id=$1 AND kind='decision' AND (body->>'id'=$2 OR body->>'decision'=$2) LIMIT 1",[id,first.body.decision])).rows[0]?.body;
  await writeFile('output/first-paper-trade/first-trade.json',JSON.stringify({entry:first,decision,samples,safety:state},null,2));
  if(Date.now()-observedAt>=180000){console.log(JSON.stringify({kind:'EARLY_PERFORMANCE_READY',entry:first.body,latest:sample}));break;}
 }
 await new Promise(r=>setTimeout(r,15000));
}}finally{await db.close();}
