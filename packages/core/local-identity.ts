import {verifyMessage,type Hex} from 'viem';
import {hash,canonicalize,type Crew} from './domain.js';
export const LOCAL_MEASUREMENT=hash('HyperHive/local-signer/v1/NOT-HARDWARE-ATTESTED');
export const LOCAL_ROOT='0x0000000000000000000000000000000000000000' as Hex;
export interface LocalBinding {kind:'local';v:1;network:'mainnet';crewId:string;account:Hex;agent:Hex;signer:Hex;policyHash:Hex;generation:number;issuedAt:number;expiresAt:number}
/** Serialize the local binding signed by the pinned development signer. */
export const localIdentityMessage=(binding:LocalBinding)=>`HyperHive local signer identity v1\n${canonicalize(binding)}`;
export interface LocalIdentity {agent:Hex;signer:Hex;measurement:Hex;generation:number;quote:{kind:'local';binding:LocalBinding;signature:Hex}}
/** Verify the signer pin, crew, generation, policy hash and freshness of a local binding. */
export async function verifyLocalIdentity(identity:LocalIdentity,crew:Crew,pinnedSigner:Hex,now=Date.now()){
 const b=identity.quote?.binding;
 if(identity.quote?.kind!=='local'||identity.measurement!==LOCAL_MEASUREMENT||!b||b.kind!=='local'||b.v!==1||b.network!=='mainnet')throw Error('Not a local signer identity');
 if(b.crewId!==crew.id||b.account!==crew.account||b.generation!==crew.policy.generation||identity.generation!==b.generation||b.policyHash!==hash(crew.policy))throw Error('Local identity does not bind this policy');
 if(b.signer.toLowerCase()!==pinnedSigner.toLowerCase()||identity.signer.toLowerCase()!==pinnedSigner.toLowerCase()||identity.agent.toLowerCase()!==b.agent.toLowerCase())throw Error('Local signer differs from the pinned installation');
 if(b.issuedAt>now+30000||b.expiresAt<=now||b.expiresAt-b.issuedAt>2*3600000)throw Error('Local identity is stale');
 if(!await verifyMessage({address:pinnedSigner,message:localIdentityMessage(b),signature:identity.quote.signature}))throw Error('Local identity signature invalid');
 return {status:'LOCAL_SIGNED',mode:'local',agent:identity.agent,signer:identity.signer,measurement:LOCAL_MEASUREMENT,hardwareAttested:false};
}
