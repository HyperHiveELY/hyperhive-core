import {CONTRACT_CHAIN_ID,contractRpc} from './chain.js';
import {createPublicClient,http,parseAbi,verifyMessage,type Hex} from 'viem';
import {verifyChain,verifySlip,merkleRoot,ackMessage,type SignedSlip} from './proof.js';
import {verifyAttestation,type Identity} from './attestation.js';
import {allFills,info} from './venue.js';
import {matchesFill,venueEvent} from './matching.js';
/** Verify public record evidence against the chain, current attestation and independent venue fills. */
export async function verifyOnline(data:{identity:Identity;record:{account:Hex;crewId:string;createdAt:number};slips:(SignedSlip&{ack?:{response:any;signature:Hex}})[]},measurement:Hex,origin:string,contract:Hex){
 const {slips}=data;
 if(!slips.length||!await verifyChain(slips)||slips.some(s=>s.signer.toLowerCase()!==data.identity.signer.toLowerCase()))throw Error('Invalid signed journal or identity');
 for(const s of slips)if(s.ack&&!await verifyMessage({address:s.signer,message:ackMessage(s.digest,s.ack.response),signature:s.ack.signature}))throw Error('Invalid exchange acknowledgement signature');
 await verifyAttestation(data.identity,measurement);
 const base=new URL(origin);if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))throw Error('Remote archives must use HTTPS');
 const rpc=createPublicClient({transport:http(process.env.ELYSIUM_RPC??contractRpc)});if(await rpc.getChainId()!==CONTRACT_CHAIN_ID)throw Error('Wrong verification chain');
 const abi=parseAbi(['function slips(uint64) view returns(bytes32 digest,bytes32 previous,uint32 count,uint64 postedAt,address poster)']);
 const hours=[...new Set(slips.map(s=>Math.floor(s.body.createdAt/3600000)))];
 for(const hour of hours){
  const r=await fetch(new URL(`/api/archive/hours/${hour}`,base),{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Archive unavailable for hour ${hour}`);
  const archive=await r.json() as {slips:SignedSlip[]};
  if(!Array.isArray(archive.slips))throw Error('Invalid hourly archive');
  for(const s of archive.slips)if(s.body.chainId!==CONTRACT_CHAIN_ID||Math.floor(s.body.createdAt/3600000)!==hour||s.body.rootContract?.toLowerCase()!==contract.toLowerCase()||!await verifySlip(s))throw Error('Invalid hourly slip');
  const anchored=await rpc.readContract({address:contract,abi,functionName:'slips',args:[BigInt(hour)]});
  if(anchored[3]===0n)throw Error(`Hour ${hour} has not been anchored yet`);
  if(anchored[0]!==merkleRoot(archive.slips.map(s=>s.digest))||anchored[2]!==archive.slips.length)throw Error('On-chain hourly root or count differs');
  if(archive.slips.some(s=>s.signer.toLowerCase()!==anchored[4].toLowerCase()))throw Error('Hourly root poster differs from record signer');
  const own=slips.filter(s=>Math.floor(s.body.createdAt/3600000)===hour);
  if(own.some(s=>!archive.slips.some(a=>a.digest===s.digest)))throw Error('Crew record is missing from the anchored archive');
  if(archive.slips.filter(s=>s.body.crewId===slips[0].body.crewId).length!==own.length)throw Error('Downloaded crew record omits anchored slips');
 }
 if(!data.record?.account||data.record.crewId!==slips[0].body.crewId)throw Error('Account metadata missing or inconsistent');
 if(slips.some(s=>s.body.chainId!==CONTRACT_CHAIN_ID||s.body.crewId!==data.record.crewId||s.body.account?.toLowerCase()!==data.record.account.toLowerCase()))throw Error('Signed account binding missing or inconsistent; legacy records support offline verification only');
 const fills=await allFills(data.record.account,0),sizes=new Map<Hex,number>();let matched=0,venue=0;
 for(const fill of fills.sort((a,b)=>a.time-b.time)){
  const order=await info.orderStatus({user:data.record.account,oid:fill.oid});
  const cloid=order.status==='order'?order.order.order.cloid:null;
  const slip=cloid?slips.find(s=>s.cloid===cloid):slips.find(s=>{const a=s.ack?.response;return (a?.filled?.oid??a?.resting?.oid??a?.oid)===fill.oid;});
  if(!slip){if(venueEvent(fill)){venue++;continue;}throw Error(`Unmatched public fill ${fill.tid}`);}
  if(order.status==='order'&&order.order.order.timestamp>slip.body.expiresAt)throw Error('Order was placed after its signed expiry');
  if(!matchesFill(slip,fill,sizes.get(slip.digest)??0))throw Error(`Fill ${fill.tid} violates its signed intent`);
  sizes.set(slip.digest,(sizes.get(slip.digest)??0)+Number(fill.sz));matched++;
 }
 return {hardware:'verified',anchoredHours:hours.length,independentlyFetchedFills:fills.length,matched,venue};
}
