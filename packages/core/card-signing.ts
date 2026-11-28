import {privateKeyToAccount} from 'viem/accounts';
import {verifyMessage,type Hex} from 'viem';
import {hash} from './domain.js';

/** What the worker signs for each reviewed trade card. The signer re-derives it from the database row,
 *  so a row written or edited by anyone without the worker's card key fails verification. */
export interface CardAttestation {v:1;signer:Hex;signature:Hex}
export function cardDigest(card:{id:Hex;crewId:string;body:unknown;verdict:unknown;createdAt:number}):Hex{
  return hash({v:1,kind:'hyperhive-card',id:card.id,crewId:card.crewId,body:card.body,verdict:card.verdict,createdAt:card.createdAt});
}

/** Sign a reviewed card with the worker's card key. */
export async function signCard(key:Hex,card:Parameters<typeof cardDigest>[0]):Promise<CardAttestation>{
  const account=privateKeyToAccount(key);
  return {v:1,signer:account.address.toLowerCase() as Hex,signature:await account.signMessage({message:{raw:cardDigest(card)}})};
}

/** True only when the attestation was made by the expected card signer over exactly this card. */
export async function verifyCard(expected:Hex,attestation:CardAttestation|null|undefined,card:Parameters<typeof cardDigest>[0]){
  if(!attestation||attestation.v!==1||attestation.signer?.toLowerCase()!==expected.toLowerCase())return false;
  try{return await verifyMessage({address:expected,message:{raw:cardDigest(card)},signature:attestation.signature});}catch{return false;}
}
