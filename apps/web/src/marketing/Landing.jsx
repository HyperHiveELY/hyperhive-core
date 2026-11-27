import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {SiteHeader, SiteFooter, ActionLink, primaryAction} from './SiteChrome';
import {useFlags} from '../flags';
import {Icon} from './LandingIcons';
import {artwork} from './landingArt';
import {media, featureItems, architecture, roles, principles, cases, controls, metrics, tokenPacks, included, roleMarks} from './landingContent';
import './landing.css';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const img = name => `${media}/${name}`;
// Printed trading illustrations shared with the original site (art/sketches). Shown as-is: no duotone, no frame.
const sketch = name => `/art/sketches/${name}`;

function Kicker({children, tone = 'mint', as: Tag = 'p'}) {
  return <Tag className={`lp-kicker lp-kicker--${tone}`}><span className="lp-kicker__dot" aria-hidden="true" />{children}</Tag>;
}

function Art({type, uid, className = ''}) {
  const html = useMemo(() => ({__html: artwork(type, uid)}), [type, uid]);
  return <div className={`lp-art ${className}`} aria-hidden="true" dangerouslySetInnerHTML={html} />;
}

function Ticker({label}) {
  const marks = roleMarks.map(([name, path]) => ({name, svg: {__html: `<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">${path}</svg>`}}));
  const row = hidden => (
    <ul className="lp-ticker__row" aria-hidden={hidden || undefined}>
      {marks.map(mark => <li key={mark.name} title={hidden ? undefined : mark.name}><span className="lp-ticker__mark" dangerouslySetInnerHTML={mark.svg} />{!hidden && <span className="lp-sr">{mark.name}</span>}</li>)}
    </ul>
  );
  return <div className="lp-ticker" role="group" aria-label={label}><div className="lp-ticker__track">{row(false)}{row(true)}</div></div>;
}

function Corners() {
  return <span className="lp-corners" aria-hidden="true"><i /><i /><i /><i /></span>;
}

/** Fade sections in as they enter the viewport; skipped for reduced motion. */
function useReveal(rootRef) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || reducedMotion() || typeof IntersectionObserver !== 'function') return undefined;
    root.classList.add('lp--reveal');
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-in'); observer.unobserve(entry.target); }
    }, {rootMargin: '0px 0px -8% 0px', threshold: 0.08});
    root.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [rootRef]);
}

function Hero() {
  const {walkthrough} = useFlags();
  return (
    <section id="home" className="lp-hero" aria-labelledby="lp-hero-title">
      <div className="lp-container lp-hero__frame">
        <div className="lp-gridbg" aria-hidden="true" />
        <div className="lp-hero__tiles" aria-hidden="true">
          <span className="lp-tile lp-tile--spheres lp-tile--sketch"><img src={sketch('node-print.png')} alt="" /></span>
          <span className="lp-tile lp-tile--hardware lp-tile--sketch"><img src={sketch('position-sizing.png')} alt="" /></span>
          <span className="lp-tile lp-tile--laptop lp-tile--sketch"><img src={sketch('bracket-order.png')} alt="" /></span>
          <span className="lp-tile lp-tile--ring lp-tile--sketch"><img src={sketch('ring-print.png')} alt="" /></span>
          <span className="lp-tile lp-tile--cubes lp-tile--sketch"><img src={sketch('cube-print.png')} alt="" /></span>
          <span className="lp-tile lp-tile--meeting lp-tile--sketch"><img src={sketch('scout-setup.png')} alt="" /></span>
        </div>
        <div className="lp-hero__copy">
          <Kicker tone="green">A Trading Crew For Hyperliquid</Kicker>
          <h1 id="lp-hero-title">AI Proposes The Trade. <span className="lp-accent">Code Defines</span> The Boundaries.</h1>
          <div className="lp-actions">
            <ActionLink href={primaryAction.href}>{primaryAction.label}</ActionLink>
            {walkthrough
              ? <ActionLink href="/demo" variant="light">Watch the 1-minute demo</ActionLink>
              : <ActionLink href="/#how-it-works" variant="light">See how it works</ActionLink>}
          </div>
        </div>
      </div>
      <div className="lp-glow" aria-hidden="true" />
    </section>
  );
}

