import {createPublicClient, http, parseAbi, type Hex} from 'viem';
import {CONTRACT_CHAIN_ID} from './chain.js';

export const rosterAbi = parseAbi([
  'function crewCount() view returns (uint256)',
  'function crewRoster(uint256) view returns (bytes32 id, address account, uint64 registeredAt)',
  'function crewAccount(bytes32) view returns (address)',
  'function registerCrew(bytes32,address)',
  'function registry() view returns (address)',
]);
const measurementAbi = parseAbi([
  'function approved(address) view returns (bool)',
  'function posterMeasurement(address) view returns (bytes32)',
]);

/** Check the active poster and its measurement against the registry at a single block. */
export async function approvedPoster(rpcUrl:string, root:Hex, signer:Hex, measurement:Hex) {
  const rpc = createPublicClient({transport:http(rpcUrl)});
  if (await rpc.getChainId() !== CONTRACT_CHAIN_ID) throw Error('Expected Elysium mainnet');
  const blockNumber = await rpc.getBlockNumber();
  const address = await rpc.readContract({address:root, abi:rosterAbi, functionName:'registry', blockNumber});
  const [approved, bound] = await Promise.all([
    rpc.readContract({address, abi:measurementAbi, functionName:'approved', args:[signer], blockNumber}),
    rpc.readContract({address, abi:measurementAbi, functionName:'posterMeasurement', args:[signer], blockNumber}),
  ]);
  if (!approved || bound !== measurement) throw Error('Signer measurement is inactive or unregistered');
}

/** Read all on-chain crew registrations that existed before the end of the requested hour. */
export async function hourlyRoster(rpcUrl:string, address:Hex, hour:number) {
  const rpc = createPublicClient({transport:http(rpcUrl)});
  if (await rpc.getChainId() !== CONTRACT_CHAIN_ID) throw Error('Expected Elysium mainnet');
  const blockNumber = await rpc.getBlockNumber();
  const count = await rpc.readContract({address, abi:rosterAbi, functionName:'crewCount', blockNumber});
  const roster = new Map<Hex,{account:string; since:number}>();
  for (let i=0n; i<count; i++) {
    const [id,account,registeredAt] = await rpc.readContract({address, abi:rosterAbi, functionName:'crewRoster', args:[i], blockNumber});
    if (registeredAt >= BigInt(hour+1)*3600n) break;
    roster.set(id,{account:account.toLowerCase(), since:Number(registeredAt)*1000});
  }
  return roster;
}
