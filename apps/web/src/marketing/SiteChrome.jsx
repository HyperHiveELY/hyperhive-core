import React, {useEffect, useId, useState} from 'react';
import {Icon} from './LandingIcons';
import '../dashboard/brand-fonts.css';
import {useFlags} from '../flags';
import {TokenCa} from '../TokenCa';
import './site-chrome.css';

export const primaryAction = {label: 'Get started', href: '/dashboard'};

const navLinks = [
  ['Demo', '/demo'],
  ['How it works', '/#how-it-works'],
  ['Technology', '/#features'],
  ['Docs', '/docs'],
  ['Whitepaper', '/whitepaper'],
  ['Roadmap', '/roadmap'],
];

const footerColumns = [
  ['Explore', [['1-minute demo', '/demo'], ['How it works', '/#how-it-works'], ['Technology', '/#features'], ['Process case study', '/case-study'], ['Pricing', '/#pricing']]],
  ['HyperHive', [['Docs', '/docs'], ['Whitepaper', '/whitepaper'], ['Roadmap', '/roadmap'], ['FAQ', '/faq'], ['Workspace', '/dashboard']]],
  ['Resources', [['Risks & limits', '/risks'], ['Trading terms', '/terms'], ['Privacy', '/privacy']]],
];

const currentPath = () => (typeof location === 'undefined' ? '/' : location.pathname.replace(/\/+$/, '') || '/');

export function Logo({light = false}) {
  return (
    <a className={'site-logo' + (light ? ' site-logo--light' : '')} href="/">
      <span className="site-logo__mark" aria-hidden="true" />
      <span className="site-logo__name">HyperHive</span>
    </a>
  );
}

export function ActionLink({href, children, variant = 'primary', className = '', ...props}) {
  return (
    <a className={`site-btn site-btn--${variant} ${className}`} href={href} {...props}>
      <span className="site-btn__dot" aria-hidden="true" />
      {children}
    </a>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const path = currentPath();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === 'Escape') setOpen(false); };
    const onResize = () => { if (window.innerWidth > 1279) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
  }, [open]);

  const {walkthrough} = useFlags();
  const links = navLinks.filter(([, href]) => walkthrough || href !== '/demo').map(([label, href]) => (
    <a key={href} href={href} aria-current={href === path ? 'page' : undefined} onClick={() => setOpen(false)}>{label}</a>
  ));
  // Split the links either side of the centred logo, the larger half on the left.
  const half = Math.ceil(links.length / 2);

  return (
    <header className="site-header">
        <div className="site-header__inner">
          <div className="site-header__start">
            <TokenCa className="site-header__ca" label="$HIVE CA" />
            <nav className="site-header__nav" aria-label="Main">{links.slice(0, half)}</nav>
          </div>
          <Logo />
          <div className="site-header__end">
            <nav className="site-header__nav" aria-label="More">{links.slice(half)}</nav>
            <ActionLink href={primaryAction.href} className="site-btn--small">{primaryAction.label}</ActionLink>
          </div>
          <TokenCa className="site-header__mobile-ca" label="CA" />
          <button
            type="button"
            className="site-header__toggle"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen(value => !value)}
          >
            <Icon name={open ? 'close' : 'menu'} size={26} strokeWidth={2} />
            <span className="site-sr">{open ? 'Close menu' : 'Open menu'}</span>
          </button>
        </div>
        <div id={menuId} className="site-menu" hidden={!open}>
          <nav aria-label="Mobile">{links}</nav>
          <ActionLink href={primaryAction.href} onClick={() => setOpen(false)}>{primaryAction.label}</ActionLink>
        </div>
    </header>
  );
}

export function SiteFooter() {
  const {walkthrough} = useFlags();
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <Logo light />
          <p>Explore your crew workspace</p>
          <a className="site-footer__cta" href={primaryAction.href}>
            <span>Your crew starts here</span>{' '}
            <span className="site-footer__cta-btn">{primaryAction.label}</span>
          </a>
        </div>
        <div className="site-footer__columns">
          {footerColumns.map(([title, all]) => [title, all.filter(([, href]) => walkthrough || href !== '/demo')]).map(([title, links]) => (
            <nav key={title} aria-label={title}>
              <h2>{title}</h2>
              <ul>{links.map(([label, href]) => <li key={href}><a href={href}>{label}</a></li>)}</ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="site-footer__bottom">
        <p>© {new Date().getFullYear()} HyperHive. All rights reserved</p>
        <p className="site-footer__legal">Built on Hyperliquid’s public API. HyperHive is independent software, not affiliated with or endorsed by Hyperliquid. Not financial advice.</p>
      </div>
    </footer>
  );
}
