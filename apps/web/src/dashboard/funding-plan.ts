export type FundingSnapshot={owner:string;account:string;available:number;equity:number;ownerActivation:boolean;crewActivation:boolean;checkedAt:number};
// Read-only estimate. The venue and the existing signed-transfer handler remain authoritative.
export function fundingPlan(snapshot:FundingSnapshot,target:number,cap:number,needsTokens:boolean){
 if(![snapshot.available,snapshot.equity,target,cap].every(Number.isFinite)||snapshot.available<0||target<10||target>cap)throw Error('Choose a trading balance from 10 USDC up to your signed account limit.');
 const units=(n:number)=>Math.ceil(n*1e6-1e-8);
 const topUp=Math.max(0,units(target)-Math.floor(snapshot.equity*1e6));
 const crewActivation=topUp>0&&snapshot.crewActivation?1_000_000:0;
 const transfer=topUp+crewActivation, tokens=needsTokens?5_000_000:0;
 const shortfall=Math.max(0,transfer-Math.floor(snapshot.available*1e6));
 const ownerActivation=shortfall>0&&snapshot.ownerActivation?1_000_000:0;
 return {topUp:topUp/1e6,transfer:transfer/1e6,tokens:tokens/1e6,crewActivation:crewActivation/1e6,ownerActivation:ownerActivation/1e6,required:transfer/1e6,shortfall:shortfall/1e6,incoming:(shortfall+ownerActivation)/1e6};
}
