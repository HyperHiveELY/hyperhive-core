import {z} from 'zod';
import {verifyMessage,type Hex} from 'viem';
import {Card,Signature,canonicalize,type Crew,hash} from './domain.js';

export const OwnerTrade=z.strictObject({card:Card.extend({why:Card.shape.why.default('Placed by you')}),signature:Signature,nonce:z.string().uuid(),issuedAt:z.number().int().positive()});
export type OwnerTrade=z.infer<typeof OwnerTrade>;
export type TradeMode='paper'|'live';
/** Use the same canonical wallet message format as owner Start and Pause controls. */
export const ownerTradeMessage=(crewId:string,policyHash:Hex,mode:TradeMode,request:Omit<OwnerTrade,'signature'>)=>`HyperHive trade v1\n${canonicalize({crewId,policyHash,mode,network:'mainnet',card:request.card,nonce:request.nonce,issuedAt:request.issuedAt})}`;
/** Bind every editable field, the execution mode and the current signed policy to the owner. */
export async function verifyOwnerTrade(crew:Crew,mode:TradeMode,request:OwnerTrade){
 try{return await verifyMessage({address:crew.owner,message:ownerTradeMessage(crew.id,hash(crew.policy),mode,request),signature:request.signature as Hex});}catch{return false;}
}
/** Keep execution failures readable without hiding the original reason. */
export function tradeReason(error:unknown){
 const message=error instanceof Error?error.message:String(error);
 return ({'Weekly risk budget exhausted':'Weekly risk budget is used up','Trade signing is not configured on this server':'Placing live trades from here switches on shortly. Your crew keeps trading as usual.','Invalidation is on the wrong side':'Put the stop below the current price for Long, or above it for Short','Sized order is below exchange minimum':'Available funds or risk budget are too small for a trade','Market data is stale':'Prices are out of date. Try again shortly','Insufficient liquidation distance':'The stop is too far from the current price for this trade'} as Record<string,string>)[message]??message.slice(0,300);
}
