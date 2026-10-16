/** Verify the venue fill sequence from flat to the observed signed quantity.
 * An already managed position may shrink without crossing or touching zero.
 * A reopened position or independent increase requires owner review. */
export function uninterruptedEntry(fills:readonly {coin:string;oid:number;side:string;sz:string;startPosition:string;time:number;tid:number}[],
  market:string, oid:number, buy:boolean, current:number, maximum:number, allowReductions=false) {
  const history=fills.filter(f=>f.coin===market).sort((a,b)=>a.time-b.time||a.tid-b.tid);
  let position=0;
  const tolerance=Math.max(1e-12,Math.abs(current)*1e-10);
  if(!Number.isFinite(current)||!Number.isFinite(maximum)||maximum<=0||current===0)return false;
  let reducing=false;
  for(const fill of history){
    const size=Number(fill.sz),start=Number(fill.startPosition);
    if(!Number.isFinite(size)||size<=0||!Number.isFinite(start)||Math.abs(start-position)>tolerance)return false;
    if(fill.oid===oid){
      if(reducing||fill.side!==(buy?'B':'A'))return false;
      position+=buy?size:-size;
      if(Math.abs(position)>maximum+tolerance)return false;
    }else{
      if(!allowReductions||fill.side!==(buy?'A':'B')||size>=Math.abs(position)-tolerance)return false;
      position+=buy?-size:size;
      reducing=true;
    }
  }
  return history.length>0&&Math.abs(position-current)<=tolerance;
}
