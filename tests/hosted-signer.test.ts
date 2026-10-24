import {afterEach,expect,it,vi} from 'vitest';
import {generatePrivateKey} from 'viem/accounts';
import {hexToBytes} from 'viem';
import {Signer} from '../apps/signer/engine.js';
import {Database} from '../packages/core/db.js';
import {config} from '../packages/core/config.js';
import {ZERO,hash} from '../packages/core/domain.js';
import {wallet,crew} from './fixtures.js';
const h=vi.hoisted(()=>({details:vi.fn(),key:vi.fn(),quote:vi.fn(),read:vi.fn(),write:vi.fn(),receipt:vi.fn()}));
vi.mock('@phala/dstack-sdk',()=>({DstackClient:class{info=h.details;getKey=h.key;getQuote=h.quote}}));
vi.mock('viem',async original=>({...await original<typeof import('viem')>(),createPublicClient:()=>({getChainId:async()=>99901,getBlockNumber:async()=>100n,readContract:h.read,waitForTransactionReceipt:h.receipt}),createWalletClient:()=>({writeContract:h.write})}));
const prior={...config};
afterEach(()=>Object.assign(config,prior));
it('binds enclave identity to the signed policy, waits for enrollment and confirms the archived root',async()=>{
 const db=await new Database('memory').init(),c=await crew(),signer=new Signer(db);
 const tcb={mrtd:'00',rtmr0:'01',rtmr1:'02',rtmr2:'03',rtmr3:'04'},measurement=hash({...tcb,composeHash:'fixture'});
 Object.assign(config,{SIGNER_MODE:'phala',DATABASE_URL:'memory',MEASUREMENT_HASH:measurement,ROOT_CONTRACT:wallet.address,LIVE_TRADING_ENABLED:'true'});
 h.details.mockResolvedValue({tcb_info:tcb,compose_hash:'fixture'});
 const key=hexToBytes(generatePrivateKey());h.key.mockResolvedValue({key});h.quote.mockResolvedValue({quote:'fixture',event_log:[]});
 let member='0x'+'00'.repeat(20);
 h.read.mockImplementation(async({functionName})=>({approved:true,registry:wallet.address,posterMeasurement:measurement,crewAccount:member,lastHour:0n,lastRoot:ZERO})[functionName as 'approved']);
 h.write.mockResolvedValue(ZERO);h.receipt.mockResolvedValue({status:'success'});
 try{
  await db.query('INSERT INTO crews(id,owner,account,policy,signature,created_at) VALUES($1,$2,$3,$4,$5,$6)',[c.id,c.owner,c.account,JSON.stringify(c.policy),c.signature,c.created_at]);
  await signer.init();await signer.identity(c);await signer.identity(c);
  expect(h.key.mock.calls.map(x=>x[0])).toEqual(['hyperhive/slip/v1','hyperhive/crew/'+c.id+'/agent/0']);expect(h.quote).toHaveBeenCalledOnce();
  expect((await db.query<any>('SELECT quote FROM identities')).rows[0].quote.policyHash).toBe(hash(c.policy));
  expect(await (signer as any).registered(c)).toBe(false);await (signer as any).anchoring;
  expect(h.write.mock.calls[0][0]).toMatchObject({functionName:'registerCrew',args:[hash(c.id),c.account]});
  member=c.account;expect(await (signer as any).registered(c)).toBe(true);
  member='0x'+'55'.repeat(20);await expect((signer as any).registered(c)).rejects.toThrow('another account');
  await db.query('INSERT INTO roots(hour,root,count) VALUES(1,$1,0)',[ZERO]);await signer.anchor();
  expect(h.write.mock.calls[1][0]).toMatchObject({functionName:'postSlipRoot',args:[1n,ZERO,0,ZERO]});
  expect((await db.query<any>('SELECT status FROM roots')).rows[0].status).toBe('ANCHORED');
 }finally{await db.close();}
});
