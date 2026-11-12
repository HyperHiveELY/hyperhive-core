import type {Market} from './catalog.js';
type ProjectLink={label:string;url:string;kind:'web'|'x'|'community'|'docs'};
export type Project={name:string;category:string;links:ProjectLink[];source:string};
// Links checked against the named first-party pages on 2026-11-14.
// Native perpetual identity is explicit; never infer project links from an arbitrary spot ticker.
const native:Record<string,Project>={
 HYPE:{name:'Hyperliquid',category:'Layer 1 · Exchange',source:'https://hyperliquid.xyz',links:[{label:'Website',url:'https://hyperliquid.xyz',kind:'web'},{label:'X',url:'https://x.com/hyperliquidx',kind:'x'},{label:'Telegram',url:'https://t.me/hyperliquid_announcements',kind:'community'},{label:'Docs',url:'https://hyperliquid.gitbook.io/hyperliquid-docs',kind:'docs'}]},
 BTC:{name:'Bitcoin',category:'Digital currency',source:'https://bitcoin.org',links:[{label:'Website',url:'https://bitcoin.org',kind:'web'},{label:'Docs',url:'https://developer.bitcoin.org',kind:'docs'}]},
 ETH:{name:'Ethereum',category:'Layer 1 · Smart contracts',source:'https://ethereum.org',links:[{label:'Website',url:'https://ethereum.org',kind:'web'},{label:'X · ethereum.org',url:'https://x.com/ethdotorg',kind:'x'}]},
 SOL:{name:'Solana',category:'Layer 1 · Smart contracts',source:'https://solana.com/community',links:[{label:'Website',url:'https://solana.com',kind:'web'},{label:'Community',url:'https://solana.com/community',kind:'community'}]},
 ZEC:{name:'Zcash',category:'Privacy · Digital currency',source:'https://z.cash',links:[{label:'Website',url:'https://z.cash',kind:'web'},{label:'X',url:'https://twitter.com/zcash',kind:'x'},{label:'Telegram',url:'https://t.me/zcash_community',kind:'community'}]},
};
export const HYPE_TOKEN_ID='0x0d01dc56dcaaca66ad901c959b4011ec';
const unitLogos:Record<string,string>={
 '0x8f254b963e8468305d409b33aa137c67':'BTC_spot',
 '0xe1edd30daaf5caac3fe63569e24748da':'ETH_spot',
 '0x49b67c39f5566535de22b29b0e51e685':'SOL_spot',
};
export function projectFor(m:Market):Project|undefined{
 if(m.kind==='Perps')return native[m.coin];
 if(m.kind==='Spot'&&m.tokenId===HYPE_TOKEN_ID)return native.HYPE;
 return undefined;
}
export function coinLogo(m:Market){
 const key=m.kind==='Spot'?(unitLogos[m.tokenId??'']??m.symbol+'_spot'):m.coin;
 return 'https://app.hyperliquid.xyz/coins/'+encodeURIComponent(key)+'.svg';
}
export function logoHue(identity:string){return [...identity].reduce((sum,c)=>(sum*31+c.charCodeAt(0))%360,0);}
