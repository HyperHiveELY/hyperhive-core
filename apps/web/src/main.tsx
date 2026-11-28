import './typography.css';
import React,{useSyncExternalStore} from 'react';
import {initializeLanguage,getLanguage,subscribeLanguage} from './i18n/language.js';
import {createRoot} from 'react-dom/client';
import {loadFlags,walkthroughSeen,WALKTHROUGH_PREVIEW_PATH} from './flags.js';
import {applyTheme} from './theme.js';
applyTheme();
await initializeLanguage();
const root=createRoot(document.getElementById('root')!);
// Re-render the existing component tree so switching language preserves open forms and wallet state.
function LocalizedApp({page:Page}:{page:React.ComponentType}){
 useSyncExternalStore(subscribeLanguage,getLanguage,getLanguage);
 return <Page/>;
}
const path=location.pathname.replace(/\/+$/,'')||'/';

/** Search and link-preview bots keep no storage, so they would be redirected on every visit. */
function crawler(){return navigator.webdriver||/bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|lighthouse/i.test(navigator.userAgent);}

/** True when this browser has no wallet session yet (a first-time visitor). */
async function signedOut(){try{return (await fetch('/api/me',{credentials:'same-origin'})).status===401;}catch{return false;}}

if(import.meta.env.DEV&&path==='/__design'){
 if(new URLSearchParams(location.search).has('icons')){
  const {default:IconReview}=await import('./dashboard/IconReview.js');root.render(<LocalizedApp page={IconReview}/>);
 }else if(new URLSearchParams(location.search).has('walkthrough')){
  const {default:WalkthroughReview}=await import('./dashboard/WalkthroughReview.js');root.render(<LocalizedApp page={WalkthroughReview}/>);
 }else{
  const {default:DesignReview}=await import('./dashboard/DesignReview.js');root.render(<LocalizedApp page={DesignReview}/>);
 }
}else if(path===WALKTHROUGH_PREVIEW_PATH||path==='/demo'&&(await loadFlags()).walkthrough){
 // The preview path always works for the team; /demo goes live with WALKTHROUGH_ENABLED.
 if(path===WALKTHROUGH_PREVIEW_PATH){const meta=document.createElement('meta');meta.name='robots';meta.content='noindex, nofollow';document.head.append(meta);}
 const {default:Demo}=await import('./demo/Demo.js');root.render(<LocalizedApp page={Demo}/>);
}else if(path.startsWith('/dashboard')){
 const [{default:App},flags,firstVisit]=await Promise.all([import('./App.js'),loadFlags(),walkthroughSeen()?false:signedOut()]);
 // With the flag on, a first-time, signed-out visitor sees the walkthrough once before the workspace.
 if(flags.walkthrough&&firstVisit)location.replace('/demo');
 else root.render(<LocalizedApp page={App}/>);
}else{
 // With the flag on, a first-time human visitor to the home page sees the walkthrough once (the demo marks it seen).
 if(path==='/'&&!walkthroughSeen()&&!crawler()&&(await loadFlags()).walkthrough)location.replace('/demo');
 else{const {default:Pages}=await import('./marketing/Pages.jsx');root.render(<LocalizedApp page={Pages}/>);}
}
