import {CONTRACT_CHAIN_ID} from './chain.js';
import { concat, keccak256, hashTypedData, recoverTypedDataAddress, type Hex } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import { canonicalize, hash, ZERO } from './domain.js';
export interface SlipBody {v:1;crewId:string;seq:number;previous:Hex;kind:string;policyHash:Hex;cardHash:Hex;measurement:Hex;agent:Hex;createdAt:number;expiresAt:number;order:Record<string,unknown>;rootContract?:Hex;chainId?:999|typeof CONTRACT_CHAIN_ID;account?:Hex}
export interface SignedSlip {digest:Hex;cloid:Hex;body:SlipBody;signature:Hex;signer:Hex;ack?:unknown}
const types={Slip:[{name:'bodyHash',type:'bytes32'},{name:'crewId',type:'bytes32'},{name:'seq',type:'uint32'},{name:'previous',type:'bytes32'},{name:'policyHash',type:'bytes32'},{name:'measurement',type:'bytes32'},{name:'agent',type:'address'},{name:'createdAt',type:'uint64'},{name:'expiresAt',type:'uint64'}]} as const;
/** Construct the EIP-712 domain and fields for current and historical execution slips. */
export function slipTypedData(body:SlipBody){
  if(!body.rootContract)throw Error('Slip has no EIP-712 verifying contract');
  // Absent chain IDs are historical HyperEVM records, accepted only for offline verification.
  const chainId=body.chainId??999;if(chainId!==999&&chainId!==CONTRACT_CHAIN_ID)throw Error('Unsupported slip chain');
  return {domain:{name:'HyperHive',version:'1',chainId,verifyingContract:body.rootContract,salt:hash('HyperHive/slip/v1')},types,primaryType:'Slip' as const,message:{bodyHash:hash(body),crewId:hash(body.crewId),seq:body.seq,previous:body.previous,policyHash:body.policyHash,measurement:body.measurement,agent:body.agent,createdAt:BigInt(body.createdAt),expiresAt:BigInt(body.expiresAt)}};
}
/** Bind the order intent to its hash-chain predecessor and derive its venue client order ID. */
export async function signSlip(input:SlipBody,key:PrivateKeyAccount,rootContract:Hex='0x0000000000000000000000000000000000000000'):Promise<SignedSlip>{
  const body={...input,rootContract,chainId:CONTRACT_CHAIN_ID},typed=slipTypedData(body),digest=hashTypedData(typed);
  return {digest,cloid:digest.slice(0,34) as Hex,body,signature:await key.signTypedData(typed),signer:key.address};
}
/** Recompute the digest and client order ID and verify the claimed signer. */
export async function verifySlip(s:SignedSlip){
  try{const typed=slipTypedData(s.body);return hashTypedData(typed)===s.digest&&s.cloid===s.digest.slice(0,34)&&(await recoverTypedDataAddress({...typed,signature:s.signature})).toLowerCase()===s.signer.toLowerCase();}catch{return false;}
}
/** Compute the sorted-pair Merkle root, using the zero digest for an empty hour. */
export function merkleRoot(leaves:Hex[]):Hex{
  let level=[...leaves].sort();if(!level.length)return ZERO;
  while(level.length>1){const next:Hex[]=[];for(let i=0;i<level.length;i+=2){if(!level[i+1])next.push(level[i]);else next.push(keccak256(concat([level[i],level[i+1]].sort() as Hex[])));}level=next;}return level[0];
}
/** Check sequence numbers, predecessor links and signatures from the start of a crew journal. */
export async function verifyChain(slips:SignedSlip[]){let previous:Hex=ZERO,seq=1;for(const s of [...slips].sort((a,b)=>a.body.seq-b.body.seq)){if(s.body.seq!==seq||s.body.previous!==previous||!await verifySlip(s))return false;previous=s.digest;seq++;}return true;}
/** Format the signed acknowledgement binding a venue response to one slip digest. */
export const ackMessage=(digest:Hex,response:unknown)=>`HyperHive acknowledgement v1\n${canonicalize({digest,response})}`;
