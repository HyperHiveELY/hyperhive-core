import {mkdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve,relative} from 'node:path';

await mkdir('coverage',{recursive:true});
const report='coverage/solidity.lcov';
const args=['coverage','--ir-minimum','--no-match-coverage','node_modules|contracts/test','--report','lcov','--report-file',report];
if(process.env.FOUNDRY_SOLC)args.push('--use',process.env.FOUNDRY_SOLC);
const forge=spawnSync('forge',args,{stdio:'inherit'});
if(forge.error)throw forge.error;
if(forge.status!==0)throw Error('Foundry coverage failed');
const records=(await readFile(report,'utf8')).split('end_of_record');
let covered=0,total=0;
for(const record of records){
 const source=record.match(/^SF:(.+)$/m)?.[1];
 if(!source||!relative(resolve('.'),resolve(source)).startsWith('contracts/src/'))continue;
 for(const [,hits] of record.matchAll(/^DA:\d+,(\d+)/gm)){total++;if(Number(hits)>0)covered++;}
}
if(!total||covered*100<95*total)throw Error(`Solidity coverage below 95% (${covered}/${total})`);
console.log(`Solidity line coverage ${covered}/${total} (${(covered*100/total).toFixed(2)}%)`);
