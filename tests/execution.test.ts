import {it,expect,vi} from 'vitest';
import {ApiRequestError} from '@nktkas/hyperliquid';
import {orderResult} from '../packages/core/execution.js';
it('retains fills when a protective order in the same batch is rejected',async()=>{
  const raw={status:'ok',response:{type:'order',data:{statuses:[{filled:{totalSz:'1',avgPx:'50000',oid:123}},{error:'Trigger rejected'}]}}};
  const send=vi.fn().mockRejectedValue(new ApiRequestError(raw));
  expect((await orderResult(send,2)).response.data.statuses).toEqual(raw.response.data.statuses);expect(send).toHaveBeenCalledOnce();
});
it('records an explicit batch rejection without resubmitting it',async()=>{
  const send=vi.fn().mockRejectedValue(new ApiRequestError({status:'err',response:'Invalid signature'}));
  expect((await orderResult(send,2)).response.data.statuses).toEqual([{error:'Invalid signature'},{error:'Invalid signature'}]);expect(send).toHaveBeenCalledOnce();
});
it('leaves lost or incomplete responses uncertain instead of inventing rejection',async()=>{
  await expect(orderResult(()=>Promise.reject(Error('Network disconnected')),3)).rejects.toThrow('Network disconnected');
  await expect(orderResult(()=>Promise.resolve({status:'ok',response:{type:'order',data:{statuses:[{resting:{oid:1}}]}}}),3)).rejects.toThrow('incomplete');
});
