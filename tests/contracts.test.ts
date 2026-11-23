import {beforeAll,it,expect} from 'vitest';
import {createVM,type VM} from '@ethereumjs/vm';
import {Common,Mainnet,Hardfork} from '@ethereumjs/common';
import {createAddressFromString,Account} from '@ethereumjs/util';
import {createBlock} from '@ethereumjs/block';
import {encodeDeployData,encodeFunctionData,decodeFunctionResult,hexToBytes,bytesToHex,encodeAbiParameters,parseAbiParameters,keccak256,type Hex} from 'viem';
import {readFileSync} from 'node:fs';
let vm:VM;let now=1000000n;
const admin='0x1000000000000000000000000000000000000001' as Hex,other='0x2000000000000000000000000000000000000002' as Hex;
const artifacts=new Map<string,any>();
beforeAll(async()=>{vm=await createVM({common:new Common({chain:Mainnet,hardfork:Hardfork.Cancun})});await vm.stateManager.putAccount(createAddressFromString(admin),new Account(0n,10n**24n));for(const n of ['HHIV','MeasurementRegistry','SlipRoot','FeeSplitter','AuditorStake','BuyBurn','Governance'])artifacts.set(n,JSON.parse(readFileSync(`contracts/out/${n}.json`,'utf8')));});
async function deploy(name:string,args:any[]){const a=artifacts.get(name);const r=await vm.evm.runCall({caller:createAddressFromString(admin),data:hexToBytes(encodeDeployData({abi:a.abi,bytecode:`0x${a.evm.bytecode.object}`,args})),gasLimit:25000000n,block:createBlock({header:{timestamp:now}},{common:vm.common})});if(r.execResult.exceptionError)throw r.execResult.exceptionError;return r.createdAddress!.toString() as Hex;}
async function call(name:string,address:Hex,fn:string,args:any[]=[],caller:Hex=admin,fail=false){const a=artifacts.get(name),r=await vm.evm.runCall({caller:createAddressFromString(caller),to:createAddressFromString(address),data:hexToBytes(encodeFunctionData({abi:a.abi,functionName:fn,args})),gasLimit:25000000n,block:createBlock({header:{timestamp:now}},{common:vm.common})});if(fail){expect(r.execResult.exceptionError).toBeDefined();return;}if(r.execResult.exceptionError)throw r.execResult.exceptionError;return decodeFunctionResult({abi:a.abi,functionName:fn,data:bytesToHex(r.execResult.returnValue)});}
it('fixed-supply token transfers and burns without an additional mint path',async()=>{const token=await deploy('HHIV',[admin,1000n]);expect(await call('HHIV',token,'totalSupply')).toBe(1000n);await call('HHIV',token,'transfer',[other,100n]);expect(await call('HHIV',token,'balanceOf',[other])).toBe(100n);await call('HHIV',token,'burn',[10n],other);expect(await call('HHIV',token,'totalSupply')).toBe(990n);expect(artifacts.get('HHIV').abi.some((f:any)=>f.name==='mint')).toBe(false);});
it('requires a 48-hour measurement delay and rejects unauthorized root posters',async()=>{const registry=await deploy('MeasurementRegistry',[admin,other]),roots=await deploy('SlipRoot',[admin,registry]),m=`0x${'ab'.repeat(32)}` as Hex,q=`0x${'cd'.repeat(32)}` as Hex,zero=`0x${'00'.repeat(32)}` as Hex;await call('MeasurementRegistry',registry,'propose',[m],other,true);await call('MeasurementRegistry',registry,'propose',[m]);await call('MeasurementRegistry',registry,'activate',[m],admin,true);now+=48n*3600n;await call('MeasurementRegistry',registry,'activate',[m]);await call('MeasurementRegistry',registry,'setPoster',[admin,m,q]);const hour=now/3600n-1n;await call('SlipRoot',roots,'postSlipRoot',[hour,q,1,zero],other,true);await call('SlipRoot',roots,'postSlipRoot',[hour,q,1,zero]);await call('SlipRoot',roots,'postSlipRoot',[hour,q,1,q],admin,true);await call('MeasurementRegistry',registry,'retire',[m],other);await call('SlipRoot',roots,'postSlipRoot',[hour+1n,q,1,q],admin,true);});
it('charges the exact subscription amount and conserves the 80/10/5/5 split',async()=>{const token=await deploy('HHIV',[admin,1000000000n]);const workers=other,treasury='0x3000000000000000000000000000000000000003',auditors='0x4000000000000000000000000000000000000004',burn='0x5000000000000000000000000000000000000005';const splitter=await deploy('FeeSplitter',[token,workers,treasury,auditors,burn]);await call('HHIV',token,'approve',[splitter,29000000n]);const crew=`0x${'ef'.repeat(32)}`;await call('FeeSplitter',splitter,'payPlan',[crew,1,1]);expect(await call('HHIV',token,'balanceOf',[workers])).toBe(23200000n);expect(await call('HHIV',token,'balanceOf',[treasury])).toBe(2900000n);expect(await call('HHIV',token,'balanceOf',[auditors])).toBe(1450000n);expect(await call('HHIV',token,'balanceOf',[burn])).toBe(1450000n);expect(await call('HHIV',token,'balanceOf',[splitter])).toBe(0n);expect(await call('FeeSplitter',splitter,'expiresAt',[crew])).toBe(now+30n*86400n);await call('FeeSplitter',splitter,'payPlan',[crew,0,1],admin,true);});
it('does not let another account withdraw an auditor bond',async()=>{const token=await deploy('HHIV',[admin,10000n]),registry=await deploy('MeasurementRegistry',[admin,other]),roots=await deploy('SlipRoot',[admin,registry]),reward=await deploy('HHIV',[admin,10000n]),stake=await deploy('AuditorStake',[token,roots,100n,reward]);await call('HHIV',token,'approve',[stake,1000n]);await call('AuditorStake',stake,'stake',[1000n]);await call('AuditorStake',stake,'requestUnstake',[1000n]);await call('AuditorStake',stake,'withdrawUnstaked',[],other,true);await call('AuditorStake',stake,'withdrawUnstaked',[],admin,true);now+=7n*86400n;await call('AuditorStake',stake,'withdrawUnstaked');expect(await call('HHIV',token,'balanceOf',[admin])).toBe(10000n);});
it('requires a posted hour, slashes absence, prevents false finalization, and pays winning auditors',async()=>{
 const third='0x6000000000000000000000000000000000000006' as Hex;
 const token=await deploy('HHIV',[admin,10000n]),reward=await deploy('HHIV',[admin,10000n]),registry=await deploy('MeasurementRegistry',[admin,other]),roots=await deploy('SlipRoot',[admin,registry]),stake=await deploy('AuditorStake',[token,roots,100n,reward]);
 await call('SlipRoot',roots,'setAuditor',[stake]);
 const zero=`0x${'00'.repeat(32)}` as Hex,m=`0x${'11'.repeat(32)}` as Hex,root=`0x${'22'.repeat(32)}` as Hex,salt=`0x${'33'.repeat(32)}` as Hex;
 await call('MeasurementRegistry',registry,'propose',[m]);now+=172800n;await call('MeasurementRegistry',registry,'activate',[m]);await call('MeasurementRegistry',registry,'setPoster',[admin,m,root]);
 const hour=now/3600n+1n;
 for(const p of [admin,other,third]){if(p!==admin)await call('HHIV',token,'transfer',[p,100n]);await call('HHIV',token,'approve',[stake,100n],p);await call('AuditorStake',stake,'stake',[100n],p);}
 now=(hour+1n)*3600n+600n;
 await call('AuditorStake',stake,'openRound',[hour],admin,true);
 await call('SlipRoot',roots,'postSlipRoot',[hour,root,0,zero]);await call('AuditorStake',stake,'openRound',[hour]);
 await call('HHIV',reward,'transfer',[stake,1000n]);
 for(const p of [admin,other]){const c=keccak256(encodeAbiParameters(parseAbiParameters('bytes32,uint32,uint32,bytes32,address,uint64,uint256'),[root,0,0,salt,p,hour,1n]));await call('AuditorStake',stake,'commit',[hour,c],p);}
 now+=300n;for(const p of [admin,other])await call('AuditorStake',stake,'reveal',[hour,root,0,0,salt],p);
 now+=5400n;await call('AuditorStake',stake,'finalize',[hour,m,0,0],third,true);await call('AuditorStake',stake,'finalize',[hour,root,0,0]);
 expect(await call('SlipRoot',roots,'matches',[hour])).toBe(root);expect((await call('AuditorStake',stake,'auditors',[third]) as any)[0]).toBe(90n);
 expect(await call('AuditorStake',stake,'earned',[other])).toBe(500n);await call('AuditorStake',stake,'claimRewards',[],other);expect(await call('HHIV',reward,'balanceOf',[other])).toBe(500n);await call('AuditorStake',stake,'claimRewards',[],other,true);
 expect(await call('AuditorStake',stake,'pendingRounds',[third])).toBe(0n);
});
it('requires a full initial bond and reuses withdrawn auditor registrations',async()=>{
 const token=await deploy('HHIV',[admin,10000n]),registry=await deploy('MeasurementRegistry',[admin,other]),roots=await deploy('SlipRoot',[admin,registry]),reward=await deploy('HHIV',[admin,10000n]),stake=await deploy('AuditorStake',[token,roots,100n,reward]);
 await call('HHIV',token,'approve',[stake,10000n]);
 await call('AuditorStake',stake,'stake',[1n],admin,true);
 await call('AuditorStake',stake,'stake',[100n]);
 await call('AuditorStake',stake,'requestUnstake',[100n]);now+=7n*86400n;await call('AuditorStake',stake,'withdrawUnstaked');
 await call('HHIV',token,'transfer',[other,100n]);await call('HHIV',token,'approve',[stake,100n],other);await call('AuditorStake',stake,'stake',[100n],other);
 expect(await call('AuditorStake',stake,'operators',[0n])).toBe(other);
 expect((await call('AuditorStake',stake,'auditors',[admin]) as any)[5]).toBe(false);
 expect(await call('HHIV',token,'balanceOf',[admin])).toBe(9900n);
});

