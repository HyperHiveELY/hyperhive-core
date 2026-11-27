import {createPublicClient, erc20Abi, http, parseEventLogs, parseUnits, type Hex} from 'viem';
import {contractChain, ELYSIUM_USDC} from './chain.js';
import {config} from './config.js';
import {creditTransferData} from './credit-transfer.js';
import type {TokenInvoice} from './tokens.js';

function client() {
 return createPublicClient({chain: contractChain, transport: http(config.ELYSIUM_RPC)});
}

export async function creditPaymentNonce(owner: Hex) {
 const rpc = client();
 if (await rpc.getChainId() !== contractChain.id) throw Error('Checkout requires Elysium mainnet');
 if (await rpc.readContract({address: ELYSIUM_USDC, abi: erc20Abi, functionName: 'decimals'}) !== 6)
  throw Error('Canonical USDC is unavailable');
 return rpc.getTransactionCount({address: owner, blockTag: 'pending'});
}

export async function verifyCreditTransfer(invoice: TokenInvoice, hash: Hex, rpc = client()) {
 if (await rpc.getChainId() !== contractChain.id) throw Error('Checkout requires Elysium mainnet');
 const [tx, receipt, finalized] = await Promise.all([
  rpc.getTransaction({hash}), rpc.getTransactionReceipt({hash}), rpc.getBlock({blockTag: 'finalized'}),
 ]);
 if (receipt.status !== 'success' || tx.chainId !== contractChain.id || tx.to?.toLowerCase() !== ELYSIUM_USDC ||
     tx.from.toLowerCase() !== invoice.owner || tx.value !== 0n || tx.nonce !== Number(invoice.nonce) ||
     tx.input.toLowerCase() !== creditTransferData(invoice) || tx.blockHash !== receipt.blockHash)
  throw Error('This transaction does not match the Elysium USDC invoice');
 const transfers = parseEventLogs({abi: erc20Abi, eventName: 'Transfer',
  logs: receipt.logs.filter(log => log.address.toLowerCase() === ELYSIUM_USDC && !log.removed)});
 if (!transfers.some(({args}) => args.from.toLowerCase() === invoice.owner &&
     args.to.toLowerCase() === invoice.pay_to && args.value === parseUnits(invoice.amount, 6)))
  throw Error('The expected USDC transfer is missing');
 if (finalized.number < receipt.blockNumber || (await rpc.getBlock({blockNumber: receipt.blockNumber})).hash !== receipt.blockHash)
  throw Error('Waiting for Elysium finality. Check this transfer again.');
 return hash.toLowerCase();
}
