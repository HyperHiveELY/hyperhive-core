import {it,expect} from 'vitest';
import {hashTypedData} from 'viem';
import {CONTRACT_CHAIN_ID,contractChain,ELYSIUM_USDC} from '../packages/core/chain.js';
import {signSlip,slipTypedData,verifySlip,type SlipBody} from '../packages/core/proof.js';
import {runtimeMatches,verifyDeployment} from '../packages/core/deployment-verification.js';
import {DeploymentInput} from '../packages/core/deployment.js';
import {commitment,type Vote} from '../apps/web/src/integration-wallet.js';
import {wallet,policy} from './fixtures.js';
import {ZERO,hash} from '../packages/core/domain.js';
const body:SlipBody={v:1,crewId:policy.crewId,seq:1,previous:ZERO,kind:'ENTRY',policyHash:hash(policy),cardHash:ZERO,measurement:ZERO,account:policy.account,agent:wallet.address,createdAt:1,expiresAt:30001,order:{}};
it('signs new records for Elysium and rejects a changed account or chain',async()=>{
 const s=await signSlip(body,wallet);expect(s.body.chainId).toBe(CONTRACT_CHAIN_ID);expect(contractChain.id).toBe(99901);
 expect(await verifySlip(s)).toBe(true);
 expect(await verifySlip({...s,body:{...s.body,chainId:999}})).toBe(false);
 expect(await verifySlip({...s,body:{...s.body,account:'0x'+'12'.repeat(20) as `0x${string}`}})).toBe(false);
});
it('can still verify historical HyperEVM signatures offline without reinterpreting them as Elysium',async()=>{
 const old={...body,rootContract:'0x'+'00'.repeat(20) as `0x${string}`};const typed=slipTypedData(old),digest=hashTypedData(typed);
 expect(typed.domain.chainId).toBe(999);
 expect(await verifySlip({body:old,digest,cloid:digest.slice(0,34) as `0x${string}`,signature:await wallet.signTypedData(typed),signer:wallet.address})).toBe(true);
});
it('rejects old-chain deployment backups and auditor commitments before RPC or signing',async()=>{
 await expect(verifyDeployment({chainId:999})).rejects.toThrow('Elysium');
 expect(()=>commitment({chainId:999} as unknown as Vote)).toThrow();
});
it('compares runtime code with compiler-defined immutable offsets only',()=>{
 const artifact={evm:{deployedBytecode:{object:'6000006001',immutableReferences:{'1':[{start:1,length:2}]}}}};
 expect(runtimeMatches('0x60aabb6001',artifact)).toBe(true);
 expect(runtimeMatches('0x61aabb6001',artifact)).toBe(false);
 expect(runtimeMatches('0x60aabb600100',artifact)).toBe(false);
});
it('rejects the former-chain USDC address in deployment inputs',()=>{
 const addr=wallet.address,input={deployer:addr,governanceProposer:addr,guardian:addr,treasury:addr,workers:addr,tokenRecipient:addr,usdc:ELYSIUM_USDC,hhivSupply:'100000000',minimumAuditorStake:'10000'};
 expect(DeploymentInput.safeParse(input).success).toBe(true);
 expect(DeploymentInput.safeParse({...input,usdc:'0xb88339CB7199b77E23DB6E890353E22632Ba630f'}).success).toBe(false);
});
