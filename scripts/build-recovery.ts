import {build} from 'esbuild';
import {createHash} from 'node:crypto';

export async function buildRecoveryHtml(){
const {outputFiles}=await build({entryPoints:['apps/web/src/recovery.ts'],bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,write:false});
const script=outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const digest=createHash('sha256').update(script).digest('base64');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${digest}'; style-src 'unsafe-inline'; connect-src https://api.hyperliquid.xyz; form-action 'none'; base-uri 'none'">
<title>HyperHive crew recovery</title><style>body{font:1rem system-ui;color:#202429;max-width:36rem;margin:8vh auto;padding:1rem}label,input,button{display:block;margin:.75rem 0}input,button{font:inherit;max-width:100%}button{padding:.65rem 1rem}output{display:block;overflow-wrap:anywhere}</style>
<main><h1>Recover your crew account</h1><p>Open this saved file with an internet connection to Hyperliquid. Unlock your encrypted crew backup to review the account address.</p>
<form><label>Crew backup<input id="backup" type="file" accept=".json" required></label><label>Backup password<input id="password" type="password" autocomplete="off" required></label><button>Unlock and review address</button></form>
<p>Confirmation revokes the crew’s named HyperHive agents, cancels entry orders and closes all positions on Hyperliquid mainnet. Partial closes retain protection.</p>
<button id="close" disabled>Revoke agents and close positions</button><output role="status" aria-live="polite"></output></main><script>${script}</script></html>`;
return html;
}
