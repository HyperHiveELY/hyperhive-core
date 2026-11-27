import {describe,expect,it} from 'vitest';
import {encodeFunctionData,parseAbi,zeroAddress} from 'viem';
import {validateDeposit} from '../apps/web/src/checkout-bridge.js';
import {ELYSIUM_USDC} from '../packages/core/chain.js';

const owner='0x1111111111111111111111111111111111111111',contract='0x4cd00e387622c35bddb9b4c962c136462338bc31';
const request=('0x'+'12'.repeat(32)) as `0x${string}`;
const currency=(chainId:number,address:string,amount:string)=>({currency:{chainId,address},amount,minimumAmount:amount});
const data=encodeFunctionData({abi:parseAbi(['function depositNative(address depositor,bytes32 id) payable']),functionName:'depositNative',args:[owner,request]});
function quote(){return {details:{sender:owner,recipient:owner,currencyIn:currency(4663,zeroAddress,'10000'),currencyOut:currency(99901,ELYSIUM_USDC,'5000000')},
  steps:[{id:'deposit',kind:'transaction',requestId:request,items:[{data:{chainId:4663,from:owner,to:contract,data,value:'10000'}}]}]};}
describe('Robinhood checkout bridge',()=>{
  it('accepts only the reviewed native deposit',()=>expect(validateDeposit(quote(),owner,'USDC',5000000n)).toMatchObject({value:10000n,to:contract,data,request}));
  it.each([
    (q:ReturnType<typeof quote>)=>{q.details.recipient=zeroAddress},
    (q:ReturnType<typeof quote>)=>{q.details.currencyOut.currency.address=zeroAddress},
    (q:ReturnType<typeof quote>)=>{q.details.currencyOut.minimumAmount='4999999'},
    (q:ReturnType<typeof quote>)=>{q.steps[0].items[0].data.to=owner},
    (q:ReturnType<typeof quote>)=>{q.steps[0].items[0].data.value='10001'},
    (q:ReturnType<typeof quote>)=>{q.steps[0].items[0].data.data='0x'},
    (q:ReturnType<typeof quote>)=>{q.steps[0].items[0].data.data=data.replace(owner.slice(2),zeroAddress.slice(2)) as typeof data},
    (q:ReturnType<typeof quote>)=>{q.steps.push(q.steps[0])}
  ])('rejects changed payment terms',mutate=>{const q=quote();mutate(q);expect(()=>validateDeposit(q,owner,'USDC',5000000n)).toThrow();});
});