function RolesStrip() {
  return (
    <section className="lp-strip" aria-labelledby="lp-strip-title">
      <div className="lp-container lp-strip__inner">
        <div className="lp-strip__copy">
          <h2 id="lp-strip-title" className="lp-kicker lp-kicker--mint lp-strip__title"><span className="lp-kicker__dot" aria-hidden="true" />Five Roles. One Crew.</h2>
          <p>A defined job at every step</p>
        </div>
        <Ticker label="Crew roles" />
      </div>
    </section>
  );
}

function Features() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(() => !reducedMotion());
  useEffect(() => {
    if (!auto) return undefined;
    const timer = setInterval(() => setActive(index => (index + 1) % featureItems.length), 6000);
    return () => clearInterval(timer);
  }, [auto]);
  const choose = index => { setAuto(false); setActive(index); };
  const item = featureItems[active];
  return (
    <section id="features" className="lp-section lp-guides" aria-labelledby="lp-features-title">
      <div className="lp-container">
        <div className="lp-features">
          <div className="lp-features__copy" data-reveal>
            <Kicker tone="green">Core Technology</Kicker>
            <h2 id="lp-features-title" className="lp-h2">AI Ideas. Code With Clear Boundaries.</h2>
            <p className="lp-features__lead">The AI proposes a trade. Deterministic code controls the size, signs the order and manages the exits.</p>
            <ActionLink href="/docs" variant="dark">Read the docs</ActionLink>
            <ul className="lp-accordion">
              {featureItems.map((feature, index) => {
                const open = index === active;
                return (
                  <li key={feature.title} className={open ? 'is-open' : ''}>
                    <h3>
                      <button type="button" aria-expanded={open} aria-controls={`lp-feature-${index}`} onClick={() => choose(index)}>
                        <Icon name={feature.icon} size={18} />{feature.title}
                      </button>
                    </h3>
                    <p id={`lp-feature-${index}`} hidden={!open}>{feature.text}</p>
                    {open && <span key={active + String(auto)} className={'lp-accordion__line' + (auto ? ' is-timed' : '')} aria-hidden="true" />}
                  </li>
                );
              })}
            </ul>
          </div>
          <Art key={item.art} type={item.art} uid={`lp-feature-art-${item.art}`} className="lp-features__art" />
        </div>
      </div>
    </section>
  );
}

