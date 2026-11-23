import {readFile} from 'node:fs/promises';
import {verifyChain,merkleRoot,type SignedSlip} from '../packages/core/proof.js';
import {verifyAttestation} from '../packages/core/attestation.js';
import type {Hex} from 'viem';
import {verifyOnline} from '../packages/core/online-verifier.js';
const [file,measurement,origin,contract]=process.argv.slice(2);if(!file)throw Error('Usage: npm run verify -- record.json [approved-measurement] [archive-origin] [SlipRoot-address]');
const data=JSON.parse(await readFile(file,'utf8'));const slips=data.slips as SignedSlip[];
if(!Array.isArray(slips)||!await verifyChain(slips))throw Error('Signed chain verification failed');
console.log(JSON.stringify({signatureChain:'valid',slips:slips.length,root:merkleRoot(slips.map(s=>s.digest))}));
if(measurement){if(!data.identity)throw Error('Identity missing');console.log(await verifyAttestation(data.identity,measurement as Hex));}
else console.log('Hardware attestation not checked. Supply an independently approved measurement.');
if(origin||contract){if(!origin||!contract||!measurement)throw Error('Online verification requires origin, contract and approved measurement');console.log(await verifyOnline(data,measurement as Hex,origin,contract as Hex));}
else console.log('Offline check only: exchange fills, archive completeness and on-chain anchoring NOT checked.');
