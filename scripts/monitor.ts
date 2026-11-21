import {createPublicClient,http,parseAbi,parseEther,parseEventLogs,type Hex} from 'viem';
import {CONTRACT_CHAIN_ID} from '../packages/core/chain.js';
import {config} from '../packages/core/config.js';
import {Database} from '../packages/core/db.js';
import {runtimeHealth} from '../packages/core/runtime-health.js';
import {integrationSettings} from '../packages/core/integration-settings.js';
import {Address,hash} from '../packages/core/domain.js';

// Standard mode prints a cursor for an external supervisor. Delivery mode stores
// the cursor in PostgreSQL after the configured webhook acknowledges the batch.
const deliver=process.argv[2]==='--deliver';
const from=process.argv[deliver?3:2],gasFloor=process.env.SIGNER_GAS_FLOOR_HYPE,outflow=process.env.USDC_OUTFLOW_ALERT_UNITS;
if(!from||!/^\d+$/.test(from)||!gasFloor||!outflow||!/^\d+$/.test(outflow)||!config.DATABASE_URL)
 throw Error('Supply the first unprocessed block, SIGNER_GAS_FLOOR_HYPE, USDC_OUTFLOW_ALERT_UNITS and DATABASE_URL');
const minimumGas=parseEther(gasFloor),minimumOutflow=BigInt(outflow),initialBlock=BigInt(from);
const signer=Address.parse(process.env.MONITORED_SIGNER),s=await integrationSettings();
if(!s.roots||!s.registry||!s.governance||!s.auditor||!s.usdc||!s.billing)throw Error('Configure the verified production contract addresses');
const rpc=createPublicClient({transport:http(config.ELYSIUM_RPC)});
if(await rpc.getChainId()!==CONTRACT_CHAIN_ID)throw Error('Unexpected Elysium chain');
const db=new Database(config.DATABASE_URL);
type AlertBatch={fromBlock:string;throughBlock:string;nextBlock:string;alerts:string[]};
async function readBatch(start:bigint):Promise<AlertBatch|undefined>{
 const tip=await rpc.getBlockNumber();
 if(tip<2n||start>tip-2n)return;
 const end=start+999n<tip-2n?start+999n:tip-2n;
 const abi=parseAbi(['event RoleGranted(bytes32 indexed role,address indexed account,address indexed sender)','event RoleRevoked(bytes32 indexed role,address indexed account,address indexed sender)','event Retired(bytes32 indexed measurement)','event PosterSet(address indexed poster,bytes32 indexed measurement,bytes32 quoteHash)','event RoundsHalted(bool halted)','event Transfer(address indexed from,address indexed to,uint256 value)']);
 const logs=await rpc.getLogs({address:[s.governance,s.registry,s.auditor,s.usdc] as Hex[],fromBlock:start,toBlock:end});
 const events=parseEventLogs({abi,logs}),alerts:string[]=[];
 const burn=await rpc.readContract({address:Address.parse(s.billing),abi:parseAbi(['function burnVault() view returns(address)']),functionName:'burnVault'});
 const vaults=new Set([s.auditor,s.billing,burn.toLowerCase()]);
 for(const e of events){
  if(e.eventName==='Transfer'){
   if(e.address.toLowerCase()!==s.usdc||!vaults.has(e.args.from.toLowerCase())||e.args.value<minimumOutflow)continue;
  }
  alerts.push(e.eventName+' '+e.transactionHash);
 }
 const h=await runtimeHealth(db);
 for(const c of h.checks)if(!c.ok)alerts.push(c.id+' unavailable');
 if(await rpc.getBalance({address:signer,blockNumber:end})<minimumGas)alerts.push('Signer gas below configured floor');
 const last=await rpc.readContract({address:Address.parse(s.roots),abi:parseAbi(['function lastHour() view returns(uint64)']),functionName:'lastHour',blockNumber:end});
 if(Number(last)<Math.floor(Date.now()/3600000)-2)alerts.push('Hourly root overdue');
 return {fromBlock:String(start),throughBlock:String(end),nextBlock:String(end+1n),alerts};
}

function report(batch:AlertBatch){
 console.log(JSON.stringify(batch));
 if(batch.alerts.length)process.exitCode=2;
}

async function monitor(){
 if(!deliver){
  const batch=await readBatch(initialBlock);
  if(!batch)throw Error('No confirmed blocks available at this cursor');
  report(batch);
  return;
 }
 const destination=new URL(process.env.MONITOR_WEBHOOK_URL??'');
 const loopback=['localhost','127.0.0.1','[::1]'].includes(destination.hostname);
 if(destination.protocol!=='https:'&&!(destination.protocol==='http:'&&loopback))throw Error('Alert destination must use HTTPS or loopback HTTP');
 const cursor='monitor/'+hash({chain:CONTRACT_CHAIN_ID,roots:s.roots,destination:destination.href});
 const release=await db.lock(cursor);
 if(!release)throw Error('Another monitor owns this cursor');
 const save=async(value:string)=>db.query('INSERT INTO integration_cursors(name,value) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET value=excluded.value',[cursor,value]);
 try{
  // A decimal cursor is ready to scan. A saved batch awaits acknowledgement.
  const stored=(await db.query<{value:string}>('SELECT value FROM integration_cursors WHERE name=$1',[cursor])).rows[0]?.value;
  const pending=stored?.startsWith('{');
  const batch:AlertBatch|undefined=pending?JSON.parse(stored!):await readBatch(stored?BigInt(stored):initialBlock);
  if(!batch)return;
  if(batch.alerts.length){
   const body=JSON.stringify(batch);
   if(!pending)await save(body);
   const res=await fetch(destination,{method:'POST',redirect:'error',headers:{'content-type':'application/json','idempotency-key':hash({cursor,start:batch.fromBlock,end:batch.throughBlock})},body,signal:AbortSignal.timeout(10000)});
   await res.body?.cancel();
   if(!res.ok)throw Error('Alert receiver rejected delivery with HTTP '+res.status);
  }
  await save(batch.nextBlock);
  report(batch);
 }finally{await release();}
}
try{await monitor();}finally{await db.close();}
