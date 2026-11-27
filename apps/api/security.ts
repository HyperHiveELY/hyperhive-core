import {contractRpc} from '../../packages/core/chain.js';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {parse, type DefaultTreeAdapterTypes} from 'parse5';
/** Build the browser policy using hashes of inline scripts and approved service origins. */
export function contentSecurityPolicy(html:string[]){
 const hashes=new Set<string>();
 function visit(node: DefaultTreeAdapterTypes.Node) {
   if ('tagName' in node && node.tagName === 'script' && !node.attrs.some(attr => attr.name === 'src')) {
     const script = node.childNodes.map(child => 'value' in child ? child.value : '').join('');
     if (script.trim()) hashes.add("'sha256-" + createHash('sha256').update(script).digest('base64') + "'");
   }
   if ('childNodes' in node) node.childNodes.forEach(visit);
 }
 for (const doc of html) visit(parse(doc));
 return ["default-src 'self'","script-src 'self' "+[...hashes].join(' '),"script-src-attr 'none'","style-src 'self' 'unsafe-inline'","img-src 'self' data: blob: https://app.hyperliquid.xyz/coins/","font-src 'self' data:",`connect-src 'self' https://api.hyperliquid.xyz https://rpc.hyperliquid.xyz https://mainnet.base.org ${new URL(contractRpc).origin}`,"worker-src 'self' blob:","object-src 'none'","base-uri 'self'","form-action 'self'","frame-ancestors 'none'"].join('; ');
}
/** Read the shipped HTML entry points and derive their production Content-Security-Policy header. */
export async function productionCsp(){const html=await Promise.all(['dist/web/index.html','dist/web/app.html','dist/web/crew-recovery.html'].map(p=>readFile(p,'utf8')));return contentSecurityPolicy(html);}