it('binds roster entries permanently and rejects late rounds and retroactive auditor eligibility',async()=>{
 const late='0x6000000000000000000000000000000000000006' as Hex;
 const token=await deploy('HHIV',[admin,10000n]), reward=await deploy('HHIV',[admin,10000n]);
 const registry=await deploy('MeasurementRegistry',[admin,other]), roots=await deploy('SlipRoot',[admin,registry]);
 const stake=await deploy('AuditorStake',[token,roots,100n,reward]);
 const m=('0x'+'ab'.repeat(32)) as Hex,id=('0x'+'12'.repeat(32)) as Hex,zero=('0x'+'00'.repeat(32)) as Hex;
 await call('MeasurementRegistry',registry,'propose',[m]);now+=172800n;
 await call('MeasurementRegistry',registry,'activate',[m]);await call('MeasurementRegistry',registry,'setPoster',[admin,m,id]);
 await call('SlipRoot',roots,'registerCrew',[id,late],other,true);
 await call('SlipRoot',roots,'registerCrew',[id,late]);
 await call('SlipRoot',roots,'registerCrew',[id,other],admin,true);
 await call('SlipRoot',roots,'registerCrew',[m,late],admin,true);
 expect(await call('SlipRoot',roots,'crewCount')).toBe(1n);
 expect(await call('SlipRoot',roots,'crewAccount',[id])).toBe(late);
 for(const p of [admin,other]){
  if(p!==admin)await call('HHIV',token,'transfer',[p,100n]);
  await call('HHIV',token,'approve',[stake,100n],p);await call('AuditorStake',stake,'stake',[100n],p);
 }
 const hour=now/3600n+1n;
 now=(hour+1n)*3600n+600n;
 for(const h of [hour-1n,hour])await call('SlipRoot',roots,'postSlipRoot',[h,id,0,h===hour?id:zero]);
 await call('HHIV',token,'transfer',[late,100n]);await call('HHIV',token,'approve',[stake,100n],late);await call('AuditorStake',stake,'stake',[100n],late);
 await call('AuditorStake',stake,'openRound',[hour-1n],admin,true);
 await call('AuditorStake',stake,'openRound',[hour]);
 expect(await call('AuditorStake',stake,'weight',[hour,late])).toBe(0n);
 expect(await call('AuditorStake',stake,'pendingRounds',[late])).toBe(0n);
});
it('separates guardian suspension from governance resumption and preserves matured withdrawals',async()=>{
 const token=await deploy('HHIV',[admin,10000n]),reward=await deploy('HHIV',[admin,10000n]);
 const registry=await deploy('MeasurementRegistry',[admin,other]),roots=await deploy('SlipRoot',[admin,registry]);
 const pool=await deploy('AuditorStake',[token,roots,100n,reward]);
 const outsider='0x6000000000000000000000000000000000000006' as Hex;
 await call('AuditorStake',pool,'haltRounds',[],outsider,true);
 await call('HHIV',token,'approve',[pool,200n]);await call('AuditorStake',pool,'stake',[200n]);
 await call('AuditorStake',pool,'requestUnstake',[200n]);await call('AuditorStake',pool,'haltRounds',[],other);
 expect(await call('AuditorStake',pool,'halted')).toBe(true);
 await call('AuditorStake',pool,'resumeRounds',[],other,true);
 now+=604800n;await call('AuditorStake',pool,'withdrawUnstaked');
 expect(await call('HHIV',token,'balanceOf',[admin])).toBe(10000n);
 await call('AuditorStake',pool,'resumeRounds');expect(await call('AuditorStake',pool,'halted')).toBe(false);
});
it('enforces mutator boundaries on the token, measurement, roots, stake, payment and burn contracts',async()=>{
 const outsider='0x6000000000000000000000000000000000000006' as Hex;
 const value=('0x'+'ab'.repeat(32)) as Hex;
 const token=await deploy('HHIV',[admin,1000n]),reward=await deploy('HHIV',[admin,1000n]);
 const registry=await deploy('MeasurementRegistry',[admin,other]);
 const roots=await deploy('SlipRoot',[admin,registry]);
 const pool=await deploy('AuditorStake',[token,roots,100n,reward]);
 const burner=await deploy('BuyBurn',[admin,reward,token]);
 const fees=await deploy('FeeSplitter',[reward,other,admin,pool,burner]);
 const governance=await deploy('Governance',[[admin],[admin]]);
 await call('HHIV',token,'burn',[1n],outsider,true);
 await call('HHIV',token,'transferFrom',[admin,outsider,1n],outsider,true);
 await call('MeasurementRegistry',registry,'retire',[value],outsider,true);
 await call('MeasurementRegistry',registry,'setPoster',[outsider,value,value],outsider,true);
 await call('SlipRoot',roots,'setAuditor',[outsider],outsider,true);
 await call('SlipRoot',roots,'setMatchRoot',[1n,value,0,0],outsider,true);
 await call('AuditorStake',pool,'requestUnstake',[1n],outsider,true);
 await call('AuditorStake',pool,'commit',[1n,value],outsider,true);
 await call('AuditorStake',pool,'reveal',[1n,value,0,0,value],outsider,true);
 await call('AuditorStake',pool,'finalizeHour',[1n],outsider,true);
 await call('BuyBurn',burner,'setRouter',[token,true],outsider,true);
 await call('BuyBurn',burner,'setRouter',[outsider,true],admin,true);
 await call('BuyBurn',burner,'execute',[token,1n,1n,'0x'],outsider,true);
 await call('BuyBurn',burner,'execute',[token,1n,1n,'0x'],admin,true);
 await call('Governance',governance,'schedule',[token,0n,'0x',value,value,172800n],outsider,true);
 await call('Governance',governance,'updateDelay',[0n],outsider,true);
 // Distribution is intentionally permissionless. A caller cannot redirect even a rounding remainder.
 await call('HHIV',reward,'transfer',[fees,101n]);
 await call('FeeSplitter',fees,'distribute',[],outsider);
 expect(await call('HHIV',reward,'balanceOf',[outsider])).toBe(0n);
 expect(await call('HHIV',reward,'balanceOf',[admin])).toBe(910n);
 expect(await call('HHIV',reward,'balanceOf',[fees])).toBe(0n);
});
it('accounts for every public mutator in the compiled ABI and probes each privilege or input boundary',async()=>{
 const zero='0x'+'00'.repeat(20),word='0x'+'12'.repeat(32),none='0x'+'00'.repeat(32);
 const token=await deploy('HHIV',[admin,1000n]),payment=await deploy('HHIV',[admin,1000n]);
 const registry=await deploy('MeasurementRegistry',[admin,admin]),roots=await deploy('SlipRoot',[admin,registry]);
 const pool=await deploy('AuditorStake',[token,roots,100n,payment]),burner=await deploy('BuyBurn',[admin,payment,token]);
 const splitter=await deploy('FeeSplitter',[payment,admin,admin,pool,burner]),gov=await deploy('Governance',[[admin],[admin]]);
 const ownership={acceptOwnership:[],renounceOwnership:[],transferOwnership:[other]};
 const boundaries:Record<string,{address:Hex;denied:Record<string,unknown[]>;open?:string[]}>={
  HHIV:{address:token,denied:{approve:[zero,1n],burn:[1n],transfer:[admin,1n],transferFrom:[admin,other,1n]}},
  Governance:{address:gov,denied:{cancel:[word],execute:[token,0n,'0x',none,word],executeBatch:[[token],[0n],['0x'],none,word],grantRole:[word,other],renounceRole:[word,admin],revokeRole:[word,admin],schedule:[token,0n,'0x',none,word,172800n],scheduleBatch:[[token],[0n],['0x'],none,word,172800n],updateDelay:[0n]},open:['onERC1155BatchReceived','onERC1155Received','onERC721Received']},
  MeasurementRegistry:{address:registry,denied:{...ownership,activate:[word],propose:[word],retire:[word],setPoster:[other,word,word]}},
  SlipRoot:{address:roots,denied:{...ownership,postSlipRoot:[1n,word,1,none],registerCrew:[word,other],setAuditor:[other],setMatchRoot:[1n,word,0,0]}},
  AuditorStake:{address:pool,denied:{claimRewards:[],commit:[1n,word],finalize:[1n,word,0,0],finalizeHour:[1n],haltRounds:[],openRound:[1n],requestUnstake:[1n],resumeRounds:[],reveal:[1n,word,0,0,word],stake:[0n],withdrawUnstaked:[]}},
  BuyBurn:{address:burner,denied:{...ownership,setRouter:[token,true],execute:[token,1n,1n,'0x']}},
  FeeSplitter:{address:splitter,denied:{payPlan:[none,1,1]},open:['distribute']},
 };
 for(const [name,{address,denied,open=[]}] of Object.entries(boundaries)){
  const mutators=artifacts.get(name).abi.filter((f:any)=>f.type==='function'&&['payable','nonpayable'].includes(f.stateMutability)).map((f:any)=>f.name);
  expect([...Object.keys(denied),...open].sort(),name).toEqual(mutators.sort());
  for(const [fn,args] of Object.entries(denied))await call(name,address,fn,args,other,true);
 }
 // Standard token callbacks are intentionally permissionless selectors with no side effects.
 for(const [fn,args,selector] of [
  ['onERC1155BatchReceived',[other,admin,[],[],'0x'],'0xbc197c81'],
  ['onERC1155Received',[other,admin,1n,1n,'0x'],'0xf23a6e61'],
  ['onERC721Received',[other,admin,1n,'0x'],'0x150b7a02'],
 ] as const){
  expect(await call('Governance',gov,fn,[...args],other)).toBe(selector);
  const truncated=await vm.evm.runCall({caller:createAddressFromString(other),to:createAddressFromString(gov),data:hexToBytes(selector),gasLimit:100000n});
  expect(truncated.execResult.exceptionError).toBeDefined();
 }
 // A parameterless public distribution cannot redirect funds. An invalid payment-token contract must fail.
 const invalid=await deploy('FeeSplitter',[other,admin,admin,pool,burner]);
 await call('FeeSplitter',invalid,'distribute',[],other,true);
});
