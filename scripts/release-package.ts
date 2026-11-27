import {mkdtemp,mkdir,readdir,readFile,writeFile,rm,lstat} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const root=resolve('.'),stage=await mkdtemp(join(tmpdir(),'hyperhive-release-'));
const files:{path:string;sha256:string}[]=[];
const forbidden=new Set(['node_modules','.data','.git','dist','output','out','.DS_Store']);
async function copy(path:string){
 const src=resolve(root,path),stat=await lstat(src);
 if(stat.isSymbolicLink())throw Error('Release source cannot contain symbolic links: '+path);
 if(stat.isDirectory()){for(const name of (await readdir(src)).sort())if(!forbidden.has(name)&&(!name.startsWith('.env')||name==='.env.example')&&!name.endsWith('.log')&&!name.endsWith('.env'))await copy(join(path,name));return;}
 const raw=await readFile(src);
 // The private checkout appends its promotion job after the public verification workflow.
 const data=path==='.github/workflows/verify.yml' ? Buffer.from(raw.toString().split('\n  # Private promotion job\n',1)[0]) : raw;
 if(path==='.npmrc'&&data.toString().trim()!=='ignore-scripts=true\nmin-release-age=3\nsave-exact=true')throw Error('Review the public npm installation policy before packaging');await mkdir(join(stage,path,'..'),{recursive:true});await writeFile(join(stage,path),data,{mode:stat.mode & 0o777});files.push({path,sha256:createHash('sha256').update(data).digest('hex')});
}
try{
 for(const path of ['package.json','package-lock.json','tsconfig.json','vite.config.ts','vitest.config.ts','Dockerfile','.dockerignore','.gitignore','.env.example','README.md','SECURITY.md','LICENSE','.npmrc','.nvmrc','.gitleaks.toml','.github/workflows/verify.yml','foundry.toml','stryker.config.json','vitest.mutation.config.ts','apps','packages','contracts/src','contracts/test','deploy','scripts','tests','third-party'])await copy(path);
 // Never include real deploy/*.env credentials even if present locally.
 if(files.some(f=>f.path.startsWith('deploy/')&&f.path.endsWith('.env')))throw Error('Remove deployment credentials from the release source selection');
 const manifest={createdAt:new Date().toISOString(),kind:'source-deployment-package',published:false,containerBuilt:false,files};await writeFile(join(stage,'SOURCE_MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
 await mkdir('output/launch',{recursive:true});const artifact=resolve('output/launch/HyperHive-Launch-Package.tar.gz');
 await new Promise<void>((resolve,reject)=>{const p=spawn('tar',['-czf',artifact,'-C',stage,'.'],{stdio:'inherit',env:{...process.env,COPYFILE_DISABLE:'1'}});p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(Error('Archive creation failed')));});
 const sha256=createHash('sha256').update(await readFile(artifact)).digest('hex');await writeFile(artifact+'.sha256',`${sha256}  ${relative(resolve('output/launch'),artifact)}\n`);console.log(`Deployment package: ${artifact}\nSHA256: ${sha256}\n${files.length} source files; no credentials, wallet backups or database included. Container must still be built and published.`);
}finally{await rm(stage,{recursive:true,force:true});}
