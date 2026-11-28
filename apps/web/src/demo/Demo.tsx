import {uiText} from "../i18n/language.js";
import {LanguagePicker} from '../i18n/LanguagePicker.js';
import React,{useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import '@fontsource-variable/geist';
import '../dashboard/brand-fonts.css';
import './demo.css';
import '../dashboard/workspace-light.css';
import {BrandMark,ArrowRight,ArrowLeft,Check,Pause,Play,Wallet,X,LockKeyhole,RefreshCw,ShieldCheck} from '../ui/ProductIcons.js';
import {DemoChart,type ChartLine,type ChartPin} from './DemoChart.js';
import {markWalkthroughSeen} from '../flags.js';
import {steps,stepIndex,MARK,START_BALANCE,WEEKLY_LIMIT,TRADE_RISK,trade1,trade2,usd,type Panel} from './story.js';

const marks=[MARK.entry1,MARK.breakEven,MARK.target1,MARK.entry2,MARK.stop2] as const;
const at=(id:string)=>stepIndex(id);
const CALLOUT_WIDTH=320,GAP=16,WIDE=1100;

/** Count smoothly between values with requestAnimationFrame. */
function useCountUp(target:number,reduced:boolean,ms=900){
 const ref=useRef<HTMLSpanElement>(null),value=useRef(target);
 useEffect(()=>{
  const el=ref.current,from=value.current;if(!el)return;
  if(reduced||from===target){value.current=target;el.textContent=usd(target);return;}
  let raf=0;const start=performance.now();
  const frame=(now:number)=>{const t=Math.min(1,(now-start)/ms),e=1-Math.pow(1-t,4);value.current=from+(target-from)*e;el.textContent=usd(value.current);if(t<1)raf=requestAnimationFrame(frame);};
  raf=requestAnimationFrame(frame);return()=>cancelAnimationFrame(raf);
 },[target,reduced,ms]);
 return ref;
}

function useMedia(query:string){
 const [match,setMatch]=useState(()=>typeof matchMedia!=='undefined'&&matchMedia(query).matches);
 useEffect(()=>{const m=matchMedia(query);const on=()=>setMatch(m.matches);on();m.addEventListener('change',on);return()=>m.removeEventListener('change',on);},[query]);
 return match;
}

type Mode='tour'|'explore';

export default function Demo(){
 const reduced=useMedia('(prefers-reduced-motion: reduce)'),wide=useMedia(`(min-width: ${WIDE}px)`);
 const [step,setStep]=useState(0),[mode,setMode]=useState<Mode>('tour'),[passed,setPassed]=useState(-1),[paused,setPaused]=useState(false),[toast,setToast]=useState(''),[instant,setInstant]=useState(false);
 const [spot,setSpot]=useState<{x:number;y:number}|null>(null);
 const current=steps[step],last=steps.length-1,touring=mode==='tour'&&step>0&&step<last;
 const board=useRef<HTMLElement>(null),callout=useRef<HTMLDivElement>(null),nextButton=useRef<HTMLButtonElement>(null);
 const panels=useRef<Partial<Record<Panel,HTMLElement|null>>>({});

 useEffect(()=>{document.title='HyperHive — '+uiText('See a crew trade');});
 useEffect(()=>{markWalkthroughSeen();},[]);

 const go=useCallback((to:number)=>{const target=Math.max(0,Math.min(last,to));setInstant(target<step);setStep(target);},[last,step]);
 const next=useCallback(()=>go(step+1),[go,step]);
 const back=useCallback(()=>go(step-1),[go,step]);
 const explore=useCallback(()=>{setInstant(true);setMode('explore');setStep(last);},[last]);
 const replay=useCallback(()=>{setInstant(true);setMode('tour');setPaused(false);setPassed(-1);setStep(0);},[]);

 useEffect(()=>{
  if(mode!=='tour')return;
  const key=(e:KeyboardEvent)=>{
   if(e.key==='ArrowRight'){e.preventDefault();if(step<last)next();}
   if(e.key==='ArrowLeft'){e.preventDefault();back();}
   if(e.key==='Escape'){e.preventDefault();explore();}
  };
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[mode,step,last,next,back,explore]);

 // Put the step's text beside its panel, on the side that is dimmed. Narrow screens use a bottom sheet.
 useLayoutEffect(()=>{
  if(!touring)return;
  const place=()=>{
   const anchor=current.anchor&&panels.current[current.anchor],host=board.current;
   if(!wide||!anchor||!host){setSpot(null);return;}
   const b=host.getBoundingClientRect(),a=anchor.getBoundingClientRect(),h=callout.current?.offsetHeight??220;
   let x=current.side==='left'?a.left-b.left-GAP-CALLOUT_WIDTH:a.right-b.left+GAP;
   x=Math.max(0,Math.min(x,b.width-CALLOUT_WIDTH));
   const y=Math.max(0,Math.min(a.top-b.top,b.height-h));
   setSpot({x,y});
  };
  place();window.addEventListener('resize',place);return()=>window.removeEventListener('resize',place);
 },[step,touring,wide]);
 useEffect(()=>{
  if(!touring||!current.focus.length)return;
  panels.current[current.focus[0]]?.scrollIntoView({behavior:reduced?'auto':'smooth',block:wide?'nearest':'start'});
 },[step,touring]);
 useEffect(()=>{if(touring)nextButton.current?.focus({preventScroll:true});},[step,touring]);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),4000);return()=>clearTimeout(t);},[toast]);

 const past=(id:string)=>step>=at(id);
 const reached=(m:number)=>passed>=m;
 const head=mode==='explore'?180:current.head,dur=mode==='explore'||instant?0:current.dur;

 // Story state, derived from the step and how far the price has played.
 const open1=past('order')&&!reached(MARK.target1),locked=reached(MARK.breakEven);
 const open2=reached(MARK.entry2)&&!reached(MARK.stop2);
 const balance=START_BALANCE+(reached(MARK.target1)?30:0)-(reached(MARK.stop2)?10:0);
 const atRisk=open1?(locked?0:TRADE_RISK):open2?TRADE_RISK:0,lost=reached(MARK.stop2)?TRADE_RISK:0;
 const status=paused?'Paused':open1||open2?'In a trade':'Watching';
 const balanceRef=useCountUp(balance,reduced);

 const lines:ChartLine[]=[
  {id:'t1-target',kind:'target',price:trade1.target,label:'Target',visible:open1},
  {id:'t1-entry',kind:'entry',price:trade1.entry,label:'Bought',visible:open1&&!locked},
  {id:'t1-stop',kind:'stop',price:locked?trade1.entry:trade1.stop,label:locked?'Safety exit (moved)':'Safety exit',visible:open1},
  {id:'t2-target',kind:'target',price:trade2.target,label:'Target',visible:open2},
  {id:'t2-entry',kind:'entry',price:trade2.entry,label:'Bought',visible:open2},
  {id:'t2-stop',kind:'stop',price:trade2.stop,label:'Safety exit',visible:open2},
 ];
 const pins:ChartPin[]=[
  {id:'buy1',index:MARK.entry1,price:trade1.entry,label:'Buy',tone:'buy',visible:past('order'),minor:reached(MARK.target1)},
  {id:'win1',index:MARK.target1,price:trade1.target,label:'+$30',tone:'win',visible:reached(MARK.target1),minor:reached(MARK.entry2)},
  {id:'buy2',index:MARK.entry2,price:trade2.entry,label:'Buy',tone:'buy',visible:reached(MARK.entry2),minor:reached(MARK.stop2)},
  {id:'loss2',index:MARK.stop2,price:trade2.stop,label:'−$10',tone:'loss',visible:reached(MARK.stop2)},
 ];

 const focused=(p:Panel)=>touring&&current.focus.includes(p);
 const dimmed=(p:Panel)=>mode==='tour'&&(step===0||step===last||!current.focus.includes(p));
 const panelProps=(p:Panel,label:string)=>({ref:(el:HTMLElement|null)=>{panels.current[p]=el;},className:'dm-panel dm-panel-'+p+(focused(p)?' is-focus':'')+(dimmed(p)?' is-dim':''),'aria-label':label});

 const feed:{id:string;node:React.ReactNode}[]=[];
 if(past('idea'))feed.push({id:'idea1',node:<IdeaCard approved={past('check')}/>});
 if(past('check'))feed.push({id:'eth',node:<Event tone="no" title={uiText("ETH idea turned down")} detail="The second AI said it was too risky right now."/>});
 if(past('order'))feed.push({id:'order1',node:<Event tone="buy" title={uiText("Bought $625 of BTC at $100,000")} detail="Target $104,800 · Safety exit $98,400"/>});
 if(locked)feed.push({id:'lock1',node:<Event tone="lock" title={uiText("Safety exit moved to $100,000")} detail="A turn back down now costs little or nothing."/>});
 if(reached(MARK.target1))feed.push({id:'win1',node:<Event tone="win" title={uiText("Sold at the target")} amount="+$30.00"/>});
 if(reached(MARK.target1)&&past('loss'))feed.push({id:'idea2',node:<Event tone="idea" title={uiText("New BTC idea approved")} detail="Wrong if it falls below $103,800."/>});
 if(reached(MARK.entry2))feed.push({id:'order2',node:<Event tone="buy" title={uiText("Bought $1,308 of BTC at $104,600")} detail="Target $107,000 · Safety exit $103,800"/>});
 if(reached(MARK.stop2))feed.push({id:'loss2',node:<Event tone="loss" title={uiText("Safety exit sold")} detail="About what it planned to risk." amount="−$10.00"/>});
 feed.reverse();

 const trades=[
  reached(MARK.target1)&&{id:'1',label:'BTC · long',result:'+$30.00',tone:'win'},
  reached(MARK.stop2)&&{id:'2',label:'BTC · long',result:'−$10.00',tone:'loss'},
 ].filter(Boolean) as {id:string;label:string;result:string;tone:string}[];
 const verified=past('record');

 return <div className={'dm-root'+(touring?' is-touring':'')+(mode==='explore'?' is-exploring':'')+(reduced?' is-reduced':'')} data-step={current.id}>
  <header className="dm-header">
   <a className="dm-brand" href="/" aria-label={uiText("HyperHive home")}><BrandMark/><span>HyperHive</span></a>
   <span className="dm-tag"><i/>{uiText("Demo · sample data")}</span>
   <div className="dm-header-actions"><LanguagePicker/>
    {touring&&<button className="dm-button dm-quiet" onClick={explore}>{uiText("Skip tour")}</button>}
    {mode==='explore'&&<button className="dm-button dm-quiet" onClick={replay}><RefreshCw size={15}/>{uiText("Watch again")}</button>}
    <a className="dm-button dm-primary" href="/dashboard">{uiText("Set up my crew")}<ArrowRight size={15}/></a>
   </div>
  </header>

  <div className="dm-page">
   <div className="dm-heading"><h1>{uiText("Your workspace")}</h1><span>{uiText("Sample crew · not real money")}</span></div>
   <main className="dm-board" ref={board} aria-hidden={mode==='tour'&&(step===0||step===last)?true:undefined}>
    <section {...panelProps('crew','Your crew')}>
     <div className="dm-crew-id"><span className="dm-glyph" aria-hidden="true"><BrandMark/></span><div><h2>{uiText("Steady BTC")}</h2><small>{uiText("Trades Bitcoin")}</small></div></div>
     <span className={'dm-status is-'+status.replace(/\s/g,'-').toLowerCase()}><i/>{uiText(status)}</span>
     <div className="dm-balance"><span>{uiText("Balance")}</span><strong ref={balanceRef}>{usd(START_BALANCE)}</strong><small className={balance>START_BALANCE?'is-up':''}>{balance===START_BALANCE?uiText("Started with $1,000.00"):(balance>START_BALANCE?'+':'')+usd(balance-START_BALANCE)+uiText(" so far")}</small></div>
     <div className="dm-limit">
      <div className="dm-row"><span>{uiText("Weekly limit")}</span><b>{usd(WEEKLY_LIMIT,0)}</b></div>
      <div className="dm-meter" role="img" aria-label={("" + String(usd(lost+atRisk,0)) + uiText(" of ") + String(usd(WEEKLY_LIMIT,0)) + uiText(" used"))}><i className="dm-meter-lost" style={{transform:`scaleX(${lost/WEEKLY_LIMIT})`}}/><i className="dm-meter-risk" style={{transform:`translateX(${lost/WEEKLY_LIMIT*100}%) scaleX(${atRisk/WEEKLY_LIMIT})`}}/></div>
      <div className="dm-row dm-row-small"><span><i className="dm-key dm-key-risk"/>{uiText("At risk ")}{usd(atRisk,0)}</span><span><i className="dm-key dm-key-lost"/>{uiText("Lost ")}{usd(lost,0)}</span></div>
     </div>
    </section>

    <section {...panelProps('chart','Bitcoin price chart')}>
     <div className="dm-panel-head"><div><h2>{uiText("Bitcoin")}</h2><small>{uiText("Price, last few days")}</small></div><span className="dm-scouts" aria-label={uiText("Three scouts watching")}>{['Trend','Crowd','Levels'].map((n,i)=><span key={n} className={touring&&current.id==='watch'?'is-live':''} style={{'--i':i} as React.CSSProperties}>{uiText(n)}</span>)}</span></div>
     <DemoChart head={head} dur={dur} reduced={reduced} lines={lines} pins={pins} scanning={false} marks={marks} onPassed={setPassed}>
      <Sizer visible={touring&&current.id==='size'}/>
     </DemoChart>
    </section>

    <section {...panelProps('feed','Crew activity')}>
     <div className="dm-panel-head"><div><h2>{uiText("Activity")}</h2><small>{uiText("Newest first")}</small></div></div>
     <div className="dm-feed">{feed.length?feed.map(f=><div key={f.id} className="dm-feed-item">{uiText(f.node)}</div>):<p className="dm-empty">{uiText("Nothing yet. The scouts are watching.")}</p>}</div>
    </section>

    <section {...panelProps('record','Trade record')}>
     <div className="dm-panel-head"><div><h2>{uiText("Trade record")}</h2><small>{uiText("Public, anyone can check it")}</small></div>{trades.length>0&&<span className={'dm-proof'+(verified?' is-on':'')}><ShieldCheck size={14}/>{verified?("" + String(trades.length) + uiText(" of ") + String(trades.length) + uiText(" verified")):uiText("Checking")}</span>}</div>
     {trades.length?<ol className="dm-record">{trades.map((t,i)=><li key={t.id} style={{'--i':i} as React.CSSProperties}><span>{uiText(t.label)}</span><b className={'is-'+t.tone}>{uiText(t.result)}</b><span className={'dm-verify'+(verified?' is-on':'')}>{verified?<><Check size={13}/>{uiText("Matches signed record")}</>:uiText('Checking')}</span></li>)}</ol>:<p className="dm-empty">{uiText("Finished trades show up here.")}</p>}
    </section>

    <section {...panelProps('controls','Your controls')}>
     <div className="dm-panel-head"><div><h2>{uiText("Controls")}</h2>{mode==='explore'&&<small>{uiText("Try them. Nothing real happens.")}</small>}</div></div>
     <div className="dm-controls">
      <button className="dm-control" disabled={mode==='tour'} aria-pressed={paused} onClick={()=>{setPaused(p=>!p);setToast(paused?'Crew resumed.':'Crew paused. Open trades keep their exits.');}}>{paused?<Play size={16}/>:<Pause size={16}/>}<span><b>{paused?uiText("Resume"):uiText("Pause")}</b><small>{paused?uiText("Start looking for trades again"):uiText("Stop new trades")}</small></span></button>
      <button className="dm-control" disabled={mode==='tour'} onClick={()=>setToast('Lowering the limit applies right away. Raising it waits until next week.')}><LockKeyhole size={16}/><span><b>{uiText("Weekly limit")}</b><small>{uiText("Lower it any time")}</small></span></button>
      <button className="dm-control" disabled={mode==='tour'} onClick={()=>setToast('Only your wallet can withdraw. The crew can trade, but never move money out.')}><Wallet size={16}/><span><b>{uiText("Withdraw")}</b><small>{uiText("Only your wallet can")}</small></span></button>
     </div>
    </section>

    {touring&&<div className={'dm-callout'+(spot?' is-anchored':' is-sheet')} ref={callout} style={spot?{transform:`translate3d(${spot.x}px,${spot.y}px,0)`}:undefined} role="dialog" aria-label={uiText("Tour")}>
     <div className="dm-callout-body" key={current.id} aria-live="polite">
      <span className="dm-callout-step">{uiText("Step ")}{uiText(step)}{uiText(" of ")}{last-1}</span>
      <h2>{uiText(current.title)}</h2>
      <p>{uiText(current.body)}</p>
     </div>
     <div className="dm-callout-nav">
      <span className="dm-progress" aria-hidden="true"><i style={{transform:`scaleX(${step/(last-1)})`}}/></span>
      <button className="dm-button dm-icon" onClick={back} aria-label={uiText("Back")}><ArrowLeft size={16}/></button>
      <button className="dm-button dm-primary" ref={nextButton} onClick={next}>{step===last-1?uiText("Finish"):uiText("Next")}<ArrowRight size={15}/></button>
     </div>
    </div>}
   </main>
  </div>

  {mode==='tour'&&step===0&&<Modal labelledBy="dm-intro-title">
   <h1 id="dm-intro-title">{uiText("See how a crew trades.")}</h1>
   <p>{uiText("We’ll follow a sample crew through two trades: one that wins, one that doesn’t. It takes about a minute, and none of it is real money.")}</p>
   <div className="dm-modal-actions"><button className="dm-button dm-primary dm-large" onClick={next} autoFocus>{uiText("Start")}<ArrowRight size={16}/></button><button className="dm-button dm-quiet" onClick={explore}>{uiText("Skip to the dashboard")}</button></div>
  </Modal>}

  {mode==='tour'&&step===last&&<Modal labelledBy="dm-end-title">
   <h1 id="dm-end-title">{uiText("That’s HyperHive.")}</h1>
   <ul className="dm-recap">
    <li>{uiText("AI suggests trades. A second AI checks them.")}</li>
    <li>{uiText("Simple math sets the size, with exits set up front.")}</li>
    <li>{uiText("Every trade is on the record, and only you can withdraw.")}</li>
   </ul>
   <p className="dm-note">{uiText("Trading can lose money. These numbers are just an example.")}</p>
   <div className="dm-modal-actions"><a className="dm-button dm-primary dm-large" href="/dashboard">{uiText("Set up my crew")}<ArrowRight size={16}/></a><button className="dm-button dm-quiet" onClick={explore}>{uiText("Explore the dashboard")}</button><button className="dm-button dm-quiet" onClick={replay}><RefreshCw size={14}/>{uiText("Watch again")}</button></div>
  </Modal>}

  {mode==='explore'&&<div className="dm-explore-bar"><span>{uiText("This is a sample crew. Try the controls.")}</span><button className="dm-button dm-quiet" onClick={replay}><RefreshCw size={14}/>{uiText("Watch again")}</button></div>}
  <div className="dm-toast" role="status" aria-live="polite">{toast&&<span key={toast}>{uiText(toast)}<button onClick={()=>setToast('')} aria-label={uiText("Dismiss")}><X size={14}/></button></span>}</div>
 </div>;
}

