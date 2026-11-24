import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {policyMessage,type Policy,type Crew,type Snapshot} from '../packages/core/domain.js';
export const wallet=privateKeyToAccount(generatePrivateKey());
export const policy:Policy={v:1,network:'mainnet',crewId:'11111111-1111-4111-8111-111111111111',owner:wallet.address.toLowerCase() as `0x${string}`,account:wallet.address.toLowerCase() as `0x${string}`,name:'Test crew',markets:['BTC','ETH'],weeklyBudget:100,maxAccountValue:1000,plan:'crew',generation:0,issuedAt:Date.now()-1000,expiresAt:Date.now()+86400000,origin:'http://localhost:5188'};
export async function crew():Promise<Crew>{return {id:policy.crewId,owner:policy.owner,account:policy.account,policy,signature:await wallet.signMessage({message:policyMessage(policy)}),paused:true,created_at:Date.now(),paid_until:0,broken_since:null};}
export const market:Snapshot={market:'BTC',asset:0,mark:60000,atr:300,rv:.2,oiUsd:100000000,szDecimals:5,maxLeverage:40,funding:.00001,timestamp:Date.now(),closes:[60000,60100]};
