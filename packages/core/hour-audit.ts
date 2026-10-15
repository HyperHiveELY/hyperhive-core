import {hourlyRoster} from './crew-registry.js';
import {CONTRACT_CHAIN_ID} from './chain.js';
import {createPublicClient,http,parseAbi,verifyMessage,type Hex} from 'viem';
import {verifyAttestation,type Identity} from './attestation.js';
import {verifyChain,verifySlip,ackMessage,merkleRoot,type SignedSlip} from './proof.js';
import {Policy,verifyPolicy,hash,ZERO} from './domain.js';
import {allFills,info} from './venue.js';
import {matchesFill,venueEvent} from './matching.js';
/** Rebuild a completed hour from the chain roster, signed archive and independently fetched fills. */
export async function auditHour(origin:string,hour:number,measurement:Hex,rootContract:Hex,rpcUrl:string){
 const base=new URL(origin);if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))throw Error('Archive must use HTTPS');
 const get=async(path:string)=>{const r=await fetch(new URL(path,base),{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Public archive unavailable');return r.json();};
 const rpc=createPublicClient({transport:http(rpcUrl)});if(await rpc.getChainId()!==CONTRACT_CHAIN_ID)throw Error('Audit requires Elysium mainnet');
 const anchor=await rpc.readContract({address:rootContract,abi:parseAbi(['function slips(uint64) view returns(bytes32,bytes32,uint32,uint64,address)']),functionName:'slips',args:[BigInt(hour)]});
 if(!anchor[3])throw Error('Hour has no posted slip root');
 const archive=await get(`/api/archive/hours/${hour}`),hourSlips=archive.slips as SignedSlip[];
 if(!Array.isArray(hourSlips)||hourSlips.length!==anchor[2]||merkleRoot(hourSlips.map(s=>s.digest))!==anchor[0])throw Error('Hourly archive differs from chain');
 for(const s of hourSlips)if(s.body.chainId!==CONTRACT_CHAIN_ID||!await verifySlip(s)||s.signer.toLowerCase()!==anchor[4].toLowerCase()||s.body.rootContract?.toLowerCase()!==rootContract.toLowerCase()||Math.floor(s.body.createdAt/3600000)!==hour)throw Error('Invalid anchored slip');
 const roster=await hourlyRoster(rpcUrl,rootContract,hour), audited=new Set<Hex>();
 let offset:number|null=0,broken=0,venue=0,matched=0;const leaves:Hex[]=[],seen=new Set<string>();
 while(offset!==null){
  const page=await get(`/api/crew-registry?offset=${offset}`);if(!Array.isArray(page.crews)||page.crews.length>100)throw Error('Invalid crew registry');
  for(const c of page.crews){
   if(seen.has(c.id))throw Error('Duplicate crew registry entry');seen.add(c.id);
   const id=hash(c.id),member=roster.get(id);
   if(!member){
    if(hourSlips.some(s=>s.body.crewId===c.id&&s.body.kind!=='CONTROL'))throw Error('Anchored financial intent belongs to an unenrolled crew');
    continue;
   }
   if(member.account!==c.account)throw Error('Archive account differs from on-chain crew registration');
   audited.add(id);
   const policy=Policy.parse(c.policy);if(c.id!==policy.crewId||c.account!==policy.account||!await verifyPolicy(policy,c.signature,Date.now(),true))throw Error('Invalid crew ownership policy');
   const record=await get(`/api/records/${c.id}/slips`);const slips=record.slips as (SignedSlip&{ack?:{response:any;signature:Hex}})[];
   if(!await verifyChain(slips)||slips.some(s=>s.body.crewId!==c.id||s.body.account?.toLowerCase()!==member.account||s.body.chainId!==CONTRACT_CHAIN_ID||s.body.rootContract?.toLowerCase()!==rootContract.toLowerCase()))throw Error('Invalid crew hash chain or verifying contract');
   if(hourSlips.filter(s=>s.body.crewId===c.id).some(s=>!slips.some(a=>a.digest===s.digest)))throw Error('Crew archive omits an anchored slip');
   if(slips.length){const identity=record.identity as Identity;await verifyAttestation(identity,measurement);if(slips.some(s=>s.signer.toLowerCase()!==identity.signer.toLowerCase()))throw Error('Crew signer differs from verified quote');}
   const byOid=new Map<number,SignedSlip>();
   for(const s of slips)if(s.ack){if(!await verifyMessage({address:s.signer,message:ackMessage(s.digest,s.ack.response),signature:s.ack.signature}))throw Error('Invalid signed acknowledgement');const a=s.ack.response,oid=a?.filled?.oid??a?.resting?.oid??a?.oid;if(oid)byOid.set(oid,s);}
   const fills=await allFills(policy.account,member.since,(hour+1)*3600000-1);
   const sizes=new Map<Hex,number>(),crewLeaves:Hex[]=[];
   for(const fill of fills.sort((a,b)=>a.time-b.time)){
    let slip=byOid.get(fill.oid);
    if(!slip){const order=await info.orderStatus({user:policy.account,oid:fill.oid});if(order.status==='order')slip=slips.find(s=>s.cloid===order.order.order.cloid);}
    let status='UNMATCHED';if(slip&&matchesFill(slip,fill,sizes.get(slip.digest)??0)){status='MATCHED';sizes.set(slip.digest,(sizes.get(slip.digest)??0)+Number(fill.sz));}else if(!slip&&venueEvent(fill))status='VENUE';
    if(fill.time<hour*3600000)continue;
    if(status==='UNMATCHED')broken++;else if(status==='VENUE')venue++;else matched++;
    crewLeaves.push(hash({crewId:c.id,tid:String(fill.tid),fillHash:fill.hash,digest:slip?.digest??ZERO,status}));
   }
   if(crewLeaves.length)leaves.push(hash({crewId:c.id,root:merkleRoot(crewLeaves)}));
  }
  if(page.nextOffset!==null&&(!Number.isInteger(page.nextOffset)||page.nextOffset<=offset))throw Error('Registry pagination did not advance');offset=page.nextOffset;
 }
 if(audited.size!==roster.size)throw Error('Archive omits an on-chain crew');
 if(hourSlips.some(s=>!seen.has(s.body.crewId)))throw Error('Registry omits an anchored crew');
 return {root:leaves.length?merkleRoot(leaves):hash({hour,empty:true}),broken,venue,matched,crews:audited.size};
}