function Modal({labelledBy,children}:{labelledBy:string;children:React.ReactNode}){
 return <div className="dm-modal-layer"><div className="dm-modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>{uiText(children)}</div></div>;
}

function IdeaCard({approved}:{approved:boolean}){
 return <article className={'dm-idea'+(approved?' is-approved':'')}>
  <div className="dm-idea-top"><span>{uiText("Trend scout")}</span>{approved&&<span className="dm-badge is-yes"><Check size={12}/>{uiText("Approved")}</span>}</div>
  <div className="dm-idea-title"><b>BTC</b><span>{uiText("Long")}</span></div>
  <dl>
   <div><dt>{uiText("Why")}</dt><dd>{uiText("Steady climb, just bounced")}</dd></div>
   <div><dt>{uiText("Wrong if")}</dt><dd>{uiText("Below $98,400")}</dd></div>
   <div><dt>{uiText("Time limit")}</dt><dd>{uiText("2 days")}</dd></div>
  </dl>
 </article>;
}

function Event({tone,title,detail,amount}:{tone:'buy'|'lock'|'win'|'loss'|'idea'|'no';title:string;detail?:string;amount?:string}){
 return <div className={'dm-event is-'+tone}><span className="dm-event-dot" aria-hidden="true"/><div><b>{uiText(title)}</b>{detail&&<small>{uiText(detail)}</small>}</div>{amount&&<strong>{uiText(amount)}</strong>}</div>;
}

function Sizer({visible}:{visible:boolean}){
 const rows:[string,string][]=[['Weekly limit','$50'],['Planned risk on this trade','≈ $10'],['So it buys','≈ $625 of BTC']];
 return <div className={'dm-sizer'+(visible?' is-on':'')} aria-hidden={!visible}>
  <ol>{rows.map(([k,v],i)=><li key={k} style={{'--i':i} as React.CSSProperties} className={i===rows.length-1?'is-result':''}><span>{uiText(k)}</span><b>{uiText(v)}</b></li>)}</ol>
 </div>;
}
