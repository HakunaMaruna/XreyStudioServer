// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../lib/i18n';
import { api, clearTokens, isLoggedIn } from '../lib/api';
import { getTheme, applyTheme, type Theme } from '../lib/theme';
import { APP_VERSION } from '../lib/version';
import { Icon, toggleIconSet, type IconName } from './icons';
import { Avatar, Badge, IconButton, cn } from './ui';

type NavItem = { href: string; label: string; icon: IconName };
// Сворачиваемая подгруппа внутри секции (максимум 2 уровня).
type NavGroup = { key: string; title: string; icon: IconName; items: NavItem[] };
type NavEntry = NavItem | NavGroup;
type NavSection = { title: string; items: NavEntry[] };

const isNavGroup = (entry: NavEntry): entry is NavGroup => 'items' in entry;

const NAV_GROUPS_STORAGE_KEY = 'xss_nav_groups';

const flattenNav = (entries: NavEntry[]): NavItem[] =>
  entries.flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry]));

export default function Shell({ children }: { children: React.ReactNode }) {
  const { t, lang, toggle } = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>('dark');
  const [authed, setAuthed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [controlMode, setControlMode] = useState(false);
  // Состояние свёрнутости подгрупп (явный выбор пользователя, перекрывает автораскрытие).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAuthed(isLoggedIn());
    setTheme(getTheme());
    if (isLoggedIn()) {
      api.get<{ mode: string }>('/api/dns/status')
        .then((status) => setControlMode(status.mode === 'control'))
        .catch(() => setControlMode(false));
    }
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
    setQuery('');
  }, [pathname]);

  // Гидрируем сохранённое состояние групп после монтирования (SSR рендерит дефолт).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(NAV_GROUPS_STORAGE_KEY);
      if (raw) setOpenGroups(JSON.parse(raw));
    } catch {
      // повреждённое/недоступное хранилище — игнорируем
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.body.classList.add('ui-scroll-locked');
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('ui-scroll-locked');
      window.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen]);

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
          {
            key: 'nodesChains',
            title: t.navGroupNodes,
            icon: 'server',
            items: [
              { href: '/nodes', label: t.nodes, icon: 'server' },
              { href: '/chains', label: t.chains, icon: 'route' },
              { href: '/wizard', label: t.wizard, icon: 'plus' },
              { href: '/health-checks', label: t.healthChecks, icon: 'pulse' },
              { href: '/reverse', label: t.reverse, icon: 'network' },
            ],
          },
          {
            key: 'inboundsHosts',
            title: t.navGroupInbounds,
            icon: 'plug',
            items: [
              { href: '/inbounds', label: t.inbounds, icon: 'plug' },
              { href: '/hosts', label: t.hosts, icon: 'globe' },
            ],
          },
          {
            key: 'routing',
            title: t.navGroupRouting,
            icon: 'sliders',
            items: [
              { href: '/rules', label: t.rules, icon: 'route' },
              { href: '/routing', label: t.routing, icon: 'sliders' },
              { href: '/balancers', label: t.balancers, icon: 'zap' },
              { href: '/geodata', label: t.geodata, icon: 'globe' },
            ],
          },
          {
            key: 'dns',
            title: t.navGroupDns,
            icon: 'network',
            items: [
              ...(controlMode ? [{ href: '/dns', label: t.dnsSection, icon: 'network' as IconName }] : []),
              { href: '/dns-profiles', label: t.dnsProfiles, icon: 'globe' },
            ],
          },
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
          { href: '/subscription-page', label: t.subAdmin, icon: 'eye' },
        ],
      },
      {
        title: t.system,
        items: [
          { href: '/audit', label: t.audit, icon: 'file' },
          { href: '/backups', label: t.backups, icon: 'database' },
          { href: '/plugins', label: t.plugins, icon: 'box' },
          { href: '/telemetry', label: t.telemetry, icon: 'activity' },
          { href: '/help', label: t.docs, icon: 'file' },
          { href: '/settings', label: t.settings, icon: 'settings' },
        ],
      },
    ],
    [t, controlMode],
  );

  const allItems = useMemo(() => sections.flatMap((section) => flattenNav(section.items)), [sections]);
  const current = allItems.find((item) => item.href === pathname);
  const results = query.trim()
    ? allItems.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()))
    : [];

  const toggleGroup = (key: string, currentlyOpen: boolean) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: !currentlyOpen };
      try {
        localStorage.setItem(NAV_GROUPS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // недоступное хранилище — состояние живёт только в памяти
      }
      return next;
    });
  };

  const renderNavLink = (item: NavItem) => {
    const active = pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors',
          active
            ? 'bg-brand/10 font-medium text-brand'
            : 'text-muted hover:bg-surface-2 hover:text-fg',
        )}
      >
        <Icon name={item.icon} size={16} className={active ? 'text-brand' : 'text-subtle group-hover:text-fg'} />
        {item.label}
      </Link>
    );
  };

  const renderNavGroup = (group: NavGroup) => {
    const containsActive = group.items.some((item) => item.href === pathname);
    // Явный выбор пользователя перекрывает автораскрытие активной группы.
    const open = openGroups[group.key] ?? containsActive;
    const groupId = `nav-group-${group.key}`;
    return (
      <div key={group.key}>
        <button
          type="button"
          onClick={() => toggleGroup(group.key, open)}
          aria-expanded={open}
          aria-controls={groupId}
          className={cn(
            'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors',
            open || containsActive ? 'text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
          )}
        >
          <Icon name={group.icon} size={16} className={containsActive ? 'text-brand' : 'text-subtle group-hover:text-fg'} />
          <span className="flex-1 truncate text-left">{group.title}</span>
          <Icon name="chevronDown" size={14} className={cn('shrink-0 text-subtle transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div id={groupId} role="group" aria-label={group.title} className="ml-3 mt-0.5 space-y-0.5 border-l border-line pl-2">
            {group.items.map(renderNavLink)}
          </div>
        )}
      </div>
    );
  };

  if (pathname === '/login' || pathname.startsWith('/sub/')) return <>{children}</>;

  const switchTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  const logout = async () => {
    // Revoke both tokens server-side before dropping them locally. A failed
    // request must not keep the user trapped in the UI.
    try {
      await api.post('/api/auth/logout', {
        refreshToken: localStorage.getItem('xss_refresh') || '',
        accessToken: localStorage.getItem('xss_access') || '',
      });
    } catch {
      // offline / expired session — local logout still proceeds
    }
    clearTokens();
    setAuthed(false);
    router.push('/login');
  };

  const sidebar = (
    <div className="animate-slide-left flex h-full flex-col border-r border-line bg-surface">
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white">
          <Icon name="zap" size={16} />
        </div>
        <div className="leading-tight">
          <p className="text-[13px] font-semibold text-fg">XreyStudio</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-subtle">{t.controlPanel}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-3">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">{section.title}</p>
            <div className="space-y-0.5">
              {section.items.map((entry) => (isNavGroup(entry) ? renderNavGroup(entry) : renderNavLink(entry)))}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-2 border-t border-line p-2.5">
        <div className="rounded-lg border border-line bg-surface-2 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted">{t.systemStatus}</span>
            <Badge tone="success" dot>{t.online}</Badge>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-[10px] text-subtle"><span>{t.backendApi}</span><span className="text-success">{t.healthy}</span></div>
            <div className="flex justify-between text-[10px] text-subtle"><span>{t.version}</span><span>v{APP_VERSION}</span></div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 p-2">
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
      <aside className="fixed inset-y-0 left-0 z-sidebar hidden w-[var(--ui-sidebar-w)] lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-overlay lg:hidden" role="dialog" aria-modal="true" aria-label={t.controlPanel}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[var(--ui-sidebar-w-mobile)]">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-[var(--ui-sidebar-w)]">
        <header className="ui-safe-top sticky top-0 z-sticky flex min-h-14 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
          <IconButton icon="menu" label="Menu" className="lg:hidden" onClick={() => setMobileOpen(true)} />

          <div className="hidden items-center gap-2 text-sm sm:flex">
            <span className="text-subtle">{t.workspace}</span>
            <Icon name="chevronRight" size={13} className="text-subtle" />
            <span className="font-medium text-fg">{current?.label ?? 'Dashboard'}</span>
          </div>

          <div className="relative ml-auto w-full max-w-[260px] max-sm:w-auto max-sm:max-w-none max-sm:flex-1">
            <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              ref={searchRef}
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
              <div className="panel absolute left-0 right-0 top-full z-dropdown mt-2 max-h-[60dvh] overflow-y-auto p-1.5">
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
        </header>

        <main id="main-content" className="relative z-content mx-auto w-full max-w-[var(--ui-content-max)] px-4 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-5">{children}</main>
      </div>
    </div>
  );
}
