import {CONTRACT_CHAIN_ID,contractChain} from '../../packages/core/chain.js';
import {readFile,writeFile,rename,mkdir,stat} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {createPublicClient,createWalletClient,http,parseAbi,encodeAbiParameters,parseAbiParameters,keccak256,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';

import {auditHour} from '../../packages/core/hour-audit.js';
import {config} from '../../packages/core/config.js';
import {ZERO} from '../../packages/core/domain.js';

const contract=process.env.AUDITOR_CONTRACT as Hex|undefined,origin=process.env.ARCHIVE_ORIGIN;
if(!contract||!origin||!config.ROOT_CONTRACT||!config.MEASUREMENT_HASH)throw Error('Set auditor/root contracts, archive origin and independently approved measurement');
const requested=process.argv[2]?Number(process.argv[2]):undefined;
if(requested!==undefined&&(!Number.isSafeInteger(requested)||requested<=0))throw Error('Hour must be a positive integer');
if(process.env.AUDITOR_EXECUTION_ENABLED!=='true'){
 const hour=requested??Math.floor(Date.now()/3600000)-1;
 console.log(await auditHour(origin,hour,config.MEASUREMENT_HASH as Hex,config.ROOT_CONTRACT as Hex,config.ELYSIUM_RPC));
 console.log('Computed independently; no vote submitted. Set AUDITOR_EXECUTION_ENABLED=true on the funded operator host to commit/reveal.');
}else{
 const path=process.env.AUDITOR_PRIVATE_KEY_FILE;if(!path)throw Error('Set AUDITOR_PRIVATE_KEY_FILE on this operator host');
 if((await stat(path)).mode&0o077)throw Error('Auditor key file must be readable only by its owner');
 const key=(await readFile(path,'utf8')).trim();if(!/^0x[\da-fA-F]{64}$/.test(key))throw Error('Invalid auditor key file');
 const account=privateKeyToAccount(key as Hex),rpc=createPublicClient({transport:http(config.ELYSIUM_RPC)}),wallet=createWalletClient({account,chain:contractChain,transport:http(config.ELYSIUM_RPC)});
 if(await rpc.getChainId()!==CONTRACT_CHAIN_ID)throw Error('Auditor requires Elysium mainnet');
 const abi=parseAbi(['function roots() view returns(address)','function rounds(uint64) view returns(uint64 hour,uint64 commitEnd,uint64 revealEnd,uint256 total,bool finalized)','function weight(uint64,address) view returns(uint256)','function commitments(uint64,address) view returns(bytes32)','function votes(uint64,address) view returns(bytes32)','function openRound(uint64)','function commit(uint64,bytes32)','function reveal(uint64,bytes32,uint32,uint32,bytes32)','function finalizeHour(uint64)']);
 if((await rpc.readContract({address:contract,abi,functionName:'roots'})).toLowerCase()!==config.ROOT_CONTRACT.toLowerCase())throw Error('Auditor contract is linked to another root registry');
 const directory=resolve(process.env.AUDITOR_STATE_DIR??`.data/auditor-${CONTRACT_CHAIN_ID}-${contract.toLowerCase()}-${account.address.toLowerCase()}`);await mkdir(directory,{recursive:true,mode:0o700});
 type Vote={chainId:number;contract:Hex;operator:Hex;hour:number;root:Hex;broken:number;venue:number;salt:Hex};
 const submit=async(functionName:'openRound'|'commit'|'reveal'|'finalizeHour',args:any[])=>{
  const {request}=await rpc.simulateContract({account,address:contract,abi,functionName,args:args as any});
  const tx=await wallet.writeContract(request);const receipt=await rpc.waitForTransactionReceipt({hash:tx,confirmations:2});if(receipt.status!=='success')throw Error('Auditor transaction reverted');
  console.log(JSON.stringify({action:functionName,tx}));
 };
 let stopping=false;process.on('SIGINT',()=>stopping=true);process.on('SIGTERM',()=>stopping=true);
 const pending=new Set<number>();
 // Recover locally committed rounds across restarts before considering a new hour.
 const {readdir}=await import('node:fs/promises');for(const f of await readdir(directory))if(/^\d+\.json$/.test(f))pending.add(Number(f.slice(0,-5)));
 while(!stopping){
  let current=requested;
  if(current===undefined){
   try{current=Math.floor(Number((await rpc.getBlock()).timestamp)/3600)-1;}
   catch{console.error('Elysium clock unavailable');await new Promise(r=>setTimeout(r,15000));continue;}
  }
  pending.add(current);
  for(const hour of [...pending].sort((a,b)=>a-b)){
   try{
    const block=await rpc.getBlock();const now=Number(block.timestamp);if(now<(hour+1)*3600+600)continue;
    let round=await rpc.readContract({address:contract,abi,functionName:'rounds',args:[BigInt(hour)]});
    if(round[4]){pending.delete(hour);if(requested!==undefined)stopping=true;continue;}
    if(!round[1] && now >= (hour+1)*3600+1200){
     pending.delete(hour);
     if(requested!==undefined){console.error('Round opening window expired');process.exitCode=1;stopping=true;}
     continue;
    }
    if(!round[1]){await submit('openRound',[BigInt(hour)]);round=await rpc.readContract({address:contract,abi,functionName:'rounds',args:[BigInt(hour)]});}
    const file=resolve(directory,`${hour}.json`);let vote:Vote|undefined;
    try{vote=JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    if(vote&&(vote.chainId!==CONTRACT_CHAIN_ID||vote.contract.toLowerCase()!==contract.toLowerCase()||vote.operator.toLowerCase()!==account.address.toLowerCase()||vote.hour!==hour))throw Error('Reveal backup belongs to another chain, contract, operator or hour');
    if(now<Number(round[1])){
     if(await rpc.readContract({address:contract,abi,functionName:'weight',args:[BigInt(hour),account.address]})===0n)throw Error('Operator has no eligible stake in this round');
     if(!vote){const result=await auditHour(origin,hour,config.MEASUREMENT_HASH as Hex,config.ROOT_CONTRACT as Hex,config.ELYSIUM_RPC);vote={chainId:CONTRACT_CHAIN_ID,contract,operator:account.address,hour,root:result.root,broken:result.broken,venue:result.venue,salt:`0x${randomBytes(32).toString('hex')}`};const tmp=`${file}.tmp`;await writeFile(tmp,JSON.stringify(vote),{mode:0o600});await rename(tmp,file);}
     const commitment=keccak256(encodeAbiParameters(parseAbiParameters('bytes32,uint32,uint32,bytes32,address,uint64,uint256'),[vote.root,vote.broken,vote.venue,vote.salt,account.address,BigInt(hour),BigInt(CONTRACT_CHAIN_ID)]));
     const existing=await rpc.readContract({address:contract,abi,functionName:'commitments',args:[BigInt(hour),account.address]});
     if(existing===ZERO)await submit('commit',[BigInt(hour),commitment]);else if(existing!==commitment)throw Error('Persisted vote differs from on-chain commitment');
    }else if(now<Number(round[2])){
     const existing=await rpc.readContract({address:contract,abi,functionName:'votes',args:[BigInt(hour),account.address]});
     if(vote&&existing===ZERO)await submit('reveal',[BigInt(hour),vote.root,vote.broken,vote.venue,vote.salt]);
    }else await submit('finalizeHour',[BigInt(hour)]);
   }catch(e){console.error(JSON.stringify({hour,error:(e as Error).message.slice(0,250)}));}
  }
  if(!stopping)await new Promise(r=>setTimeout(r,15000));
 }
}
