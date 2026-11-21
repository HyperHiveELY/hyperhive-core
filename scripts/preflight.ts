import {createPublicClient,http} from 'viem';
import {CONTRACT_CHAIN_ID} from '../packages/core/chain.js';
import {existsSync} from 'node:fs';
import {config} from '../packages/core/config.js';
import {localMode} from '../packages/core/local-mode.js';
import {pinnedLocalSigner} from '../apps/signer/local-keys.js';
import {ppqKey,modelSettings} from '../packages/core/secrets.js';
import {tokenPricing} from '../packages/core/tokens.js';
import {markets} from '../packages/core/venue.js';
const local=localMode(),models=await modelSettings();
const checks=[{name:'AI service configured',ok:Boolean(await ppqKey())},{name:'Separate AI model families selected',ok:Boolean(models.scout&&models.skeptic&&models.scout.split('/')[0]!==models.skeptic.split('/')[0])},{name:'Postgres configured',ok:Boolean(config.DATABASE_URL)},{name:'Mainnet execution enabled',ok:config.LIVE_TRADING_ENABLED==='true'}];
if(local){let pinned=false;try{await pinnedLocalSigner();pinned=true;}catch{}checks.push({name:'Loopback-only local mode',ok:true},{name:'Local signer identity pinned',ok:pinned});}
else checks.push({name:'dstack socket present on this host',ok:existsSync(config.DSTACK_SOCKET)},{name:'Approved measurement configured',ok:Boolean(config.MEASUREMENT_HASH)},{name:'Root contract configured',ok:Boolean(config.ROOT_CONTRACT)});
checks.push({name:'Hyperliquid Token checkout ready',ok:(await tokenPricing()).checkoutReady});
try{checks.push({name:'Hyperliquid mainnet market API reachable',ok:(await markets()).length>0});}catch{checks.push({name:'Hyperliquid mainnet market API reachable',ok:false});}
try{checks.push({name:'Elysium mainnet RPC (99901)',ok:await createPublicClient({transport:http(config.ELYSIUM_RPC)}).getChainId()===CONTRACT_CHAIN_ID});}catch{checks.push({name:'Elysium mainnet RPC (99901)',ok:false});}
for(const c of checks)console.log(`${c.ok?'PASS':'NEEDED'}  ${c.name}`);
console.log('Per-crew funding, agent approval and signed Start are checked separately in the dashboard.');
if(checks.some(c=>!c.ok))process.exitCode=1;
