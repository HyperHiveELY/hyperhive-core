import {it,expect} from 'vitest';
import {signSlip,verifySlip,verifyChain,merkleRoot,type SlipBody} from '../packages/core/proof.js';
import {ZERO,hash} from '../packages/core/domain.js';
import {wallet,policy} from './fixtures.js';
const body:SlipBody={v:1,crewId:policy.crewId,seq:1,previous:ZERO,kind:'ENTRY',policyHash:hash(policy),cardHash:ZERO,measurement:ZERO,agent:wallet.address,createdAt:1,expiresAt:30001,order:{a:0,b:true,s:'0.01',p:'60000'}};
it('binds the order, policy and chain to a recoverable signature',async()=>{const s=await signSlip(body,wallet);expect(await verifySlip(s)).toBe(true);expect(s.cloid.length).toBe(34);expect(await verifySlip({...s,body:{...body,order:{...body.order,s:'1'}}})).toBe(false);});
it('rejects a removed or reordered sequence',async()=>{const a=await signSlip(body,wallet),b=await signSlip({...body,seq:2,previous:a.digest},wallet),c=await signSlip({...body,seq:3,previous:b.digest},wallet);expect(await verifyChain([a,b,c])).toBe(true);expect(await verifyChain([a,c])).toBe(false);expect(await verifyChain([{...a,body:{...body,seq:2}}])).toBe(false);});
it('roots are order independent and change when a leaf changes',()=>{const a=hash('a'),b=hash('b'),c=hash('c');expect(merkleRoot([a,b,c])).toBe(merkleRoot([c,a,b]));expect(merkleRoot([a,b])).not.toBe(merkleRoot([a,c]));expect(merkleRoot([])).toBe(ZERO);});
