// Sample data for the public demo. Nothing here touches the network, a wallet or a key.
// Numbers follow the real sizing rule (risk 1/5 of the weekly limit, 3x target) so the
// demo teaches the product honestly. They are illustrative, not a forecast.

export type Panel='crew'|'chart'|'feed'|'record'|'controls';

export type Step={
 id:string;
 focus:Panel[];
 /** Which panel the step's text sits beside, and on which side. The text always lands on a dimmed area. */
 anchor?:Panel;
 side?:'left'|'right';
 title:string;
 body:string;
 /** Chart position (series index) this step animates to, and how long it takes. */
 head:number;
 dur:number;
};

export const WEEKLY_LIMIT=50;
export const START_BALANCE=1000;
export const TRADE_RISK=WEEKLY_LIMIT/5;

export const trade1={entry:100000,stop:98400,target:104800,size:0.00625};
export const trade2={entry:104600,stop:103800,target:107000,size:0.0125};

/** Series indices where something happens on the chart. */
export const MARK={entry1:100,breakEven:130,target1:150,entry2:160,stop2:178} as const;

export const steps:Step[]=[
 {id:'intro',focus:[],title:'See how a crew trades.',body:'',head:96,dur:0},
 {id:'crew',focus:['crew'],anchor:'crew',side:'right',title:'This is your crew',
  body:'It trades for you from its own account. You give it one rule: how much it may risk in a week. Here, that’s $50.',head:96,dur:0},
 {id:'watch',focus:['chart'],anchor:'chart',side:'right',title:'It watches the market',
  body:'Three AI scouts keep an eye on Bitcoin day and night, each looking for a different kind of opportunity.',head:100,dur:3200},
 {id:'idea',focus:['feed'],anchor:'feed',side:'left',title:'A scout spots a trade',
  body:'It writes down what to buy, why, and the price that would prove it wrong. “Long” just means it expects the price to rise.',head:100,dur:0},
 {id:'check',focus:['feed'],anchor:'feed',side:'left',title:'A second AI pushes back',
  body:'Every idea is checked by a different AI before anything happens. It turned down an Ethereum idea and let this one through.',head:100,dur:0},
 {id:'size',focus:['chart'],anchor:'chart',side:'right',title:'It works out how much to buy',
  body:'Plain math, no AI. This trade may lose at most $10, so the crew buys about $625 of Bitcoin.',head:100,dur:0},
 {id:'order',focus:['chart','feed'],anchor:'chart',side:'left',title:'It buys, with an exit plan',
  body:'Before the trade starts, the crew sets two automatic exits: sell at the target, or sell if the price drops too far.',head:100,dur:0},
 {id:'lock',focus:['chart','crew'],anchor:'chart',side:'right',title:'It locks in the gain',
  body:'Once the trade is up 3%, the crew moves its safety exit up to the price it paid. Now this trade can’t lose money.',head:MARK.breakEven,dur:3400},
 {id:'win',focus:['chart','crew'],anchor:'chart',side:'right',title:'It sells at the target',
  body:'Bitcoin reached the target and the crew sold: +$30, three times what it put at risk.',head:MARK.target1,dur:2600},
 {id:'loss',focus:['chart','crew'],anchor:'chart',side:'right',title:'Sometimes it loses',
  body:'The next trade went the other way. The safety exit sold and the crew lost $10, exactly what it planned to risk.',head:180,dur:5200},
 {id:'record',focus:['record'],anchor:'record',side:'right',title:'Every trade is on the record',
  body:'Each trade is matched to a signed record that anyone can check. If something happened that the crew didn’t do, you’d see it here.',head:180,dur:0},
 {id:'control',focus:['controls'],anchor:'controls',side:'right',title:'You’re always in charge',
  body:'Pause it whenever you like; open trades keep their exits. And only your own wallet can take money out.',head:180,dur:0},
 {id:'end',focus:[],title:'That’s HyperHive.',body:'',head:180,dur:0},
];

export const stepIndex=(id:string)=>steps.findIndex(s=>s.id===id);

// Price path: piecewise-linear keyframes with deterministic wobble that is zero at each
// keyframe, so the trade levels are hit exactly where the story needs them.
const keys:[number,number][]=[[0,96800],[20,97600],[38,97250],[60,98700],[75,99350],[88,100300],[96,99700],[100,100000],[112,101250],[122,100850],[130,103000],[140,103950],[150,104800],[155,104980],[160,104600],[168,104350],[173,104520],[178,103800],[180,103900]];
export const series:number[]=(()=>{
 const out:number[]=[];
 for(let k=0;k<keys.length-1;k++){
  const [i0,p0]=keys[k],[i1,p1]=keys[k+1];
  for(let i=i0;i<i1;i++){const t=(i-i0)/(i1-i0);const wobble=Math.sin(i*1.93)*85+Math.sin(i*.61+1.3)*60;out.push(p0+(p1-p0)*t+wobble*Math.sin(Math.PI*t));}
 }
 out.push(keys[keys.length-1][1]);
 return out;
})();
export const LAST=series.length-1;
export const PRICE_LO=96000,PRICE_HI=107600;

export const usd=(v:number,digits=2)=>v.toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:digits,maximumFractionDigits:digits});
