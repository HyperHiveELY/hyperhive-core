import React from 'react';
import {createRoot} from 'react-dom/client';
if(import.meta.env.DEV){
 const {default:TradingReview}=await import('./TradingReview.js');
 createRoot(document.getElementById('root')!).render(<TradingReview/>);
}
