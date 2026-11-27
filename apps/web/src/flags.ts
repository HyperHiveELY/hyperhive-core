import {useEffect,useState} from 'react';

/** Product flags from the server (WALKTHROUGH_ENABLED, TOKEN_CA). Everything defaults to off if the request fails. */
export type Flags={walkthrough:boolean;tokenCa:string};
const OFF:Flags={walkthrough:false,tokenCa:''};
let request:Promise<Flags>|null=null;

export function loadFlags():Promise<Flags>{
 request??=fetch('/api/flags',{credentials:'same-origin'}).then(r=>r.ok?r.json():OFF).then((f:any)=>({walkthrough:f?.walkthrough===true,tokenCa:typeof f?.tokenCa==='string'&&/^[A-Za-z0-9]{1,100}$/.test(f.tokenCa)?f.tokenCa:''})).catch(()=>OFF);
 return request;
}

export function useFlags():Flags{
 const [flags,setFlags]=useState<Flags>(OFF);
 useEffect(()=>{let live=true;loadFlags().then(f=>{if(live)setFlags(f);});return()=>{live=false;};},[]);
 return flags;
}

/** Where the walkthrough lives while the flag is off: unlisted and not indexed. */
export const WALKTHROUGH_PREVIEW_PATH='/preview/walkthrough';
const SEEN_KEY='hyperhive.walkthrough.seen';

export function walkthroughSeen(){try{return localStorage.getItem(SEEN_KEY)==='1';}catch{return true;}}
export function markWalkthroughSeen(){try{localStorage.setItem(SEEN_KEY,'1');}catch{/* storage unavailable: nothing to remember */}}
