import React,{useEffect} from 'react';
import {Button,Eyebrow,Roadmap,FAQ} from './Components';
import {SourceHeader as Header,SourceFooter as Footer} from './SourceChrome';
import {documents} from './content';
import './template.css';
import './styles.css';
import '../../public/vital/identity.css';
export default function Pages(){
 const route=location.pathname.replace(/^\/+|\/+$/g,'');const page=documents[route];
 useEffect(()=>{document.title=`HyperHive — ${page?.eyebrow??(route==='roadmap'?'Roadmap':'Information')}`;},[route]);
 return <div className="document-shell"><Header/>{page?<main className="doc-page"><Eyebrow>{page.eyebrow}</Eyebrow><h1>{page.title}</h1><p className="doc-intro">{page.intro}</p><div className="doc-layout"><nav className="doc-nav" aria-label="On this page">{page.sections.map(([h],i)=><a href={'#section-'+i} key={h}>{h}</a>)}</nav><div className="doc-content">{page.sections.map(([h,p],i)=><section key={h} id={'section-'+i}><h2>{h}</h2><p>{p}</p></section>)}<Button href="/dashboard">Open workspace</Button></div></div></main>:route==='roadmap'?<main><Roadmap/><FAQ/></main>:route==='faq'?<main><FAQ/></main>:<main className="not-found"><Eyebrow>HyperHive</Eyebrow><h1>This page is outside the hive.</h1><p>Return to the website or open the workspace.</p><Button href="/">Return home</Button></main>}<Footer/></div>;
}
