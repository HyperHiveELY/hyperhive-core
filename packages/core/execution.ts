import { ApiRequestError } from '@nktkas/hyperliquid';

export type OrderStatus = 'waitingForFill' | 'waitingForTrigger' | {error:string} | {filled:{totalSz:string;avgPx:string;oid:number}} | {resting:{oid:number}};
export interface OrderResult {status:'ok';response:{type:'order';data:{statuses:OrderStatus[]}}}

/** Preserve every result of a partially accepted batch. Transport failures stay uncertain. */
export async function orderResult(send:()=>Promise<unknown>,count:number):Promise<OrderResult>{
  let result:unknown;
  try{result=await send();}catch(error){
    if(!(error instanceof ApiRequestError))throw error;
    result=error.response;
    if((result as any)?.status==='err'&&typeof (result as any).response==='string'){
      return {status:'ok',response:{type:'order',data:{statuses:Array.from({length:count},()=>({error:(result as any).response}))}}};
    }
  }
  const r=result as OrderResult;
  if(r?.status!=='ok'||r.response?.type!=='order'||!Array.isArray(r.response.data?.statuses)||r.response.data.statuses.length!==count)throw Error('Uncertain exchange response: incomplete order statuses');
  for(const s of r.response.data.statuses){
    if(s==='waitingForFill'||s==='waitingForTrigger')continue;
    if(!s||typeof s!=='object'||!('error' in s||'filled' in s||'resting' in s))throw Error('Uncertain exchange response: unknown order status');
  }
  return r;
}
