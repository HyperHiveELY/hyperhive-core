import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {prepareDeployment} from '../packages/core/deployment.js';
const file=process.argv[2];
if(!file)throw Error('Usage: npm run deploy:plan -- path/to/public-deployment-inputs.json');
const plan=await prepareDeployment(JSON.parse(await readFile(file,'utf8')));
await mkdir('.data',{recursive:true,mode:0o700});
await writeFile('.data/elysium-deployment-plan.json',JSON.stringify({...plan,notes:[
 'Unsigned Elysium transactions only. No key was read and nothing was broadcast.',
 'Use a dedicated funded deployer. Check pending nonce and gas before each signature.',
 'Run deploy:verify after deployment. Schedule auditor wiring through governance; execute after 48 hours.',
 'HyperCore remains the trading and customer Token-payment venue. Elysium gas is HYPE.'
]},null,2),{mode:0o600});
console.log('Prepared .data/elysium-deployment-plan.json for Elysium (99901). Nothing broadcast.');
