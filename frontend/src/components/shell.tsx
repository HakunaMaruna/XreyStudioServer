'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useLang } from '../lib/i18n';
import { clearTokens, isLoggedIn } from '../lib/api';
import { getTheme, applyTheme, type Theme } from '../lib/theme';
import { APP_VERSION } from '../lib/version';
import { Icon, toggleIconSet, type IconName } from './icons';
import { toggleUiMode } from '../lib/ui-mode';
import { Avatar, Badge, IconButton, cn } from './ui';

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
    document.documentElement.dataset.ui = 'aurora';
    setAuthed(isLoggedIn());
    setTheme(getTheme());
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
    setQuery('');
  }, [pathname]);

  const sections: NavSection[] = useMemo(
    () => [
      {
        title: t.overview,
        items: [
          { href: '/dashboard', label: t.dashboard, icon: 'grid' },
          { href: '/reports', label: t.reports, icon: 'gauge' },
          { href: '/alerts', label: t.alerts, icon: 'bell' },
        ],
      },
      {
        title: t.infrastructure,
        items: [
          { href: '/nodes', label: t.nodes, icon: 'server' },
      { href: '/health-checks', label: t.healthChecks, icon: 'pulse' },
          { href: '/inbounds', label: t.inbounds, icon: 'plug' },
          { href: '/hosts', label: t.hosts, icon: 'globe' },
          { href: '/rules', label: t.rules, icon: 'route' },
      { href: '/routing', label: t.routing, icon: 'sliders' },
      { href: '/geodata', label: t.geodata, icon: 'globe' },
        ],
      },
      {
        title: t.access,
        items: [
          { href: '/users', label: t.users, icon: 'users' },
          { href: '/organizations', label: t.organizations, icon: 'shield' },
          { href: '/api-tokens', label: t.apiTokens, icon: 'key' },
      { href: '/config-profiles', label: t.configProfiles, icon: 'sliders' },
      { href: '/doctor', label: t.doctor, icon: 'activity' },
      { href: '/squads', label: t.squads, icon: 'users' },
        ],
      },
      {
        title: t.billing,
        items: [
          { href: '/payments', label: t.payments, icon: 'download' },
          { href: '/plans', label: t.plans, icon: 'list' },
          { href: '/traffic', label: t.traffic, icon: 'activity' },
          { href: '/subscription-templates', label: t.subscriptionTemplates, icon: 'file' },
        ],
      },
      {
        title: t.system,
        items: [
          { href: '/audit', label: t.audit, icon: 'file' },
          { href: '/backups', label: t.backups, icon: 'database' },
          { href: '/help', label: t.docs, icon: 'file' },
          { href: '/settings', label: t.settings, icon: 'settings' },
        ],
      },
    ],
    [t],
  );

  const allItems = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const current = allItems.find((item) => item.href === pathname);
  const results = query.trim()
    ? allItems.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()))
    : [];

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
    <div className="animate-slide-left flex h-full flex-col border-r border-line bg-surface/70 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 border-b border-line px-5">
        <div className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-brand to-brand-2 text-white shadow-[0_6px_20px_-8px_var(--brand)]">
          <Icon name="zap" size={18} className="fill-white/20" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight text-fg">XreyStudio</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-subtle">{t.controlPanel}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">{section.title}</p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all',
                      active
                        ? 'bg-gradient-to-r from-brand/20 via-brand-soft to-transparent font-medium text-brand shadow-[inset_3px_0_0_var(--brand)]'
                        : 'text-muted hover:bg-surface-2 hover:text-fg',
                    )}
                  >
                    {active && <span className="absolute -left-3 h-5 w-0.5 rounded-r-full bg-brand" />}
                    <Icon name={item.icon} size={17} className={active ? 'text-brand' : 'text-subtle group-hover:text-fg'} />
                    {item.label}
                    {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-t border-line p-3">
        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted">{t.systemStatus}</span>
            <Badge tone="success" dot>{t.online}</Badge>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-[10px] text-subtle"><span>{t.backendApi}</span><span className="text-success">{t.healthy}</span></div>
            <div className="flex justify-between text-[10px] text-subtle"><span>{t.version}</span><span>v{APP_VERSION}</span></div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-2.5">
          <Avatar label="AD" size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-fg">{t.administrator}</p>
            <p className="truncate text-[10px] text-subtle">{t.fullAccess}</p>
          </div>
          {authed && <IconButton icon="logout" label="Logout" onClick={logout} />}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-app/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[264px]">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-app/80 px-4 backdrop-blur-xl sm:px-6">
          <IconButton icon="menu" label="Menu" className="lg:hidden" onClick={() => setMobileOpen(true)} />

          <div className="hidden items-center gap-2 text-sm sm:flex">
            <span className="text-subtle">{t.workspace}</span>
            <Icon name="chevronRight" size={13} className="text-subtle" />
            <span className="font-medium text-fg">{current?.label ?? 'Dashboard'}</span>
          </div>

          <div className="relative ml-auto w-full max-w-[260px]">
            <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              aria-label={t.searchPages}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              placeholder={t.searchPages}
              className="field pl-9 pr-8"
            />
            <kbd className="mono pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line bg-surface-3 px-1.5 py-0.5 text-[11px] text-subtle">/</kbd>
            {searchOpen && query.trim() && (
              <div className="panel absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden p-1.5">
                {results.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted">{t.noPagesFound}</p>
                ) : (
                  results.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-muted hover:bg-surface-2 hover:text-fg"
                    >
                      <Icon name={item.icon} size={15} className="text-brand" />
                      {item.label}
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="hidden h-5 w-px bg-line md:block" />
          <div className="hidden items-center gap-2 md:flex">
            <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_8px_var(--success)]" />
            <span className="text-[11px] text-muted">{t.allSystemsOperational}</span>
          </div>
          <button
            onClick={toggle}
            className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:text-fg"
          >
            {lang.toUpperCase()}
          </button>
          <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label="Toggle theme" onClick={switchTheme} />
          <IconButton icon="sparkles" label="Toggle icon set" onClick={toggleIconSet} />
          <IconButton icon="grid" label={t.switchToAdminLte} onClick={toggleUiMode} />
        </header>

        <main id="main-content" className="relative z-10 mx-auto max-w-[1600px] px-4 py-7 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
