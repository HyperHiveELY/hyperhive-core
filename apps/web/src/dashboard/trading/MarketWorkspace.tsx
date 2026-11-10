import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Search,X,RefreshCw,Coins,Eye,EyeOff,ArrowLeft} from '../../ui/ProductIcons.js';
import {CoinLogo,MarketLinks,VolumeMetric,MarketFacts} from './MarketIdentity.js';
import {CandleChart} from './CandleChart.js';
import {loadCatalog,publicInfo,matchesMarket,type Market} from './catalog.js';
import './trading.css';
const number=(n:number|null|undefined,digits=2)=>n==null?'—':n.toLocaleString('en-US',{maximumFractionDigits:digits});
const price=(n:number|null|undefined)=>n==null?'—':n>0&&n<0.000001?n.toExponential(3):number(n,n<1?6:n<100?3:2);
const compact=(n:number|null|undefined)=>n==null?'—':new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(n);
const change=(n:number|null|undefined)=>n==null?'—':(n>=0?'+':'')+n.toFixed(2)+'%';
type Props={inspector:React.ReactNode;toolbar?:React.ReactNode;children:(market:Market|undefined,select:(id:string)=>void)=>React.ReactNode};
export function MarketWorkspace({inspector,children,toolbar}:Props){
 const [catalog,setCatalog]=useState<Awaited<ReturnType<typeof loadCatalog>>|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);
 const [selected,setSelected]=useState('Perps:HYPE'),[query,setQuery]=useState(''),[kind,setKind]=useState('All'),[sort,setSort]=useState('volume'),[showClosed,setShowClosed]=useState(false);
 const [favorites,setFavorites]=useState<string[]>(()=>{try{const saved=JSON.parse(localStorage.getItem('hh.market-watchlist')??'null');return Array.isArray(saved)&&saved.every(id=>typeof id==='string')?saved:['Perps:HYPE'];}catch{return ['Perps:HYPE'];}});
 const [chart,setChart]=useState<{id:string;candles:any[];error:string;loading:boolean}>({id:selected,candles:[],error:'',loading:true}),[chartReload,setChartReload]=useState(0);
 const [mobilePane,setMobilePane]=useState('Market');const search=useRef<HTMLInputElement>(null);
 const markets=catalog?.markets??[],market=markets.find(m=>m.id===selected);
 const candles=chart.id===selected?chart.candles:[],chartError=chart.id===selected?chart.error:'',chartLoading=chart.id!==selected||chart.loading;
 useEffect(()=>{try{localStorage.setItem('hh.market-watchlist',JSON.stringify(favorites));}catch{}},[favorites]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');loadCatalog(controller.signal).then(result=>{if(!controller.signal.aborted)setCatalog(result);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[reload]);
 useEffect(()=>{
  const controller=new AbortController();
  setChart(old=>old.id===selected?{...old,error:'',loading:!old.candles.length}:{id:selected,candles:[],error:'',loading:true});
  const coin=market?.coin??selected.slice(selected.indexOf(':')+1);
  publicInfo({type:'candleSnapshot',req:{coin,interval:'1h',startTime:Date.now()-72*3600000,endTime:Date.now()}},controller.signal)
   .then(candles=>{if(!Array.isArray(candles))throw Error('Chart data unavailable');if(!controller.signal.aborted)setChart({id:selected,candles,error:'',loading:false});})
   .catch(e=>{if(!controller.signal.aborted)setChart({id:selected,candles:[],error:e.message,loading:false});});
  return()=>controller.abort();
 },[selected,market?.coin,chartReload]);
 useEffect(()=>{const id=setInterval(()=>{setReload(v=>v+1);setChartReload(v=>v+1);},60000);return()=>clearInterval(id);},[]);
 const filtered=useMemo(()=>markets.filter(m=>(showClosed||!m.delisted)&&(kind==='All'||kind==='Saved'&&favorites.includes(m.id)||m.kind===kind)&&matchesMarket(m,query)).sort((a,b)=>sort==='name'?a.label.localeCompare(b.label):sort==='change'?(b.change??-Infinity)-(a.change??-Infinity):(b.volume??-1)-(a.volume??-1)),[markets,query,kind,favorites,sort,showClosed]);
 function selectMarket(id:string){setSelected(id);setMobilePane('Market');requestAnimationFrame(()=>document.getElementById('selected-market-heading')?.focus({preventScroll:true}));}
 return <>
 <div className="tu-workbar"><h1>Trading</h1><button className="tu-market-switch" aria-expanded={mobilePane==='Markets'} onClick={()=>setMobilePane(v=>v==='Markets'?'Market':'Markets')}>{mobilePane==='Markets'?<ArrowLeft size={17}/>:<Search size={17}/>}<span>{mobilePane==='Markets'?'Back to chart':'Markets'}</span></button>{toolbar}</div>
 <div className={'tu-workspace tu-show-'+mobilePane.toLowerCase()}>
   <aside className="tu-markets" aria-label="Hyperliquid market explorer">
    <div className="tu-panelhead"><h2>Markets <span>{markets.filter(m=>showClosed||!m.delisted).length||'—'}</span></h2><button className="tu-icon" aria-label="Refresh all markets" onClick={()=>setReload(v=>v+1)} disabled={loading}><RefreshCw size={15}/></button></div>
    <label className="tu-search"><Search size={17}/><input ref={search} aria-label="Search all Hyperliquid markets" placeholder="Search all markets" value={query} onChange={e=>setQuery(e.target.value)}/>{query?<button aria-label="Clear market search" onClick={()=>setQuery('')}><X size={14}/></button>:null}</label>
    <div className="tu-filters" aria-label="Market type">{['All','Perps','Spot','HIP-3','Saved'].map(k=><button key={k} onClick={()=>setKind(k)} aria-pressed={kind===k}>{k}</button>)}</div>
    <div className="tu-marketlabels"><span>{filtered.length} markets</span><select aria-label="Sort markets" value={sort} onChange={e=>setSort(e.target.value)}><option value="volume">Volume ↓</option><option value="change">24h change ↓</option><option value="name">Name A–Z</option></select></div>
    {(error||!!catalog?.missing.length)&&<div role="alert" className="tu-warning">{error||'Partial catalog: '+catalog?.missing.join(', ')+' unavailable.'} <button onClick={()=>setReload(v=>v+1)}>Retry</button></div>}
    <div className="tu-marketrows">{filtered.map(m=><div className={'tu-marketrow '+(m.id===selected?'is-selected':'')} key={m.id}><button className="tu-quote" aria-label={'View '+m.label+' '+m.kind+' '+m.venue} aria-pressed={m.id===selected} onClick={()=>selectMarket(m.id)}><CoinLogo market={m}/><span className="tu-symbol"><b>{m.label}</b><small>{m.delisted?'Delisted':m.kind}{m.kind==='HIP-3'?' · '+m.venue:''}</small></span><span className="tu-quotenums"><b>{price(m.price)}</b><small className={(m.change??0)<0?'tu-down':'tu-up'}>{change(m.change)}</small></span></button><button className={'tu-save '+(favorites.includes(m.id)?'saved':'')} aria-label={(favorites.includes(m.id)?'Unsave ':'Save ')+m.label+' '+m.kind+' '+m.venue} aria-pressed={favorites.includes(m.id)} onClick={()=>setFavorites(v=>v.includes(m.id)?v.filter(id=>id!==m.id):[...v,m.id])}>{favorites.includes(m.id)?<Eye size={14}/>:<EyeOff size={14}/>}</button></div>)}{!filtered.length&&<div className="tu-empty"><Search size={24}/><b>{loading?'Loading Hyperliquid markets…':'No matching markets'}</b><p>{loading?'Fetching each market venue.':'Try another symbol or market type.'}</p></div>}</div>
    <footer className="tu-marketfoot"><label><input type="checkbox" checked={showClosed} onChange={e=>setShowClosed(e.target.checked)}/> Include delisted</label><span>{loading?'Refreshing…':catalog?'Updated '+new Date(catalog.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Awaiting data'}</span></footer>
   </aside>
   <section className="tu-center" aria-label="Selected market">
    <div className="tu-instrument"><div className="tu-instrumentname">{market?<CoinLogo market={market} large/>:<span className="tu-coin"><Coins size={24}/></span>}<div><h2 id="selected-market-heading" tabIndex={-1}>{market?.label??selected.slice(selected.indexOf(':')+1)}</h2><small>{market?.kind==='Spot'?'Spot':market?.kind==='HIP-3'?'HIP-3 perpetual':'Perpetual'} · {market?.venue??'Hyperliquid'}</small></div></div><div className="tu-bigprice"><strong>{price(market?.price)}</strong><span className={(market?.change??0)<0?'tu-down':'tu-up'}>{change(market?.change)} <small>24h</small></span></div></div>
    {market&&<MarketLinks market={market}/>}
    <div className="tu-marketmetrics">{market?<VolumeMetric market={market} candles={candles}/>:<div><span>24h volume</span><b>—</b></div>}<div><span>Open interest</span><b>{market?.interest==null?'—':'$'+compact(market.interest)}</b></div><div><span>Funding / hour</span><b>{market?.funding==null?'—':(Math.abs(market.funding*100)<0.00005?0:market.funding*100).toFixed(4)+'%'}</b></div></div>
    {chartLoading?<div className="tu-chartempty">Loading hourly candles…</div>:chartError?<div className="tu-chartempty" role="alert">{chartError}<button onClick={()=>setChartReload(v=>v+1)}>Retry chart</button></div>:<CandleChart symbol={market?.coin??selected.slice(selected.indexOf(':')+1)} candles={candles}/>}

</section>
<div className="tu-inspector" id="trading-bot">{inspector}</div>
<div className="tu-accountrecords">{children(market,selectMarket)}{market&&<div className="tu-market-information"><MarketFacts market={market} candles={candles}/></div>}</div>
</div></>;
}
