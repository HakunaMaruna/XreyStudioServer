'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useLang } from '../lib/i18n';
import { clearTokens, isLoggedIn } from '../lib/api';
import { getTheme, applyTheme, type Theme } from '../lib/theme';
import { APP_VERSION } from '../lib/version';
import { Icon, type IconName } from './icons';
import { cn } from './ui';

type NavItem = { href: string; label: string; icon: IconName };
type NavSection = { title: string; items: NavItem[] };

export default function Shell({ children }: { children: React.ReactNode }) {
  const { t, lang, toggle } = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>('dark');
  const [authed, setAuthed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    setAuthed(isLoggedIn());
    setTheme(getTheme());
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
    setQuery('');
  }, [pathname]);

  const sections: NavSection[] = useMemo(() => [
    { title: t.overview, items: [
      { href: '/dashboard', label: t.dashboard, icon: 'grid' },
      { href: '/reports', label: t.reports, icon: 'gauge' },
      { href: '/alerts', label: t.alerts, icon: 'bell' },
    ] },
    { title: t.infrastructure, items: [
      { href: '/nodes', label: t.nodes, icon: 'server' },
      { href: '/inbounds', label: t.inbounds, icon: 'plug' },
      { href: '/hosts', label: t.hosts, icon: 'globe' },
      { href: '/rules', label: t.rules, icon: 'route' },
    ] },
    { title: t.access, items: [
      { href: '/users', label: t.users, icon: 'users' },
      { href: '/organizations', label: t.organizations, icon: 'shield' },
    ] },
    { title: t.billing, items: [
      { href: '/payments', label: t.payments, icon: 'download' },
      { href: '/plans', label: t.plans, icon: 'list' },
      { href: '/traffic', label: t.traffic, icon: 'activity' },
    ] },
    { title: t.system, items: [
      { href: '/audit', label: t.audit, icon: 'file' },
      { href: '/backups', label: t.backups, icon: 'database' },
      { href: '/settings', label: t.settings, icon: 'settings' },
    ] },
  ], [t]);

  const allItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const current = allItems.find((item) => item.href === pathname);
  const results = query.trim() ? allItems.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())) : [];

  if (pathname === '/login' || pathname.startsWith('/sub/')) return <>{children}</>;

  const switchTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  const logout = () => {
    clearTokens();
    setAuthed(false);
    router.push('/login');
  };

  const sidebar = (
    <aside className="navbar navbar-vertical navbar-expand-lg navbar-dark">
      <div className="container-fluid">
        <button type="button" className="navbar-toggler d-lg-none" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <Icon name="close" size={18} />
        </button>
        <Link href="/dashboard" className="navbar-brand navbar-brand-autodark d-flex align-items-center gap-2">
          <span className="avatar text-white" style={{ background: 'var(--brand)' }}><Icon name="zap" size={18} /></span>
          <span>
            <strong>XreyStudio</strong>
            <span className="d-block text-muted" style={{ fontSize: 10, letterSpacing: '.16em' }}>CONTROL PANEL</span>
          </span>
        </Link>

        <div className="collapse navbar-collapse show" id="sidebar-menu">
          <ul className="navbar-nav pt-lg-3">
            {sections.map((section) => (
              <li key={section.title} className="nav-item">
                <span className="nav-link nav-link-title text-uppercase text-muted small mt-3 mb-1">{section.title}</span>
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn('nav-link', pathname === item.href && 'active')}
                  >
                    <span className="nav-link-icon d-md-none d-lg-inline-block"><Icon name={item.icon} size={16} /></span>
                    <span className="nav-link-title">{item.label}</span>
                  </Link>
                ))}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-auto border-top pt-3 pb-3">
          <div className="d-flex align-items-center gap-2 text-muted small mb-2">
            <span className="status-dot status-dot-animated bg-success" />
            <span>{t.systemStatus}</span>
            <span className="ms-auto">{t.version} {APP_VERSION}</span>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="avatar avatar-sm text-primary" style={{ background: 'var(--brand-soft)' }}>AD</span>
            <div className="small lh-sm">
              <div className="text-fg">{t.administrator}</div>
              <div className="text-muted">{t.fullAccess}</div>
            </div>
            {authed && <button className="btn btn-sm btn-ghost ms-auto" onClick={logout} title={t.logout}><Icon name="logout" size={15} /></button>}
          </div>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="page">
      <div className="d-lg-none d-flex align-items-center justify-content-between p-3 border-bottom" style={{ background: 'var(--surface)' }}>
        <button className="btn btn-outline-secondary" onClick={() => setMobileOpen(!mobileOpen)}><Icon name="menu" size={17} /> {t.system}</button>
        <Link href="/dashboard" className="navbar-brand">XreyStudio</Link>
      </div>

      {mobileOpen && <div className="position-fixed top-0 start-0 w-100 h-100" style={{ zIndex: 1030, background: 'rgba(0,0,0,.5)' }} onClick={() => setMobileOpen(false)}><div onClick={(e) => e.stopPropagation()} className="h-100" style={{ width: 260 }}>{sidebar}</div></div>}
      <div className="d-none d-lg-block position-fixed top-0 start-0 h-100" style={{ width: 248, zIndex: 1029 }}>{sidebar}</div>

      <div className="page-wrapper" style={{ paddingLeft: 248 }}>
        <header className="navbar navbar-expand-md d-none d-lg-flex">
          <div className="container-xl">
            <div className="navbar-nav flex-row align-items-center ms-auto gap-2">
              <div className="position-relative" style={{ width: 260 }}>
                <Icon name="search" size={15} className="position-absolute top-50 start-0 translate-middle-y ms-3 text-muted" />
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                  placeholder={t.searchPages}
                  className="form-control ps-5"
                />
                {searchOpen && query.trim() && (
                  <div className="card position-absolute top-100 start-0 end-0 mt-1 p-1" style={{ zIndex: 1050 }}>
                    {results.length === 0 ? <p className="text-muted small p-2 mb-0">{t.noPagesFound}</p> : results.map((item) => (
                      <Link key={item.href} href={item.href} className="d-flex align-items-center gap-2 p-2 text-decoration-none text-muted rounded">
                        <Icon name={item.icon} size={15} className="text-primary" />{item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-muted small ms-3">{t.workspace} / <span className="text-fg">{current?.label || t.dashboard}</span></span>
              <button className="btn btn-sm btn-outline-secondary" onClick={toggle}>{lang.toUpperCase()}</button>
              <button className="btn btn-sm btn-outline-secondary" onClick={switchTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} /></button>
            </div>
          </div>
        </header>

        <main className="container-xl">
          <div className="page-body">{children}</div>
          <footer className="footer footer-transparent d-print-none mt-5">
            <div className="container-xl text-center text-muted small">XreyStudioServer · v{APP_VERSION}</div>
          </footer>
        </main>
      </div>
    </div>
  );
}
