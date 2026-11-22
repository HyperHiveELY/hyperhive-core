import {readFile,writeFile} from 'node:fs/promises';
import {verifyDeployment} from '../packages/core/deployment-verification.js';
const path=process.argv[2];if(!path)throw Error('Usage: npm run deploy:verify -- path/to/completed-deployment.json');
const report=await verifyDeployment(JSON.parse(await readFile(path,'utf8')));
await writeFile(path+'.verification.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(report,null,2));
if(!report.auditorWired)console.log('Contracts verified. Auditor wiring still requires the governance timelock.');
