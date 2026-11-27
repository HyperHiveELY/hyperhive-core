import {createPublicClient, decodeFunctionData, formatEther, http, isAddress, keccak256, parseAbi, parseEther, zeroAddress, type Address, type Hex} from 'viem';
import {CONTRACT_CHAIN_ID, contractChain, ELYSIUM_USDC} from '../../../packages/core/chain.js';
import {activeWalletMode, connect} from './wallet.js';

const sourceId = 4663;
const relay = 'https://api.relay.link';
const source = createPublicClient({transport:http('https://rpc.mainnet.chain.robinhood.com')});
const destination = createPublicClient({chain:contractChain,transport:http()});
const abi = parseAbi(['function depositNative(address depositor, bytes32 id) payable']);
const balanceAbi = parseAbi(['function balanceOf(address) view returns (uint256)']);
// Relay's protocol.v2.depository on Robinhood Chain. Only its native deposit entry point is accepted.
const depository = '0x4cd00e387622c35bddb9b4c962c136462338bc31';
export type BridgeAsset = 'USDC'|'HYPE';
const tokens = {USDC:ELYSIUM_USDC,HYPE:zeroAddress};
const equal = (a:unknown,b:string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

export function validateDeposit(body:any, owner:Address, asset:BridgeAsset, amount:bigint) {
  const {details,steps} = body;
  const input = details?.currencyIn, output = details?.currencyOut;
  if (!equal(details?.sender,owner) || !equal(details?.recipient,owner) ||
      input?.currency?.chainId !== sourceId || !equal(input.currency.address,zeroAddress) ||
      output?.currency?.chainId !== CONTRACT_CHAIN_ID || !equal(output.currency.address,tokens[asset]) ||
      output.amount !== String(amount) || output.minimumAmount !== String(amount) || amount <= 0n) {
    throw Error('Relay returned a different route, amount or wallet. Refresh the quote.');
  }
  const step = steps?.[0], tx = step?.items?.[0]?.data;
  if (steps?.length !== 1 || step.id !== 'deposit' || step.kind !== 'transaction' || step.items.length !== 1 ||
      !/^0x[0-9a-f]{64}$/i.test(step.requestId) || tx?.chainId !== sourceId ||
      !equal(tx.from,owner) || !equal(tx.to,depository) || tx.value !== input.amount ||
      !/^[1-9]\d{0,75}$/.test(tx.value) || !/^0x49290c1c[0-9a-f]{128}$/i.test(tx.data)) {
    throw Error('Unexpected bridge transaction. Refresh the quote.');
  }
  const {args:[depositor]} = decodeFunctionData({abi,data:tx.data});
  if (!equal(depositor,owner)) throw Error('Deposit refund wallet mismatch.');
  return {to:depository as Address, data:tx.data as Hex, value:BigInt(tx.value), request:step.requestId as Hex};
}

async function needed(owner:Address, asset:BridgeAsset, target:bigint) {
  const balance = asset === 'HYPE' ? await destination.getBalance({address:owner})
    : await destination.readContract({address:ELYSIUM_USDC,abi:balanceAbi,functionName:'balanceOf',args:[owner]});
  return balance < target ? target-balance : 0n;
}
export async function reviewBridge(owner:Address,asset:BridgeAsset,usdc:number) {
  if (!isAddress(owner) || !Number.isInteger(usdc) || usdc<5 || usdc>500) throw Error('Invalid checkout amount or wallet.');
  const target = asset === 'USDC' ? BigInt(usdc)*1_000_000n : parseEther('0.0005');
  const amount = await needed(owner,asset,target);
  if (!amount) throw Error('Your wallet already has enough '+asset+' on Elysium.');
  const expires = Date.now()+60000;
  const res = await fetch(relay+'/quote/v2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    user:owner,recipient:owner,refundTo:owner,originChainId:sourceId,destinationChainId:CONTRACT_CHAIN_ID,
    originCurrency:zeroAddress,destinationCurrency:tokens[asset],amount:String(amount),tradeType:'EXACT_OUTPUT',
  })});
  if (!res.ok) throw Error('Relay could not quote this amount. Try again.');
  const tx = validateDeposit(await res.json(),owner,asset,amount);
  const [id,estimate,price,nonce,balance] = await Promise.all([source.getChainId(),source.estimateGas({account:owner,to:tx.to,data:tx.data,value:tx.value}),
    source.getGasPrice(),source.getTransactionCount({address:owner,blockTag:'pending'}),source.getBalance({address:owner})]);
  const gas=estimate*13n/10n, gasPrice=price*2n, maxFee=gas*gasPrice;
  if (id!==sourceId || maxFee>parseEther('0.00001')) throw Error('Unexpected Robinhood network or fee. Refresh the quote.');
  if (balance<tx.value+maxFee) throw Error('Insufficient Robinhood Chain ETH. Maximum debit is '+formatEther(tx.value+maxFee)+' ETH.');
  return {...tx,owner,asset,target,amount,expires,gas,gasPrice,maxFee,nonce};
}
export type BridgeQuote = Awaited<ReturnType<typeof reviewBridge>>;
export const bridgeKey=(owner:Address,asset:BridgeAsset)=>'hyperhive.checkout-bridge.v1.'+owner.toLowerCase()+'.'+asset;
export type BridgeRecord={hash:Hex;request:Hex;signed?:Hex;expires?:number};
export function savedBridge(owner:Address,asset:BridgeAsset):BridgeRecord|null {
  return JSON.parse(localStorage.getItem(bridgeKey(owner,asset)) || 'null');
}
export async function signBridge(q:BridgeQuote) {
  const key=bridgeKey(q.owner,q.asset);
  return navigator.locks.request(key,async()=>{
    if(savedBridge(q.owner,q.asset)) throw Error('Check your earlier bridge before sending again.');
    const {client}=await connect(), account=client.account;
    if(activeWalletMode()!=='local'||account?.type!=='local'||!equal(account.address,q.owner)) throw Error('Unlock the built-in wallet that requested this quote.');
    const [id,nonce,remaining,balance]=await Promise.all([source.getChainId(),source.getTransactionCount({address:q.owner,blockTag:'pending'}),needed(q.owner,q.asset,q.target),source.getBalance({address:q.owner,blockTag:'pending'})]);
    if(balance<q.value+q.maxFee) throw Error('Your ETH balance changed. Review a fresh quote.');
    if(id!==sourceId || nonce!==q.nonce || remaining!==q.amount || Date.now()>=q.expires) throw Error('The quote, nonce or balance changed. Review a fresh quote.');
    const signed=await account.signTransaction({chainId:sourceId,type:'legacy',nonce,to:q.to,data:q.data,value:q.value,gas:q.gas,gasPrice:q.gasPrice});
    const record={hash:keccak256(signed),request:q.request};
    // Save before broadcast. An ambiguous RPC response can only retry the identical signed bytes.
    localStorage.setItem(key,JSON.stringify({...record,signed,expires:q.expires}));
    await source.sendRawTransaction({serializedTransaction:signed});
    localStorage.setItem(key,JSON.stringify(record));
    return record;
  });
}
export async function bridgeStatus(record:BridgeRecord) {
  const receipt=await source.getTransactionReceipt({hash:record.hash}).catch(()=>null);
  if(receipt?.status==='reverted') return 'failed';
  const res=await fetch(relay+'/intents/status/v3?requestId='+encodeURIComponent(record.request));
  if(!res.ok) throw Error('Bridge status is unavailable. Keep the source transaction hash.');
  const {status}=await res.json();
  return String(status);
}

export async function retrySignedBridge(record:BridgeRecord) {
  if(!record.signed || !record.expires || Date.now()>=record.expires || keccak256(record.signed)!==record.hash)
    throw Error('The original quote has expired. Check the source receipt before taking another action.');
  await source.sendRawTransaction({serializedTransaction:record.signed});
}
