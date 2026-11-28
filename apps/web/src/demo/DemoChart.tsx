import {uiText} from "../i18n/language.js";
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {series,LAST,PRICE_LO,PRICE_HI,usd} from './story.js';
import {onThemeChange} from '../theme.js';

export type ChartLine={id:string;price:number;kind:'entry'|'stop'|'target';label:string;visible:boolean};
export type ChartPin={id:string;index:number;price:number;label:string;tone:'buy'|'win'|'loss';visible:boolean;minor?:boolean};

type Props={head:number;dur:number;reduced:boolean;lines:ChartLine[];pins:ChartPin[];scanning:boolean;marks:readonly number[];onPassed:(mark:number)=>void;children?:React.ReactNode};

const PAD_T=26,PAD_B=30,PLOT=0.8,LEFT=14;
const ease=(t:number)=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;

/**
 * Price chart for the demo. The line, area, dot and price readout are drawn with direct DOM
 * writes inside requestAnimationFrame, so playback never waits on React and stays at the
 * display's frame rate. React only re-renders when the size changes or a story event happens.
 */
export function DemoChart({head,dur,reduced,lines,pins,scanning,marks,onPassed,children}:Props){
 const [light,setLight]=useState(()=>document.documentElement.dataset.theme==='light');
 useEffect(()=>onThemeChange(()=>setLight(document.documentElement.dataset.theme==='light')),[]);
 const box=useRef<HTMLDivElement>(null),line=useRef<SVGPathElement>(null),area=useRef<SVGPathElement>(null),dot=useRef<HTMLDivElement>(null),readout=useRef<HTMLSpanElement>(null);
 const [size,setSize]=useState({w:0,h:0});
 const current=useRef(head),passed=useRef(-1),sizeRef=useRef(size),passedCb=useRef(onPassed);
 passedCb.current=onPassed;sizeRef.current=size;

 const x=(i:number,w=size.w)=>LEFT+i/LAST*(w*PLOT-LEFT);
 const y=(p:number,h=size.h)=>PAD_T+(1-(p-PRICE_LO)/(PRICE_HI-PRICE_LO))*(h-PAD_T-PAD_B);

 function draw(h:number){
  const {w,h:height}=sizeRef.current;if(!w||!line.current||!area.current)return;
  const whole=Math.floor(h),frac=h-whole;let d='';
  for(let i=0;i<=whole;i++)d+=(i?'L':'M')+x(i,w).toFixed(1)+' '+y(series[i],height).toFixed(1);
  const price=frac&&whole<LAST?series[whole]+(series[whole+1]-series[whole])*frac:series[whole];
  const px=x(h,w),py=y(price,height);
  if(frac)d+='L'+px.toFixed(1)+' '+py.toFixed(1);
  line.current.setAttribute('d',d);
  area.current.setAttribute('d',d+`L${px.toFixed(1)} ${height}L${x(0,w).toFixed(1)} ${height}Z`);
  if(dot.current)dot.current.style.transform=`translate3d(${px}px,${py}px,0)`;
  if(readout.current)readout.current.textContent=usd(price,0);
  let reached=-1;for(const m of marks)if(h>=m-1e-6)reached=Math.max(reached,m);
  if(reached!==passed.current){passed.current=reached;passedCb.current(reached);}
 }

 useLayoutEffect(()=>{
  const el=box.current;if(!el)return;
  const measure=()=>{const r=el.getBoundingClientRect();setSize(s=>s.w===r.width&&s.h===r.height?s:{w:r.width,h:r.height});};
  measure();const ro=new ResizeObserver(measure);ro.observe(el);return()=>ro.disconnect();
 },[]);
 useLayoutEffect(()=>{draw(current.current);},[size]);

 useEffect(()=>{
  const from=current.current,to=head;
  if(reduced||dur<=0||from===to){current.current=to;draw(to);return;}
  let raf=0;const start=performance.now();
  const frame=(now:number)=>{const t=Math.min(1,(now-start)/dur);current.current=from+(to-from)*ease(t);draw(current.current);if(t<1)raf=requestAnimationFrame(frame);};
  raf=requestAnimationFrame(frame);
  return()=>cancelAnimationFrame(raf);
 },[head,dur,reduced]);

 const ticks=[98000,100000,102000,104000,106000];
 return <div className="dm-chart" ref={box}>
  <svg className="dm-chart-svg" width={size.w} height={size.h} viewBox={`0 0 ${size.w||1} ${size.h||1}`} aria-hidden="true">
   <defs><linearGradient id="dm-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={light?'#0b684e':'#6fe3b8'} stopOpacity=".22"/><stop offset="100%" stopColor={light?'#0b684e':'#6fe3b8'} stopOpacity="0"/></linearGradient></defs>
   {size.w>0&&ticks.map(t=><g key={t}><line x1={LEFT} x2={size.w*PLOT} y1={y(t)} y2={y(t)} className="dm-grid"/><text x={LEFT} y={y(t)-6} className="dm-tick">{usd(t,0)}</text></g>)}
   <path ref={area} fill="url(#dm-area)"/>
   <path ref={line} className="dm-price-line"/>
  </svg>
  {scanning&&!reduced&&<div className="dm-scan" aria-hidden="true"><i/></div>}
  {lines.map(l=><div key={l.id} className={'dm-level dm-level-'+l.kind+(l.visible?' is-on':'')} style={{transform:`translate3d(0,${size.h?y(l.price):0}px,0)`,width:size.w}} aria-hidden={!l.visible}>
   <span className="dm-level-rule"/><span className="dm-level-label"><b>{uiText(l.label)}</b>{usd(l.price,0)}</span>
  </div>)}
  {pins.map(p=><div key={p.id} className={'dm-pin dm-pin-'+p.tone+(p.visible?' is-on':'')+(p.minor?' is-minor':'')} style={{transform:`translate3d(${size.w?x(p.index):0}px,${size.h?y(p.price):0}px,0)`}} aria-hidden={!p.visible}><span>{uiText(p.label)}</span></div>)}
  <div className="dm-dot" ref={dot} aria-hidden="true"><i/><span className="dm-readout" ref={readout}/></div>
  {uiText(children)}
 </div>;
}
