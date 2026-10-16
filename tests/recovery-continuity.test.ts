import {it, expect} from 'vitest';
import {uninterruptedEntry} from '../packages/core/position-recovery.js';
it('proves partial fills from flat and rejects later independent positions of identical size',()=>{
 const first={coin:'BTC',oid:10,tid:1,side:'B',sz:'0.3',startPosition:'0',time:1234};
 const second={...first,tid:2,sz:'0.2',startPosition:'0.3'};
 expect(uninterruptedEntry([second,first],'BTC',10,true,0.5,0.5)).toBe(true);
 expect(uninterruptedEntry([first,second,{...first,tid:3,oid:11,side:'A',sz:'0.5',startPosition:'0.5'},{...first,tid:4,oid:12,sz:'0.5'}],'BTC',10,true,0.5,0.5)).toBe(false);
 expect(uninterruptedEntry([second],'BTC',10,true,0.2,0.5)).toBe(false);
 expect(uninterruptedEntry([],'BTC',10,true,0.5,0.5)).toBe(false);
});
it('recovers shorts and rejects missing, malformed, oversize and foreign fills',()=>{
 const f={coin:'ETH',oid:5,side:'A',sz:'1',startPosition:'0',time:1,tid:1};
 const recover=(changes:Partial<typeof f>)=>uninterruptedEntry([{...f,...changes}],'ETH',5,false,-1,1);
 expect(recover({})).toBe(true);
 for(const changes of [{side:'B'},{oid:9},{sz:'-1'},{sz:'0'},{startPosition:'NaN'},{sz:'NaN'},{coin:'BTC'},{startPosition:'0.5'}])expect(recover(changes)).toBe(false);
 expect(uninterruptedEntry([{...f,coin:'BTC'},f],'ETH',5,false,-1,1)).toBe(true);
 expect(uninterruptedEntry([f],'ETH',5,false,-2,2)).toBe(false);
 expect(uninterruptedEntry([f],'ETH',5,false,-1,.9)).toBe(false);
 expect(uninterruptedEntry([],'ETH',5,false,0,1)).toBe(false);
});
it('recognizes a reduced original position and refuses a reopen or increase',()=>{
 const first={coin:'BTC',oid:11,side:'B',sz:'2',startPosition:'0',time:10,tid:1};
 const cut={...first,oid:12,side:'A',sz:'0.5',startPosition:'2',time:11,tid:2};
 const prove=(fills:typeof first[],current:number,max=2)=>uninterruptedEntry(fills,'BTC',11,true,current,max,true);
 expect(prove([first,cut],1.5)).toBe(true);
 expect(prove([first,cut],1.5,1.5)).toBe(false);
 expect(prove([first,{...cut,sz:'2'},{...first,oid:13,time:12}],2)).toBe(false);
 expect(prove([first,{...cut,side:'B'}],2.5)).toBe(false);
 expect(prove([first,cut,{...first,sz:'0.5',startPosition:'1.5',time:12}],2)).toBe(false);
});
it('rejects unbounded quantities and distinguishes a surviving short from an unrelated rebuy',()=>{
 const short={coin:'ETH',oid:2,side:'A',sz:'3',startPosition:'0',time:1,tid:1};
 const reduction={...short,oid:3,side:'B',sz:'1',startPosition:'-3',time:2,tid:2};
 const f=[short,reduction];
 expect(uninterruptedEntry(f,'ETH',2,false,-2,3,true)).toBe(true);
 expect(uninterruptedEntry(f,'ETH',2,false,-2,3)).toBe(false);
 for(const maximum of [NaN,Infinity,-Infinity,-1,0])expect(uninterruptedEntry([short],'ETH',2,false,-3,maximum)).toBe(false);
 for(const current of [NaN,Infinity,-Infinity,0])expect(uninterruptedEntry([short],'ETH',2,false,current,3)).toBe(false);
 expect(uninterruptedEntry([short,{...reduction,sz:'3'}],'ETH',2,false,0,3,true)).toBe(false);
 expect(uninterruptedEntry([short,{...reduction,sz:'4'}],'ETH',2,false,1,3,true)).toBe(false);
});
