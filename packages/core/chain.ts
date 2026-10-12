import type {Chain} from 'viem';

/** Kinetiq Elysium; distinct from Vulcan Forged's similarly named networks.
 * Source: https://elysium.kinetiq.xyz/docs/connecting-to-elysium (2026-11-26).
 * Contract execution/anchoring uses this chain. HyperCore trading and USDC
 * transfers retain their own exchange transport and signing domain.
 */
export const CONTRACT_CHAIN_ID = 99901 as const;
export const contractChain = {
 id: CONTRACT_CHAIN_ID,
 name: 'Elysium',
 nativeCurrency: {name:'HYPE',symbol:'HYPE',decimals:18},
 rpcUrls: {default:{http:['https://rpc.elysium.kinetiq.xyz']}},
 blockExplorers: {default:{name:'Elysium Explorer',url:'https://elysium.kinetiq.xyz/explorer'}},
} as const satisfies Chain;
export const contractRpc = contractChain.rpcUrls.default.http[0];
/** Build the Elysium explorer link for a contract address or transaction. */
export const contractExplorer = (kind:'address'|'transaction',value:string) => kind==='address'?`https://elysium.kinetiq.xyz/address/${value}`:`${contractChain.blockExplorers.default.url}/tx/${value}`;
// Canonical token published by Kinetiq, checked 2026-11-26:
// https://elysium.kinetiq.xyz/docs/contract-addresses
export const ELYSIUM_USDC='0xb47c4c8f73f009cc0c0d3f92b388d13e293f0b65' as const;
