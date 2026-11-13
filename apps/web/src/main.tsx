import React from 'react';
import {createRoot} from 'react-dom/client';
const root=createRoot(document.getElementById('root')!);
if(import.meta.env.DEV&&location.pathname==='/__design'){
 if(new URLSearchParams(location.search).has('icons')){
  const {default:IconReview}=await import('./dashboard/IconReview.js');root.render(<IconReview/>);
 }else if(new URLSearchParams(location.search).has('walkthrough')){
  const {default:WalkthroughReview}=await import('./dashboard/WalkthroughReview.js');root.render(<WalkthroughReview/>);
 }else{
  const {default:DesignReview}=await import('./dashboard/DesignReview.js');root.render(<DesignReview/>);
 }
}else if(location.pathname.startsWith('/dashboard')){
 const {default:App}=await import('./App.js');root.render(<App/>);
}else{
 const {default:Pages}=await import('./marketing/Pages.jsx');root.render(<Pages/>);
}
