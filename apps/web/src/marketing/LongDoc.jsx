import React, {useEffect, useRef, useState} from 'react';
import {Eyebrow, Button} from './Components';
import {TokenCa} from '../TokenCa';
import {Icon} from './LandingIcons';
import './long-docs.css';

function Block({block}) {
  const [kind, a, b] = block;
  switch (kind) {
    case 'p': return <p>{a}</p>;
    case 'h3': return <h3>{a}</h3>;
    case 'note': return <p className="ld-note">{a}</p>;
    case 'list': return <ul className="ld-list">{a.map(x => <li key={x}>{x}</li>)}</ul>;
    case 'steps': return <ol className="ld-steps">{a.map(x => <li key={x}>{x}</li>)}</ol>;
    case 'defs': return <dl className="ld-defs">{a.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl>;
    case 'formula': return <figure className="ld-formula"><pre>{a.join('\n')}</pre>{b && <figcaption>{b}</figcaption>}</figure>;
    case 'link': return <p><a className="ld-link" href={b} target="_blank" rel="noreferrer">{a} ↗</a></p>;
    case 'ca': return <TokenCa className="ld-ca" />;
    case 'table': return <div className="ld-table"><table>
      <thead><tr>{a.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
      <tbody>{b.map((r, i) => <tr key={i}>{r.map((c, j) => j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table></div>;
    default: return null;
  }
}

/** Highlight the section nearest the top of the viewport. */
function useActive(ids) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const onScroll = () => {
      let current = ids[0];
      for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 200) current = id; }
      setActive(current);
    };
    // The page renders after the browser's own jump to #section, so repeat that jump once content exists.
    const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) requestAnimationFrame(() => target.scrollIntoView());
    onScroll();
    addEventListener('scroll', onScroll, {passive: true});
    return () => removeEventListener('scroll', onScroll);
  }, [ids.join()]);
  return active;
}

function Toc({groups, active, numbered}) {
  let n = 0;
  return <nav className="ld-toc" aria-label="On this page">
    {groups.map(g => <div className="ld-toc__group" key={g.name || 'all'}>
      {g.name && <span className="ld-toc__label">{g.name}</span>}
      {g.sections.map(s => { n++; return <a key={s.id} href={'#' + s.id} className={active === s.id ? 'is-active' : ''} aria-current={active === s.id ? 'location' : undefined}>
        {numbered && <span className="ld-toc__num">{String(n).padStart(2, '0')}</span>}{s.title}</a>; })}
    </div>)}
  </nav>;
}

const pipeline = [
  ['scouts', 'Scouts', 'Find the idea', '#trade-cards'],
  ['skeptic', 'Skeptic', 'Challenge it', '#trade-cards'],
  ['sizer', 'Sizer', 'Size it in code', '#sizing'],
  ['executor', 'Executor', 'Sign and exit', '#exits'],
  ['auditor', 'Auditor', 'Match the fill', '#auditors'],
];
const shortcuts = [
  ['bolt', 'Quick start', 'From wallet to first crew in five steps.', '#quick-start'],
  ['sizer', 'How a trade is sized', 'The exact formulas, no slider.', '#sizing'],
  ['auditor', 'Check a record', 'Verify every fill yourself.', '#verify'],
  ['cube', 'Whitepaper', 'The full design, start to finish.', '/whitepaper'],
];
const blockText = b => b.flat(3).filter(x => typeof x === 'string').join(' ');

export function DocsPage({doc}) {
  const [query, setQuery] = useState('');
  const search = useRef(null);
  const q = query.trim().toLowerCase();
  const groups = doc.groups.map(g => ({...g, sections: g.sections.filter(s => !q || (s.title + ' ' + s.blocks.map(blockText).join(' ')).toLowerCase().includes(q))})).filter(g => g.sections.length);
  const ids = groups.flatMap(g => g.sections.map(s => s.id));
  const active = useActive(ids);
  useEffect(() => {
    const onKey = e => { if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); search.current?.focus(); } };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  return <main className="ld ld--docs">
    <header className="ld-dhero">
      <div className="ld-dhero__top">
        <span className="ld-dhero__eyebrow"><i />{doc.eyebrow}</span>
        <span className="ld-dhero__meta">{doc.groups.reduce((n, g) => n + g.sections.length, 0)} topics · plain language</span>
      </div>
      <h1>{doc.title}</h1>
      <p className="ld-dhero__intro">{doc.intro}</p>
      <label className="ld-search">
        <Icon name="search" size={18} />
        <span className="site-sr">Search the docs</span>
        <input ref={search} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search the docs" onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }} />
        <kbd>/</kbd>
      </label>
      <ol className="ld-pipe" aria-label="The five roles in a crew">
        {pipeline.map(([icon, name, job, href], i) => <li key={name}><a href={href}>
          <span className="ld-pipe__n">0{i + 1}</span><Icon name={icon} size={20} /><b>{name}</b><small>{job}</small></a></li>)}
      </ol>
    </header>
    <div className="ld-cards">
      {shortcuts.map(([icon, title, text, href]) => <a key={title} className="ld-card" href={href}>
        <span className="ld-card__icon"><Icon name={icon} size={20} /></span><b>{title}</b><span>{text}</span><span className="ld-card__arrow" aria-hidden="true">→</span></a>)}
    </div>
    <div className="ld-layout">
      <aside className="ld-side"><Toc groups={groups} active={active} /></aside>
      <div className="ld-body">
        {q && <p className="ld-results" role="status">{ids.length ? `${ids.length} topic${ids.length === 1 ? '' : 's'} match “${query.trim()}”` : `Nothing matches “${query.trim()}”.`}{' '}<button type="button" onClick={() => setQuery('')}>Clear</button></p>}
        {groups.map(g => <div className="ld-group" key={g.name}>
          <span className="ld-group__label"><span>{String(doc.groups.findIndex(x => x.name === g.name) + 1).padStart(2, '0')}</span>{g.name}</span>
          {g.sections.map(s => <section key={s.id} id={s.id} className="ld-section"><h2><a href={'#' + s.id}>{s.title}<span className="ld-hash" aria-hidden="true">#</span></a></h2>{s.blocks.map((b, i) => <Block key={i} block={b} />)}</section>)}
        </div>)}
        <div className="ld-end"><div><b>Try it with paper money first.</b><span>Same process, no funds at risk.</span></div><Button href="/dashboard">Open the workspace</Button></div>
      </div>
    </div>
  </main>;
}

export function WhitepaperPage({doc}) {
  const ids = ['abstract', ...doc.sections.map(s => s.id)];
  const active = useActive(ids);
  const groups = [{sections: doc.sections}];
  return <main className="ld ld--paper">
    <header className="ld-hero ld-hero--paper"><Eyebrow>{doc.eyebrow}</Eyebrow><h1>{doc.title}</h1>
      <div className="ld-meta"><span>{doc.meta}</span><button type="button" className="ld-print" onClick={() => print()}>Save as PDF</button></div></header>
    <div className="ld-layout">
      <aside className="ld-side"><Toc groups={groups} active={active} numbered /></aside>
      <article className="ld-body">
        <section id="abstract" className="ld-abstract"><h2>Abstract</h2><p>{doc.abstract}</p></section>
        {doc.sections.map((s, i) => <section key={s.id} id={s.id} className="ld-section">
          <h2><a href={'#' + s.id}><span className="ld-num">{i + 1}.</span>{s.title}</a></h2>{s.blocks.map((b, j) => <Block key={j} block={b} />)}</section>)}
        <p className="ld-disclaimer">{doc.disclaimer}</p>
      </article>
    </div>
  </main>;
}