function Principle() {
  return (
    <section id="about" className="lp-section lp-guides" aria-labelledby="lp-principle-title">
      <div className="lp-container lp-principle">
        <div className="lp-principle__body" data-reveal>
          <Kicker tone="mint" as="h2"><span id="lp-principle-title">The HyperHive Principle</span></Kicker>
          <p className="lp-statement">A market call is <span className="lp-statement__green">only the beginning</span>. Size, exits and key custody determine how a trading crew works. Every order should leave <span className="lp-statement__mint">a record you can inspect</span>.</p>
        </div>
        <div className="lp-principle__foot">
          <div>
            <p className="lp-principle__label"><span aria-hidden="true" />Process you can inspect</p>
            <p className="lp-principle__sub">A record of how your account was traded</p>
          </div>
          <div className="lp-principle__audience">
            <span className="lp-avatars" aria-hidden="true">
              <img src={sketch('setup-glyph.png')} alt="" /><img src={sketch('verdict-glyph.png')} alt="" /><img src={sketch('distance-glyph.png')} alt="" />
            </span>
            <p><span>Built for</span>Account Owners</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Architecture() {
  return (
    <section id="technology" className="lp-section lp-section--soft lp-guides" aria-labelledby="lp-architecture-title">
      <div className="lp-container lp-architecture">
        <div className="lp-split-head" data-reveal>
          <div>
            <Kicker>The Architecture</Kicker>
            <h2 id="lp-architecture-title" className="lp-h2">Intelligence, With <span className="lp-line lp-mint">A Clear Boundary.</span></h2>
          </div>
          <p className="lp-lead">Ideas, authority and evidence have separate jobs. Each stays within a defined boundary.</p>
        </div>
        <div className="lp-cards3">
          {architecture.map(card => (
            <article key={card.title} className="lp-arch-card" data-reveal>
              <Art type={card.art} uid={`lp-arch-${card.art}`} className="lp-arch-card__art" />
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function InsideCrew() {
  return (
    <section className="lp-inside" aria-labelledby="lp-inside-title">
      <div className="lp-inside__media" aria-hidden="true">
        <img className="lp-inside__bg" src={img('crew-halftone.png')} alt="" />
        <img className="lp-inside__slip" src="/art/slip-confirmation.svg" alt="" />
        <img className="lp-inside__meeting lp-sketch" src={sketch('scout-setup.png')} alt="" />
        <img className="lp-inside__card" src="/art/proposal-card.svg" alt="" />
        <img className="lp-inside__laptop lp-sketch" src={sketch('bracket-order.png')} alt="" />
      </div>
      <div className="lp-inside__copy" data-reveal>
        <Kicker tone="white">Inside The Crew</Kicker>
        <h2 id="lp-inside-title" className="lp-h2">Follow An Idea Through The Hive.</h2>
        <p>Inspect the roles, the boundaries and the record. See what each stage is allowed to do.</p>
        <a className="lp-inside__link" href="/#how-it-works">
          <span>See the five roles</span>
          <span className="lp-inside__arrow" aria-hidden="true"><Icon name="arrowRight" size={16} strokeWidth={2} /></span>
        </a>
      </div>
    </section>
  );
}

function HowItWorks() {
  const [active, setActive] = useState(0);
  const tabs = useRef([]);
  const role = roles[active];
  const onKeyDown = event => {
    const keys = {ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1};
    let next = null;
    if (event.key in keys) next = (active + keys[event.key] + roles.length) % roles.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = roles.length - 1;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };
  return (
    <section id="how-it-works" className="lp-section lp-guides" aria-labelledby="lp-how-title">
      <div className="lp-container lp-how">
        <div className="lp-split-head lp-pad" data-reveal>
          <div>
            <Kicker>How It Works</Kicker>
            <h2 id="lp-how-title" className="lp-h2">Five roles. Every <span className="lp-line lp-mint">step accounted for.</span></h2>
          </div>
          <p className="lp-lead lp-lead--small">From the Scouts’ proposal to the Auditor’s checkable record.</p>
        </div>
        <div className="lp-how__bar">
          <p>From idea to evidence.</p>
          <a href="/docs"><span aria-hidden="true" />Read the docs</a>
          <span className="lp-how__help" aria-hidden="true"><Icon name="question" size={30} strokeWidth={1.4} /></span>
        </div>
        <div className="lp-how__stepper">
          <div className="lp-how__tabs" role="tablist" aria-label="Crew roles" aria-orientation="vertical" onKeyDown={onKeyDown}>
            {roles.map((item, index) => (
              <button
                key={item.label}
                ref={el => { tabs.current[index] = el; }}
                type="button"
                role="tab"
                id={`lp-role-tab-${index}`}
                aria-selected={index === active}
                aria-controls="lp-role-panel"
                tabIndex={index === active ? 0 : -1}
                className={index === active ? 'is-active' : ''}
                onClick={() => setActive(index)}
              >
                <Icon name={item.icon} size={24} />
                <span className="lp-how__tab-label">{item.label}</span>
                <span className="lp-how__tab-num">{String(index + 1).padStart(2, '0')}</span>
              </button>
            ))}
          </div>
          <label className="lp-how__select">
            <span className="lp-sr">Choose a crew role</span>
            <Icon name={role.icon} size={24} />
            <select value={active} onChange={event => setActive(Number(event.target.value))}>
              {roles.map((item, index) => <option key={item.label} value={index}>{item.label}</option>)}
            </select>
            <Icon name="chevronDown" size={22} className="lp-how__chevron" />
          </label>
          <article id="lp-role-panel" className="lp-how__panel" role="tabpanel" aria-labelledby={`lp-role-tab-${active}`} aria-live="polite">
            <div className="lp-how__meta"><span>{role.kind}</span><span>{String(active + 1).padStart(2, '0')} / 05</span></div>
            <h3>{role.title}</h3>
            <p className="lp-how__intro">{role.intro}</p>
            <dl>
              {role.rows.map(([term, detail]) => <div key={term}><dt>{term}</dt><dd>{detail}</dd></div>)}
            </dl>
            <div className="lp-how__next"><span>{role.nextLabel ?? 'WHAT HAPPENS NEXT'}</span><p>{role.next}</p></div>
          </article>
        </div>
      </div>
    </section>
  );
}

function Quotes() {
  const [index, setIndex] = useState(0);
  const step = delta => setIndex(value => (value + delta + principles.length) % principles.length);
  return (
    <section id="principles" className="lp-section lp-guides" aria-labelledby="lp-quotes-title">
      <div className="lp-container lp-quotes">
        <div className="lp-gridbg" aria-hidden="true" />
        <div className="lp-quotes__body" data-reveal>
          <Kicker as="h2"><span id="lp-quotes-title">What A Slip Proves</span></Kicker>
          <blockquote aria-live="polite"><p>{principles[index]}</p></blockquote>
          <div className="lp-quotes__nav">
            <button type="button" onClick={() => step(-1)}><Icon name="arrowLeft" size={20} /><span className="lp-sr">Previous principle</span></button>
            <div className="lp-quotes__by">
              <img src="/art/hyperhive-logo.svg" alt="" width="48" height="48" />
              <p><strong>Process, Not Profit</strong><span>The HyperHive Principle</span></p>
            </div>
            <button type="button" onClick={() => step(1)}><Icon name="arrowRight" size={20} /><span className="lp-sr">Next principle</span></button>
          </div>
        </div>
        <div className="lp-glow lp-glow--soft" aria-hidden="true" />
      </div>
    </section>
  );
}

function CaseStudy() {
  const track = useRef(null);
  const [edges, setEdges] = useState({start: true, end: false});
  const update = () => {
    const el = track.current;
    if (!el) return;
    setEdges({start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8});
  };
  useEffect(() => { update(); window.addEventListener('resize', update); return () => window.removeEventListener('resize', update); }, []);
  const move = direction => {
    const el = track.current;
    const card = el?.querySelector('article');
    if (!el || !card) return;
    el.scrollBy({left: direction * (card.getBoundingClientRect().width + 10), behavior: reducedMotion() ? 'auto' : 'smooth'});
  };
  return (
    <section id="case-study" className="lp-cases" aria-labelledby="lp-cases-title">
      <div className="lp-container lp-cases__head" data-reveal>
        <div>
          <Kicker tone="white">A Process Case Study</Kicker>
          <h2 id="lp-cases-title" className="lp-h1like">Trace The Decision, Step By Step.</h2>
        </div>
        <div className="lp-cases__controls">
          <a className="lp-cases__link" href="/case-study">Read the case study</a>
          <button type="button" onClick={() => move(-1)} disabled={edges.start}><Icon name="arrowLeft" size={18} strokeWidth={2} /><span className="lp-sr">Previous role</span></button>
          <button type="button" onClick={() => move(1)} disabled={edges.end}><Icon name="arrowRight" size={18} strokeWidth={2} /><span className="lp-sr">Next role</span></button>
        </div>
      </div>
      <div className="lp-cases__track" ref={track} onScroll={update} tabIndex={0} aria-label="Crew roles, scrollable">
        {cases.map(item => (
          <article key={item.role} className="lp-case">
            <div className="lp-case__media">
              <img className="lp-sketch" src={sketch(item.image)} alt="" loading="lazy" />
              <p className="lp-case__caption">{item.caption}</p>
              <p className="lp-case__number"><span aria-hidden="true">{item.number}</span><span className="lp-sr">{item.numberLabel}</span></p>
            </div>
            <div className="lp-case__body">
              <Kicker tone="dark" as="p">{item.role}</Kicker>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <span className="lp-case__icon" aria-hidden="true"><Icon name="cube" size={56} strokeWidth={1.8} /></span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AutoVideo({src, className}) {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (reducedMotion()) video.pause(); else video.play().catch(() => {});
  }, []);
  return <video ref={ref} className={className} src={src} muted loop playsInline preload="metadata" aria-hidden="true" tabIndex={-1} />;
}

function Workflow() {
  return (
    <section id="workflow" className="lp-section lp-guides" aria-label="The crew workspace">
      <div className="lp-container lp-workflow">
        <div className="lp-workflow__row">
          <div className="lp-workflow__media"><AutoVideo src={sketch('scout-setup.webm')} className="lp-sketch" /><Corners /></div>
          <div className="lp-workflow__copy" data-reveal>
            <Kicker>The Crew Workspace</Kicker>
            <h2 className="lp-h3like">See what your crew is doing.</h2>
            <p>Follow trade cards through review, inspect the sizing policy and read the execution record. Your workspace brings the controls together: weekly budget, market selection and stand down. Existing stops and exits keep running when new entries stop.</p>
          </div>
        </div>
        <div className="lp-workflow__row lp-workflow__row--flip">
          <div className="lp-workflow__media"><AutoVideo src={sketch('bracket-order.webm')} className="lp-sketch" /><Corners /></div>
          <div className="lp-workflow__copy" data-reveal>
            <Kicker>A Separate Account</Kicker>
            <h2 className="lp-h3like">Your account. A narrowly scoped key.</h2>
            <p>Use a fresh Hyperliquid account for your crew. The design keeps the owner key in your browser and the trading key inside the enclave. The signer refuses transfers and withdrawals. Launch testing must establish what a stolen agent key could still do at the venue.</p>
            <ActionLink href="/risks" variant="light">Risks &amp; limits</ActionLink>
          </div>
        </div>
      </div>
    </section>
  );
}

function Ownership() {
  return (
    <section className="lp-section lp-guides" aria-labelledby="lp-owner-title">
      <div className="lp-container lp-owner">
        <div className="lp-owner__head" data-reveal>
          <Kicker>Account Ownership</Kicker>
          <h2 id="lp-owner-title" className="lp-h2">Know who can sign. And what they can sign.</h2>
        </div>
        <Ticker label="Crew roles" />
        <div className="lp-owner__cards">
          <article className="lp-owner__quote">
            <img src="/art/hyperhive-wordmark.svg" alt="HyperHive" width="177" height="28" />
            <p>“Your withdrawal authority stays with the account you control.”</p>
            <a href="/docs"><span aria-hidden="true" />Read the docs</a>
          </article>
          <img className="lp-owner__portrait lp-sketch" src={sketch('setup-glyph.png')} alt="" loading="lazy" />
          <article className="lp-owner__key">
            <Kicker tone="white" as="h3">The Trading Key</Kicker>
            <img src="/art/hyperhive-wordmark-white.svg" alt="" width="161" height="28" />
            <p>Orders and exits. A defined signing boundary.</p>
            <img className="lp-owner__object lp-duo" src={img('trading-key-object.png')} alt="" loading="lazy" />
          </article>
        </div>
      </div>
    </section>
  );
}

function Controls() {
  return (
    <section id="controls" className="lp-section lp-section--soft lp-guides" aria-labelledby="lp-controls-title">
      <div className="lp-container">
        <div className="lp-controls__head lp-pad" data-reveal>
          <div>
            <Kicker>Your Controls</Kicker>
            <h2 id="lp-controls-title" className="lp-h2">Your Weekly Budget. Your Crew. Your Final Say.</h2>
            <p>A weekly budget defines the risk limit. You retain the ability to stand down, close positions, revoke the key and withdraw.</p>
          </div>
          <p className="lp-controls__stat" aria-hidden="true">5 roles</p>
        </div>
        <ul className="lp-controls__grid">
          {controls.map(item => (
            <li key={item.title} data-reveal>
              <span className="lp-controls__dot" aria-hidden="true" />
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <span className="lp-controls__iconrow" aria-hidden="true"><span className="lp-controls__icon"><Icon name={item.icon} size={22} /></span></span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Metrics() {
  return (
    <section id="policy" className="lp-metrics" aria-labelledby="lp-metrics-title">
      <div className="lp-container lp-pad">
        <div data-reveal>
          <Kicker tone="white">Policy, In Numbers</Kicker>
          <h2 id="lp-metrics-title" className="lp-h2">Weekly Budget. Fixed Risk Rules.</h2>
        </div>
      </div>
      <ul className="lp-container lp-metrics__grid">
        {metrics.map(item => (
          <li key={item.title} className="lp-metrics__cell">
            <Corners />
            <article className="lp-metric" data-reveal>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <div className="lp-metric__value"><strong>{item.value}</strong><span>{item.note}</span></div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Pricing() {
  const [pack, setPack] = useState(0);
  const current = tokenPacks[pack];
  return (
    <section id="pricing" className="lp-pricing" aria-labelledby="lp-pricing-title">
      <p className="lp-pricing__word" aria-hidden="true">Pricing</p>
      <div className="lp-container lp-pad lp-pricing__layout">
        <div className="lp-pricing__intro" data-reveal>
          <Kicker tone="white">Pricing</Kicker>
          <h2 id="lp-pricing-title" className="lp-h2">AI that fits your pace.</h2>
          <div className="lp-pricing__note">
            <p>“1 USDC buys 1,000 Tokens. Current model rates and service markup are shown in the dashboard. No monthly plan. Trading fees apply separately.”</p>
            <p className="lp-pricing__by"><img src="/art/hyperhive-logo.svg" alt="" width="24" height="24" /><strong>Tokens &amp; Fees</strong><span aria-hidden="true" />Pay As You Go</p>
          </div>
        </div>
        <div className="lp-pricing__card-wrap">
          <div className="lp-pricing__packs" role="group" aria-label="Token pack">
            {tokenPacks.map((item, index) => (
              <button key={item.tokens} type="button" aria-pressed={index === pack} onClick={() => setPack(index)}>{item.tokens}</button>
            ))}
          </div>
          <div className="lp-pricing__card">
            <Corners />
            <img className="lp-pricing__object lp-duo" src={img('pricing-object.png')} alt="" loading="lazy" />
            <span className="lp-pricing__box" aria-hidden="true"><Icon name="cube" size={26} /></span>
            <p className="lp-pricing__label">What’s included:</p>
            <ul>{included.map(text => <li key={text}><Icon name="plus" size={16} />{text}</li>)}</ul>
            <div className="lp-pricing__foot">
              <p className="lp-pricing__price" aria-live="polite"><strong>{current.price}</strong> USDC<span className="lp-sr"> for {current.tokens}</span></p>
              <ActionLink href={primaryAction.href} variant="dark">{primaryAction.label}</ActionLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <>
      <section id="get-started" className="lp-section lp-guides" aria-labelledby="lp-cta-title">
        <div className="lp-container lp-cta">
          <div className="lp-gridbg" aria-hidden="true" />
          <div className="lp-cta__body" data-reveal>
            <Kicker>Get Started</Kicker>
            <h2 id="lp-cta-title" className="lp-h1like">Meet Your Crew. <span className="lp-line lp-gradient-text">Inspect Its Record.</span></h2>
            <p>Explore the product preview. Live trading awaits launch validation.</p>
            <div className="lp-actions">
              <ActionLink href="/docs" variant="light">Read the docs</ActionLink>
              <ActionLink href={primaryAction.href}>{primaryAction.label}</ActionLink>
            </div>
          </div>
        </div>
      </section>
      <section className="lp-audience-wrap lp-guides" aria-label="Who HyperHive is for">
        <div className="lp-container lp-audience">
          <article className="lp-audience__card lp-audience__card--owners">
            <img className="lp-audience__bg lp-sketch" src={sketch('position-sizing.png')} alt="" loading="lazy" />
            <span className="lp-audience__icon" aria-hidden="true"><Icon name="move" size={24} /></span>
            <div className="lp-audience__copy">
              <Kicker tone="white">For Account Owners</Kicker>
              <h3>A Dedicated Crew. A Public Record.</h3>
            </div>
          </article>
          <article className="lp-audience__card lp-audience__card--builders">
            <img className="lp-audience__top" src={img('cta-builders.png')} alt="" loading="lazy" />
            <span className="lp-audience__icon" aria-hidden="true"><Icon name="users" size={24} /></span>
            <div className="lp-audience__copy">
              <Kicker tone="white">For Builders &amp; Analysts</Kicker>
              <h3>Trace Every Fill. Check Every Slip.</h3>
              <ActionLink href="/case-study" variant="light">Read the case study</ActionLink>
            </div>
          </article>
        </div>
      </section>
    </>
  );
}

export default function Landing() {
  const root = useRef(null);
  useReveal(root);
  useEffect(() => {
    document.title = 'HyperHive — A Trading Crew For Hyperliquid';
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, []);
  return (
    <div className="lp" ref={root}>
      <a className="lp-skip" href="#main">Skip to content</a>
      <svg className="lp-filters" width="0" height="0" aria-hidden="true" focusable="false">
        <filter id="lp-duotone" colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0.012 0.36 1" />
            <feFuncG type="table" tableValues="0.13 0.75 1" />
            <feFuncB type="table" tableValues="0.11 0.63 1" />
          </feComponentTransfer>
        </filter>
      </svg>
      <SiteHeader notice />
      <main id="main">
        <Hero />
        <RolesStrip />
        <Features />
        <Principle />
        <Architecture />
        <InsideCrew />
        <HowItWorks />
        <Quotes />
        <CaseStudy />
        <Workflow />
        <Ownership />
        <Controls />
        <Metrics />
        <Pricing />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
