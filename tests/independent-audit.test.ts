import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {bytesToHex,hexToBytes,type Hex} from 'viem';
import {auditHour} from '../packages/core/hour-audit.js';
import {verifyOnline} from '../packages/core/online-verifier.js';
import {approvedPoster} from '../packages/core/crew-registry.js';
import {verifyAttestation} from '../packages/core/attestation.js';
import {ackMessage,signSlip} from '../packages/core/proof.js';
import {hash,ZERO} from '../packages/core/domain.js';
import {crew,wallet} from './fixtures.js';

const mock=vi.hoisted(()=>({rpc:vi.fn(),chain:vi.fn(),fills:vi.fn(),status:vi.fn(),verify:vi.fn()}));
vi.mock('viem',async original=>({...await original<typeof import('viem')>(),createPublicClient:()=>({getBlockNumber:async()=>10n,getChainId:mock.chain,readContract:mock.rpc})}));
vi.mock('../packages/core/venue.js',()=>({allFills:mock.fills,info:{orderStatus:mock.status}}));
vi.mock('@phala/dcap-qvl',()=>({getCollateralAndVerify:mock.verify}));
const root='0x1000000000000000000000000000000000000001' as Hex;
const bytes=new Uint8Array(48).fill(1),reg=bytesToHex(bytes).slice(2);
const measurement=hash({mrtd:reg,rtmr0:reg,rtmr1:reg,rtmr2:reg,rtmr3:reg,composeHash:'fixture'});
function identity(){
 const policyHash=hash('policy');
 const reportData=hash({agent:wallet.address.toLowerCase(),signer:wallet.address.toLowerCase(),policyHash,measurement});
 const td={mrTd:bytes,rtMr0:bytes,rtMr1:bytes,rtMr2:bytes,rtMr3:bytes,reportData:hexToBytes((reportData+'0'.repeat(64)) as Hex)};
 mock.verify.mockResolvedValue({status:'UpToDate',report:{asTd10:()=>td}});
 return {agent:wallet.address,signer:wallet.address,measurement,quote:{quote:'00',reportData,policyHash,measurement,composeHash:'fixture'}};
}
beforeEach(()=>{vi.resetAllMocks();mock.chain.mockResolvedValue(99901);mock.fills.mockResolvedValue([]);});
afterEach(()=>vi.unstubAllGlobals());

it('binds the TDX measurements, agent and signer to the authenticated report data',async()=>{
 const i=identity();expect((await verifyAttestation(i,measurement)).signer).toBe(wallet.address);
 await expect(verifyAttestation({...i,signer:root},measurement)).rejects.toThrow('bind');
 await expect(verifyAttestation({...i,quote:{...i.quote,composeHash:'other'}},measurement)).rejects.toThrow('measurements');
 mock.verify.mockResolvedValue({status:'OutOfDate'});await expect(verifyAttestation(i,measurement)).rejects.toThrow('UpToDate');
});
it('requires a current approved measurement at the same block',async()=>{
 let approved=true;
 mock.rpc.mockImplementation(async({functionName,blockNumber})=>{expect(blockNumber).toBe(10n);return functionName==='registry'?root:functionName==='approved'?approved:measurement;});
 await approvedPoster('https://rpc.invalid',root,wallet.address,measurement);
 approved=false;await expect(approvedPoster('https://rpc.invalid',root,wallet.address,measurement)).rejects.toThrow('inactive');
});
it('checks a previously enrolled account in a quiet hour and refuses an omitted roster member',async()=>{
 const c=await crew(), hour=Math.floor(Date.now()/3600000)-1, since=hour*3600-100;
 mock.rpc.mockImplementation(async({functionName})=>{
  if(functionName==='slips')return [ZERO,ZERO,0,20n,wallet.address];
  if(functionName==='crewCount')return 1n;
  if(functionName==='crewRoster')return [hash(c.id),c.account,BigInt(since)];
  throw Error('Unexpected call');
 });
 let roster=[c];
 vi.stubGlobal('fetch',async(url:URL)=>Response.json(url.pathname.includes('/hours/')?{slips:[]}:url.pathname==='/api/crew-registry'?{crews:roster,nextOffset:null}:{slips:[]}));
 mock.fills.mockResolvedValue([{time:hour*3600000+100,tid:1,hash:ZERO,oid:1,dir:'Close Long'}]);
 mock.status.mockResolvedValue({status:'unknownOid'});
 const result=await auditHour('https://archive.invalid',hour,measurement,root,'https://rpc.invalid');
 expect(result).toMatchObject({crews:1,broken:1,matched:0});
 expect(mock.fills).toHaveBeenCalledWith(c.account,since*1000,(hour+1)*3600000-1);
 roster=[];await expect(auditHour('https://archive.invalid',hour,measurement,root,'https://rpc.invalid')).rejects.toThrow('omits an on-chain crew');
});
it('rebuilds an anchored hour with a real slip signature and independently fetched fill',async()=>{
 const c=await crew(),i=identity(),now=Date.now()-5000;
 const slip=await signSlip({v:1,crewId:c.id,account:c.account,seq:1,previous:ZERO,kind:'ENTRY',policyHash:hash(c.policy),cardHash:ZERO,measurement,agent:wallet.address,createdAt:now,expiresAt:now+30000,order:{market:'BTC',b:true,p:'100',s:'1'}},wallet,root);
 const response={filled:{oid:42}},sig=await wallet.signMessage({message:ackMessage(slip.digest,response)});
 const data={identity:i,record:{account:c.account,crewId:c.id,createdAt:now},slips:[{...slip,ack:{response,signature:sig}}]};
 vi.stubGlobal('fetch',async()=>Response.json({slips:[slip]}));
 mock.rpc.mockResolvedValue([slip.digest,ZERO,1,1n,wallet.address]);
 mock.status.mockResolvedValue({status:'order',order:{order:{cloid:slip.cloid,timestamp:now}}});
 mock.fills.mockResolvedValue([{coin:'BTC',side:'B',px:'99',sz:'1',time:now+5,tid:42,oid:42,dir:'Open Long'}]);
 expect(await verifyOnline(data,measurement,'https://archive.invalid',root)).toMatchObject({anchoredHours:1,matched:1});
 mock.rpc.mockResolvedValue([ZERO,ZERO,1,1n,wallet.address]);
 await expect(verifyOnline(data,measurement,'https://archive.invalid',root)).rejects.toThrow('root or count');
});
