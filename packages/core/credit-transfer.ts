import {concatHex, encodeFunctionData, erc20Abi, parseUnits, type Hex} from 'viem';

/** The UUID suffix binds a standard ERC-20 transfer to a single checkout invoice. */
export function creditTransferData(invoice: {id: string; pay_to: string; amount: string}) {
 if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(invoice.id)) throw Error('Invalid purchase ID');
 const transfer = encodeFunctionData({abi: erc20Abi, functionName: 'transfer',
  args: [invoice.pay_to as Hex, parseUnits(invoice.amount, 6)]});
 return concatHex([transfer, ('0x' + invoice.id.replaceAll('-', '')) as Hex]);
}
