'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { DashboardLayout, type MenuNode } from '@adminlte/react';
import { useLang } from '../lib/i18n';
import { toggleUiMode } from '../lib/ui-mode';
import type { IconName } from './icons';

const bi: Record<IconName, string> = {
  grid: 'bi-grid-1x2-fill', users: 'bi-people-fill', server: 'bi-hdd-rack', plug: 'bi-plug-fill',
  globe: 'bi-globe2', route: 'bi-signpost-split', bell: 'bi-bell-fill', settings: 'bi-gear-fill',
  search: 'bi-search', sun: 'bi-brightness-high-fill', moon: 'bi-moon-stars-fill', logout: 'bi-box-arrow-right',
  menu: 'bi-list', close: 'bi-x-lg', plus: 'bi-plus-lg', edit: 'bi-pencil-square', trash: 'bi-trash',
  refresh: 'bi-arrow-clockwise', history: 'bi-clock-history', play: 'bi-play-fill', check: 'bi-check2',
  chevronLeft: 'bi-chevron-left', chevronRight: 'bi-chevron-right', chevronDown: 'bi-chevron-down',
  copy: 'bi-copy', external: 'bi-box-arrow-up-right', key: 'bi-key-fill', activity: 'bi-activity',
  cpu: 'bi-cpu-fill', memory: 'bi-memory', network: 'bi-diagram-3-fill', arrowUpRight: 'bi-arrow-up-right',
  zap: 'bi-lightning-charge-fill', shield: 'bi-shield-check', database: 'bi-database-fill',
  terminal: 'bi-terminal-fill', code: 'bi-code-slash', filter: 'bi-funnel-fill', info: 'bi-info-circle-fill',
  alert: 'bi-exclamation-triangle-fill', clock: 'bi-clock-fill', link: 'bi-link-45deg',
  download: 'bi-download', upload: 'bi-upload', power: 'bi-power', lock: 'bi-lock-fill',
  eye: 'bi-eye-fill', sparkles: 'bi-stars', gauge: 'bi-speedometer2', list: 'bi-list-ul',
  box: 'bi-box-seam', pulse: 'bi-heart-pulse-fill', checkCircle: 'bi-check-circle-fill',
  xCircle: 'bi-x-circle-fill', file: 'bi-file-earmark-fill', sliders: 'bi-sliders2',
  command: 'bi-command', fingerprint: 'bi-fingerprint',
};

const item = (text: string, href: string, icon: IconName): MenuNode => ({
  type: 'item', text, href, icon: bi[icon],
});

export default function AdminLiteShell({ children }: { children: ReactNode }) {
  const { t, lang } = useLang();

  const menu: MenuNode[] = [
    { type: 'header', text: t.overview },
    item(t.dashboard, '/dashboard', 'grid'),
    item(t.reports, '/reports', 'activity'),
    item(t.alerts, '/alerts', 'bell'),
    { type: 'header', text: t.infrastructure },
    item(t.nodes, '/nodes', 'server'),
    item(t.healthChecks, '/health-checks', 'pulse'),
    item(t.inbounds, '/inbounds', 'plug'),
    item(t.hosts, '/hosts', 'globe'),
    item(t.rules, '/rules', 'route'),
    item(t.routing, '/routing', 'sliders'),
    item(t.traffic, '/traffic', 'gauge'),
    { type: 'header', text: t.access },
    item(t.users, '/users', 'users'),
    item(t.squads, '/squads', 'fingerprint'),
    item(t.configProfiles, '/config-profiles', 'command'),
    item(t.organizations, '/organizations', 'shield'),
    item(t.audit, '/audit', 'list'),
    { type: 'header', text: t.billing },
    item(t.payments, '/payments', 'download'),
    item(t.plans, '/plans', 'file'),
    item(t.subscriptionTemplates, '/subscription-templates', 'sparkles'),
    { type: 'header', text: t.system },
    item(t.backups, '/backups', 'database'),
    item(t.docs, '/help', 'file'),
    item(t.settings, '/settings', 'settings'),
  ];

  const avatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' rx='8' fill='%238b7cff'/%3E%3C/svg%3E";

  return (
    <>
      <link rel="stylesheet" href="/vendor/adminlte.css" />
      <link rel="stylesheet" href="/vendor/bootstrap-icons/bootstrap-icons.css" />
      <Script src="/vendor/bootstrap.bundle.min.js" strategy="afterInteractive" />
      <DashboardLayout
        menuItems={menu}
        logo={<>Xrey<b>Studio</b></>}
        logoHref="/dashboard"
        sidebarTheme="dark"
        colorModeToggle
        initialColorMode="dark"
        fixedHeader
        fixedSidebar
        docsHref="/help"
        docsLabel={t.docs}
        user={{ name: t.administrator, image: avatar, role: t.fullAccess }}
        linkComponent={Link}
        topbarEnd={
          <button className="btn btn-sm btn-outline-light" onClick={toggleUiMode} title="Switch UI">
            <i className="bi bi-stars me-1" /> Aurora
          </button>
        }
      >
        <div className="app-content">
          <div className="container-fluid px-3 py-3">{children}</div>
        </div>
      </DashboardLayout>
    </>
  );
}
