/** Explicit synthetic smoke test. Uses the configured AI models and real daily billing
 * budget, but never writes paper/live orders or decisions to the user's account. */
import {writeFile,mkdir} from 'node:fs/promises';
import {Database} from '../packages/core/db.js';
import type {Crew} from '../packages/core/domain.js';
import {analyzePaper} from '../packages/paper/review.js';
import {initialPaper,openPaper,markPaper} from '../packages/paper/account.js';
import {HOUR,strategyEvidence,type PaperSnapshot} from '../packages/paper/strategies.js';
import {assertLocalConfig} from '../packages/core/local-mode.js';
import {atr} from '../packages/eko/indicators.js';
assertLocalConfig();
const id=process.argv[2];if(!id)throw Error('Supply the existing paper crew ID');
const db=await new Database().init();
try{
 const c=(await db.query<Crew>('SELECT c.* FROM crews c JOIN paper_accounts p ON p.crew_id=c.id WHERE c.id=$1 AND c.paused=true',[id])).rows[0];if(!c)throw Error('A paused mainnet crew with a paper account is required');
 const now=Date.now(),hourly=Array.from({length:80},(_,i)=>{const close=54.15+.15*i;return {time:(Math.floor(now/HOUR)*HOUR-(80-i)*HOUR)/1000,open:close-.1,high:close+.5,low:close-.5,close,volume:1000};});
 const m:PaperSnapshot={market:c.policy.markets[0],asset:0,mark:66,atr:atr(hourly).at(-1)!,rv:.3,oiUsd:100000000,szDecimals:2,maxLeverage:10,funding:0,timestamp:now,closes:hourly.map(c=>c.close),hourly};
 if(!strategyEvidence(m,'trend').eligible.length)throw Error('Synthetic test fixture has no trend signal');
 const review=await analyzePaper(db,c,[m],'trend'),state={...initialPaper(),running:true};
 let entry:unknown=null,exits:unknown=[];
 if(review.verdict==='PASS'&&review.card){entry=openPaper(state,c,review.card,{...m,timestamp:Date.now()},review.id);const target=state.positions[0].tp;exits=markPaper(state,[{...m,mark:target+.1,timestamp:Date.now()}]);}
 const result={kind:'SYNTHETIC_TEST_ONLY',note:'Configured AI models, synthetic prices; entry/exit exist only in this process. AI charges use the normal crew budget. No account decisions or fills inserted.',review,entry,exits,finalVirtualCash:state.cash};
 await mkdir('output/paper-review',{recursive:true});await writeFile('output/paper-review/configured-model-smoke.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({kind:result.kind,verdict:review.verdict,codes:review.codes,entry:!!entry,exits:Array.isArray(exits)?exits.length:0,mainnetActions:0}));
}finally{await db.close();}
