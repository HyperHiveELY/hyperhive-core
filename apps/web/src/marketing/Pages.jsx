import {uiText} from "../i18n/language.js";
import React,{useEffect} from 'react';
import {Button,Eyebrow,Roadmap,FAQ} from './Components';
import {SiteHeader,SiteFooter} from './SiteChrome';
import Landing from './Landing';
import Scan from './Scan';
import WalletCheck from './WalletCheck';
import {documents} from './content';
import {DocsPage,WhitepaperPage} from './LongDoc';
import {docsPage,whitepaper} from './longDocs';
import './styles.css';
export default function Pages(){
 const route=location.pathname.replace(/^\/+|\/+$/g,'');const page=route==='docs'?docsPage:route==='whitepaper'?whitepaper:documents[route];
 useEffect(()=>{if(route)document.title=`HyperHive — ${uiText(page?.eyebrow??(route==='scan'?'AI trade scanner':route==='check'?'Wallet check':route==='roadmap'?'Roadmap':route==='faq'?'Questions':'Page not found'))}`;});
 if(route==='')return <Landing/>;
 if(route==='check')return <div className="document-shell"><SiteHeader/><WalletCheck/><SiteFooter/></div>;
 return <div className="document-shell"><SiteHeader/>{route==='scan'?<Scan/>:route==='docs'?<DocsPage doc={docsPage}/>:route==='whitepaper'?<WhitepaperPage doc={whitepaper}/>:page?<main className="doc-page"><Eyebrow>{uiText(page.eyebrow)}</Eyebrow><h1>{uiText(page.title)}</h1><p className="doc-intro">{uiText(page.intro)}</p><div className="doc-layout"><nav className="doc-nav" aria-label={uiText("On this page")}>{page.sections.map(([h],i)=><a href={'#section-'+i} key={h}>{uiText(h)}</a>)}</nav><div className="doc-content">{page.sections.map(([h,p],i)=><section key={h} id={'section-'+i}><h2>{uiText(h)}</h2><p>{uiText(p)}</p></section>)}{!["privacy","terms"].includes(route)&&<Button href="/dashboard">{uiText("Get started")}</Button>}</div></div></main>:route==='roadmap'?<main><h1 className="site-sr">{uiText("HyperHive roadmap")}</h1><Roadmap/><FAQ/></main>:route==='faq'?<main><h1 className="site-sr">{uiText("HyperHive questions and answers")}</h1><FAQ/></main>:<main className="not-found"><Eyebrow>HyperHive</Eyebrow><h1>{uiText("This page is outside the hive.")}</h1><p>{uiText("Return to the website or open the workspace.")}</p><Button href="/">{uiText("Return home")}</Button></main>}<SiteFooter/></div>;
}
