import {getCollateralAndVerify} from '@phala/dcap-qvl';
import {bytesToHex,type Hex} from 'viem';
import {hash} from './domain.js';
export interface Identity {agent:Hex;signer:Hex;measurement:Hex;quote:{quote:string;reportData:Hex;policyHash:Hex;measurement:Hex;composeHash?:string}}
/** Validate TDX collateral status and bind the quote to the expected measurement and keys. */
export async function verifyAttestation(identity:Identity,expectedMeasurement:Hex){
  const result=await getCollateralAndVerify(Buffer.from(identity.quote.quote.replace(/^0x/,''),'hex'));
  if(result.status!=='UpToDate')throw Error(`Hardware TCB is not UpToDate: ${result.status}`);
  const td=result.report.asTd10()??result.report.asTd15()?.base??result.report.asTd15Ex()?.base.base;
  if(!td)throw Error('Expected an Intel TDX quote');
  const bound=hash({agent:identity.agent.toLowerCase(),signer:identity.signer.toLowerCase(),policyHash:identity.quote.policyHash,measurement:identity.measurement});
  if(bytesToHex(td.reportData)!==`${bound}${'0'.repeat(64)}`||bound!==identity.quote.reportData)throw Error('Quote does not bind these keys and policy');
  if(identity.measurement!==expectedMeasurement)throw Error('Measurement is not the independently approved deployment');
  if(!identity.quote.composeHash)throw Error('Compose measurement missing');
  const value=(b:Uint8Array)=>bytesToHex(b).slice(2);
  const measurement=hash({mrtd:value(td.mrTd),rtmr0:value(td.rtMr0),rtmr1:value(td.rtMr1),rtmr2:value(td.rtMr2),rtmr3:value(td.rtMr3),composeHash:identity.quote.composeHash});
  if(measurement!==expectedMeasurement)throw Error('Hardware measurements differ from the approved code');
  return {status:result.status,measurement,signer:identity.signer,agent:identity.agent};
}
