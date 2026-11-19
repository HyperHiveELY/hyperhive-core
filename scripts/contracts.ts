import solc from 'solc';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const input={language:'Solidity',sources:{'HyperHive.sol':{content:readFileSync('contracts/src/HyperHive.sol','utf8')}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}}};
const dependencies:Record<string,{content:string}>={};
const output=JSON.parse(solc.compile(JSON.stringify(input),{import:(p:string)=>{try{const content=readFileSync(resolve('node_modules',p),'utf8');dependencies[p]={content};return {contents:content};}catch{return {error:`Import unavailable: ${p}`};}}}));
for(const e of output.errors??[])if(e.severity==='error')console.error(e.formattedMessage);
if(output.errors?.some((e:any)=>e.severity==='error'))process.exit(1);
mkdirSync('contracts/out',{recursive:true});for(const [name,artifact] of Object.entries(output.contracts['HyperHive.sol']))writeFileSync(`contracts/out/${name}.json`,JSON.stringify(artifact,null,2));console.log(`Compiled ${Object.keys(output.contracts['HyperHive.sol']).join(', ')} with solc ${solc.version()}`);

const standardInput={...input,sources:{...input.sources,...dependencies}};
writeFileSync('contracts/out/standard-input.json',JSON.stringify(standardInput,null,2));
writeFileSync('contracts/out/build-manifest.json',JSON.stringify({compiler:solc.version(),optimizer:input.settings.optimizer,evmVersion:input.settings.evmVersion,inputSha256:createHash('sha256').update(JSON.stringify(standardInput)).digest('hex'),lockSha256:createHash('sha256').update(readFileSync('package-lock.json')).digest('hex')},null,2));
