import { z } from 'zod';
import { keccak256, stringToHex, verifyMessage, type Hex } from 'viem';
import { canonicalize } from '../eko/canonical.js';
export { canonicalize };
/** Hash the canonical representation used by signed records, policies and stable identifiers. */
export const hash = (v: unknown): Hex => keccak256(stringToHex(canonicalize(v)));
export const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(v => v.toLowerCase() as Hex);
export const Signature = z.string().regex(/^0x[0-9a-fA-F]{130}$/);
export const Policy = z.strictObject({
  v:z.literal(1), network:z.literal('mainnet'), owner:Address, account:Address,
  crewId:z.string().uuid(), name:z.string().min(1).max(40), markets:z.array(z.string().regex(/^[A-Za-z0-9]{1,15}$/)).min(1).max(30),
  weeklyBudget:z.number().positive().max(100000), maxAccountValue:z.number().positive().max(1000000),
  plan:z.enum(['crew','pro']), generation:z.number().int().min(0), issuedAt:z.number().int().positive(),
  expiresAt:z.number().int().positive(), origin:z.string().url(),
});
export type Policy = z.infer<typeof Policy>;
/** Format the exact wallet-signing message for a crew trading policy. */
export const policyMessage = (policy:Policy) => `HyperHive trading policy v1\n${canonicalize(policy)}`;
/** Derive the key used to look up the legacy crew subscription entitlement. */
export const subscriptionKey=(policy:Policy)=>policy.plan==='pro'?hash({owner:policy.owner,plan:'pro'}):hash(policy.crewId);
/** Verify the signed policy and its validity period, optionally allowing historical verification. */
export async function verifyPolicy(policy:Policy,signature:string,now=Date.now(),allowExpired=false) {
  return policy.issuedAt <= now+30000 && (allowExpired||policy.expiresAt>now) && policy.expiresAt>policy.issuedAt && policy.expiresAt-policy.issuedAt<=180*86400000
    && verifyMessage({address:policy.account,message:policyMessage(policy),signature:signature as Hex});
}
export const Card = z.strictObject({market:z.string().min(1).max(15),side:z.enum(['long','short']),invalidationPx:z.number().positive(),horizonH:z.number().int().min(4).max(72),why:z.string().min(1).max(400)});
export type Card = z.infer<typeof Card>;
export const Decision = z.strictObject({verdict:z.enum(['PASS','KILL']),reasons:z.array(z.string().max(200)).max(3)});
export const ZERO = `0x${'0'.repeat(64)}` as Hex;
export interface Crew {id:string; owner:Hex; account:Hex; policy:Policy; signature:string; paused:boolean; created_at:number; paid_until:number; broken_since:number|null}
export interface Snapshot {market:string;asset:number;mark:number;atr:number;rv:number;oiUsd:number;funding:number;szDecimals:number;maxLeverage:number;timestamp:number;closes:number[]}
export interface PositionState {market:string;side:'long'|'short';entry:number;size:number;stop:number;tp:number;extreme:number;openedAt:number;horizonH:number;entryDigest:Hex;lastModify:number;fundingStart:number;fundingPaid:number;risk:number}
/** Compute the UTC week boundary used to aggregate weekly risk and venue activity. */
export function weekStart(now=Date.now()) {const d=new Date(now); d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7)); return d.getTime();}
/** Bind an owner command to the crew, policy hash, nonce and issuance time. */
export const controlMessage=(crewId:string,action:'pause'|'resume'|'close',nonce:string,policyHash:Hex,issuedAt:number)=>`HyperHive control v1\n${canonicalize({crewId,action,nonce,policyHash,issuedAt,network:'mainnet'})}`;
