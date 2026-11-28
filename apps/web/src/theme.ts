/** One light/dark preference shared by the website and the workspace. Without a saved choice each keeps its
 *  own look: the website light, the workspace and walkthrough dark. */
export type Theme='light'|'dark';
const KEY='hyperhive.theme';
const EVENT='hyperhive-theme';

export function savedTheme():Theme|null{try{const t=localStorage.getItem(KEY);return t==='light'||t==='dark'?t:null;}catch{return null;}}
export function defaultTheme(path=typeof location==='undefined'?'/':location.pathname):Theme{
 return /^\/(dashboard|demo|preview\/walkthrough)(\/|$)/.test(path)?'dark':'light';
}
export function currentTheme():Theme{return savedTheme()??defaultTheme();}
/** Set the theme on <html> before the first render so pages never flash the wrong colours. */
export function applyTheme(theme:Theme=currentTheme()){
 const root=document.documentElement;root.dataset.theme=theme;root.style.colorScheme=theme;
 const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',theme==='dark'?'#0c0e10':'#f8faf8');
}
export function setTheme(theme:Theme){
 try{localStorage.setItem(KEY,theme);}catch{/* storage unavailable: the choice lasts for this page only */}
 applyTheme(theme);window.dispatchEvent(new Event(EVENT));
}
export function onThemeChange(listener:()=>void){window.addEventListener(EVENT,listener);return()=>window.removeEventListener(EVENT,listener);}
