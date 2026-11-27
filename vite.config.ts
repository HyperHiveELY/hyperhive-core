import { defineConfig } from 'vite';
import {buildRecoveryHtml} from './scripts/build-recovery.js';
import react from '@vitejs/plugin-react';
import {readFileSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('dist/web');
// The SPA shell serves every page, including the landing at `/`. The API serves
// dist/web/index.html for `/` and dist/web/app.html for everything else, so the
// build writes the same shell under both names.
export default defineConfig({plugins:[react(),{
 name:'hyperhive-shell',
 async generateBundle(){this.emitFile({type:'asset',fileName:'crew-recovery.html',source:await buildRecoveryHtml()});},
 configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0]==='/crew-recovery.html'){
   buildRecoveryHtml().then(html=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}).catch(next);return;
  }next();});},
 // writeBundle runs only after an actual build (closeBundle also runs when the dev server stops).
 writeBundle(){copyFileSync(resolve(out,'index.html'),resolve(out,'app.html'));},
 configurePreviewServer(server){server.middlewares.use((req,res,next)=>{const path=req.url?.split('?')[0]??'';if(!path.startsWith('/api')&&path!=='/'&&!/\.[a-z0-9]+$/i.test(path)){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(readFileSync(resolve(out,'app.html'),'utf8'));return;}next();});}
}],root:'apps/web',server:{port:5188,proxy:{'/api':'http://127.0.0.1:8788'}},build:{outDir:'../../dist/web',emptyOutDir:true,target:'esnext'}});
