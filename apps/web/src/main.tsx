import React from 'react';
import {createRoot} from 'react-dom/client';
import {loadFlags,walkthroughSeen,WALKTHROUGH_PREVIEW_PATH} from './flags.js';
const root=createRoot(document.getElementById('root')!);
const path=location.pathname.replace(/\/+$/,'')||'/';

/** True when this browser has no wallet session yet (a first-time visitor). */
async function signedOut(){try{return (await fetch('/api/me',{credentials:'same-origin'})).status===401;}catch{return false;}}

if(import.meta.env.DEV&&path==='/__design'){
 if(new URLSearchParams(location.search).has('icons')){
  const {default:IconReview}=await import('./dashboard/IconReview.js');root.render(<IconReview/>);
 }else if(new URLSearchParams(location.search).has('walkthrough')){
  const {default:WalkthroughReview}=await import('./dashboard/WalkthroughReview.js');root.render(<WalkthroughReview/>);
 }else{
  const {default:DesignReview}=await import('./dashboard/DesignReview.js');root.render(<DesignReview/>);
 }
}else if(path===WALKTHROUGH_PREVIEW_PATH||path==='/demo'&&(await loadFlags()).walkthrough){
 // The preview path always works for the team; /demo goes live with WALKTHROUGH_ENABLED.
 if(path===WALKTHROUGH_PREVIEW_PATH){const meta=document.createElement('meta');meta.name='robots';meta.content='noindex, nofollow';document.head.append(meta);}
 const {default:Demo}=await import('./demo/Demo.js');root.render(<Demo/>);
}else if(path.startsWith('/dashboard')){
 const [{default:App},flags,firstVisit]=await Promise.all([import('./App.js'),loadFlags(),walkthroughSeen()?false:signedOut()]);
 // With the flag on, a first-time, signed-out visitor sees the walkthrough once before the workspace.
 if(flags.walkthrough&&firstVisit)location.replace('/demo');
 else root.render(<App/>);
}else{
 const {default:Pages}=await import('./marketing/Pages.jsx');root.render(<Pages/>);
}
