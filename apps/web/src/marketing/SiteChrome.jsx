import React, {useEffect, useId, useState} from 'react';
import {Icon} from './LandingIcons';
import '../dashboard/brand-fonts.css';
import {useFlags} from '../flags';
import './site-chrome.css';

export const primaryAction = {label: 'Get started', href: '/dashboard'};

const navLinks = [
  ['Demo', '/demo'],
  ['How it works', '/#how-it-works'],
  ['Technology', '/#features'],
  ['Docs', '/docs'],
  ['Roadmap', '/roadmap'],
];

const footerColumns = [
  ['Explore', [['1-minute demo', '/demo'], ['How it works', '/#how-it-works'], ['Technology', '/#features'], ['Process case study', '/case-study'], ['Pricing', '/#pricing']]],
  ['HyperHive', [['Docs', '/docs'], ['Roadmap', '/roadmap'], ['FAQ', '/faq'], ['Workspace', '/dashboard']]],
  ['Resources', [['Risks & limits', '/risks'], ['Preview terms', '/terms'], ['Privacy', '/privacy']]],
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

export function SiteHeader({notice = false}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const path = currentPath();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === 'Escape') setOpen(false); };
    const onResize = () => { if (window.innerWidth > 1099) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
  }, [open]);

  const {walkthrough} = useFlags();
  const links = navLinks.filter(([, href]) => walkthrough || href !== '/demo').map(([label, href]) => (
    <a key={href} href={href} aria-current={href === path ? 'page' : undefined} onClick={() => setOpen(false)}>{label}</a>
  ));

  return (
    <>
      {notice && (
        <div className="site-notice">
          <span className="site-notice__dot" aria-hidden="true" />
          <span>Meet HyperHive</span>
          <span className="site-notice__dot" aria-hidden="true" />
          <a href="/#features">Explore the crew</a>
          <span className="site-notice__dot" aria-hidden="true" />
        </div>
      )}
      <header className="site-header">
        <div className="site-header__inner">
          <nav className="site-header__nav" aria-label="Main">{links}</nav>
          <Logo />
          <div className="site-header__end">
            <span className="site-status"><span className="site-status__dot" aria-hidden="true" />Product preview</span>
            <ActionLink href={primaryAction.href}>{primaryAction.label}</ActionLink>
          </div>
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
          <span className="site-status"><span className="site-status__dot" aria-hidden="true" />Product preview</span>
        </div>
      </header>
    </>
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
