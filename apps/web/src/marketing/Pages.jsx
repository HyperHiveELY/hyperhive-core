import React,{useEffect} from 'react';
import {Button,Eyebrow,Roadmap,FAQ} from './Components';
import {SiteHeader,SiteFooter} from './SiteChrome';
import Landing from './Landing';
import {documents} from './content';
import {DocsPage,WhitepaperPage} from './LongDoc';
import {docsPage,whitepaper} from './longDocs';
import './styles.css';
export default function Pages(){
 const route=location.pathname.replace(/^\/+|\/+$/g,'');const page=route==='docs'?docsPage:route==='whitepaper'?whitepaper:documents[route];
 useEffect(()=>{if(route)document.title=`HyperHive — ${page?.eyebrow??(route==='roadmap'?'Roadmap':route==='faq'?'Questions':'Page not found')}`;},[route]);
 if(route==='')return <Landing/>;
 return <div className="document-shell"><SiteHeader/>{route==='docs'?<DocsPage doc={docsPage}/>:route==='whitepaper'?<WhitepaperPage doc={whitepaper}/>:page?<main className="doc-page"><Eyebrow>{page.eyebrow}</Eyebrow><h1>{page.title}</h1><p className="doc-intro">{page.intro}</p><div className="doc-layout"><nav className="doc-nav" aria-label="On this page">{page.sections.map(([h],i)=><a href={'#section-'+i} key={h}>{h}</a>)}</nav><div className="doc-content">{page.sections.map(([h,p],i)=><section key={h} id={'section-'+i}><h2>{h}</h2><p>{p}</p></section>)}{!["privacy","terms"].includes(route)&&<Button href="/dashboard">Get started</Button>}</div></div></main>:route==='roadmap'?<main><h1 className="site-sr">HyperHive roadmap</h1><Roadmap/><FAQ/></main>:route==='faq'?<main><h1 className="site-sr">HyperHive questions and answers</h1><FAQ/></main>:<main className="not-found"><Eyebrow>HyperHive</Eyebrow><h1>This page is outside the hive.</h1><p>Return to the website or open the workspace.</p><Button href="/">Return home</Button></main>}<SiteFooter/></div>;
}
