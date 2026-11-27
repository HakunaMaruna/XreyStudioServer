// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { lazyChart } from '../../components/lazy-chart';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, Field, HelpButton, PageHeader, Segmented, formatBytes } from '../../components/ui';

const Area = lazyChart('Area');
const AreaChart = lazyChart('AreaChart');
const CartesianGrid = lazyChart('CartesianGrid');
const ResponsiveContainer = lazyChart('ResponsiveContainer');
const Tooltip = lazyChart('Tooltip');
const XAxis = lazyChart('XAxis');
const YAxis = lazyChart('YAxis');

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  users: number;
  activeUsers: number;
  nodes: number;
  onlineNodes: number;
  bytesUp: string;
  bytesDown: string;
  total: string;
};

type ProtocolRow = {
  protocol: string;
  inbounds: number;
  enabled: number;
  users: number;
  nodes: number;
};

type Tab = 'traffic' | 'cheburcheck' | 'organizations' | 'protocols';
type TrafficRow = { date: string; bytesUp: string; bytesDown: string; total: string };
type TrafficSummary = { bytesUp: string; bytesDown: string; total: string; previousTotal: string; changePct: number | null };
type ChebRow = {
  id: string; createdAt: string; nodeId: string | null; nodeName: string | null;
  target: string; targetType: string | null; blocked: boolean; verdict: string | null; probes: number;
};

type TrafficReport = {
  data: TrafficRow[];
  summary: TrafficSummary;
  topUsers: Array<{ userId: string; email: string; bytes: string }>;
  range: { from: string; to: string; days: number };
};

const chartTooltip = {
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  fontSize: 11,
  color: 'var(--fg)',
};

export default function ReportsPage() {
  const { t, lang } = useLang();
  const [tab, setTab] = useState<Tab>('traffic');
  const [trafficDays, setTrafficDays] = useState(30);
  const [traffic, setTraffic] = useState<TrafficReport | null>(null);
  const [cheb, setCheb] = useState<ChebRow[]>([]);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [protocols, setProtocols] = useState<ProtocolRow[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const query = () => {
    const params = new URLSearchParams();
    if (tab === 'traffic' && !from && !to) params.set('days', String(trafficDays));
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return params.toString();
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [trafficData, chebData, orgData, protocolData] = await Promise.all([
        api.get<TrafficReport>(`/api/reports/traffic/timeseries?${query()}`),
        api.get<{ data: ChebRow[] }>(`/api/reports/cheburcheck?${query()}`),
        api.get(`/api/reports/organizations?${query()}`),
        api.get('/api/reports/protocols'),
      ]);
      setTraffic(trafficData);
      setCheb(chebData.data || []);
      setOrgs(orgData.data || []);
      setProtocols(protocolData.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, tab, trafficDays]);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    load();
  }, [load]);

  const exportCsv = async () => {
    try {
      if (tab === 'traffic') {
        await api.download(`/api/reports/traffic/timeseries.csv?${query()}`, 'traffic-timeseries.csv');
      } else if (tab === 'cheburcheck') {
        await api.download(`/api/reports/cheburcheck.csv?${query()}`, 'cheburcheck.csv');
      } else if (tab === 'organizations') {
        await api.download(`/api/reports/organizations.csv?${query()}`, 'organizations.csv');
      } else {
        await api.download('/api/reports/protocols.csv', 'protocols.csv');
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const orgColumns = useMemo<ColumnDef<OrgRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t.organizations,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-2 text-brand"><Icon name="shield" size={15} /></div>
            <div>
              <p className="font-medium text-fg">{row.original.name === 'No organization' ? t.noOrganization : row.original.name}</p>
              <p className="mono text-[10px] text-subtle">{row.original.slug}</p>
            </div>
          </div>
        ),
      },
      { accessorKey: 'users', header: t.users, cell: ({ row }) => <span className="text-fg tabular-nums">{row.original.users}</span> },
      { accessorKey: 'activeUsers', header: t.activeUsers, cell: ({ row }) => <span className="text-success tabular-nums">{row.original.activeUsers}</span> },
      { accessorKey: 'nodes', header: t.nodes, cell: ({ row }) => <span className="text-fg tabular-nums">{row.original.nodes}</span> },
      { accessorKey: 'onlineNodes', header: t.onlineNodes, cell: ({ row }) => <span className="text-success tabular-nums">{row.original.onlineNodes}</span> },
      { accessorKey: 'total', header: t.trafficUsed, cell: ({ row }) => <Badge tone="brand">{formatBytes(row.original.total)}</Badge> },
    ],
    [t],
  );

  const protocolColumns = useMemo<ColumnDef<ProtocolRow>[]>(
    () => [
      {
        accessorKey: 'protocol',
        header: t.protocol,
        cell: ({ row }) => <Badge tone="cyan">{row.original.protocol.toUpperCase()}</Badge>,
      },
      { accessorKey: 'inbounds', header: t.inbounds, cell: ({ row }) => <span className="text-fg tabular-nums">{row.original.inbounds}</span> },
      { accessorKey: 'enabled', header: t.enabled, cell: ({ row }) => <span className="text-success tabular-nums">{row.original.enabled}</span> },
      { accessorKey: 'users', header: t.users, cell: ({ row }) => <span className="text-fg tabular-nums">{row.original.users}</span> },
      { accessorKey: 'nodes', header: t.nodes, cell: ({ row }) => <span className="text-fg tabular-nums">{row.original.nodes}</span> },
    ],
    [t],
  );

  const chebColumns = useMemo<ColumnDef<ChebRow>[]>(
    () => [
      { accessorKey: 'createdAt', header: t.createdAt, cell: ({ row }) => <span className="text-xs text-muted">{new Date(row.original.createdAt).toLocaleString()}</span> },
      { accessorKey: 'target', header: t.cheburcheckTarget, cell: ({ row }) => <span className="mono text-xs text-fg">{row.original.target}</span> },
      { accessorKey: 'nodeName', header: t.nodes, cell: ({ row }) => <span className="text-xs text-muted">{row.original.nodeName || '—'}</span> },
      { accessorKey: 'verdict', header: t.cheburcheckVerdict, cell: ({ row }) => <Badge tone={row.original.blocked ? 'danger' : 'success'}>{row.original.verdict || '—'}</Badge> },
      { accessorKey: 'probes', header: t.cheburcheckProbes, cell: ({ row }) => <span className="text-xs text-fg tabular-nums">{row.original.probes}</span> },
    ],
    [t],
  );

  return (
    <>
      <PageHeader
        eyebrow={t.overview}
        title={t.reports}
        subtitle={t.reportsSubtitle}
        icon="gauge"
        actions={
          <>
            <HelpButton title={t.help}><p>{lang === 'ru' ? 'Динамика трафика показывает суточные объёмы и сравнение с прошлым периодом. CSV экспортируется с теми же фильтрами, что и экран. Отчёты доступны только администратору.' : 'Traffic dynamics shows daily volumes and a previous-period comparison. CSV uses the same filters as the screen. Reports are admin-only.'}</p></HelpButton>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'traffic', label: t.trafficDynamics, icon: 'activity' },
                { value: 'cheburcheck', label: t.cheburcheck, icon: 'shield' },
                { value: 'organizations', label: t.byOrganization, icon: 'shield' },
                { value: 'protocols', label: t.byProtocol, icon: 'plug' },
              ]}
            />
            <Button icon="download" onClick={exportCsv}>{t.exportCsv}</Button>
          </>
        }
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      {tab === 'traffic' && (
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {[7, 30, 90].map((days) => (
              <Button
                key={days}
                size="sm"
                variant={!from && !to && trafficDays === days ? 'primary' : 'subtle'}
                onClick={() => { setTrafficDays(days); setFrom(''); setTo(''); }}
              >
                {days === 7 ? t.last7Days : days === 30 ? t.last30Days : t.last90Days}
              </Button>
            ))}
            <span className="mx-1 h-5 w-px bg-line" />
            <Field label={t.from}><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="field w-auto" /></Field>
            <Field label={t.to}><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="field w-auto" /></Field>
            <Badge tone="neutral">{traffic?.range?.days ?? trafficDays} {t.periodDays}</Badge>
          </div>
        </Card>
      )}

      {tab === 'traffic' && !traffic && loading && (
        <Card className="py-20 text-center text-xs text-muted">{t.loading}</Card>
      )}
      {tab === 'traffic' && traffic && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="p-3.5">
              <p className="text-[11px] text-subtle">{t.trafficUsed}</p>
              <p className="mt-2 text-lg font-semibold leading-none text-fg tabular-nums">{formatBytes(traffic.summary.total)}</p>
              <p className="mt-1.5 text-[10px] text-muted">{t.periodDays}: {traffic.range.days}</p>
            </Card>
            <Card className="p-3.5">
              <p className="text-[11px] text-subtle">{t.bytesUp}</p>
              <p className="mt-2 text-lg font-semibold leading-none text-brand tabular-nums">{formatBytes(traffic.summary.bytesUp)}</p>
            </Card>
            <Card className="p-3.5">
              <p className="text-[11px] text-subtle">{t.bytesDown}</p>
              <p className="mt-2 text-lg font-semibold leading-none text-cyan tabular-nums">{formatBytes(traffic.summary.bytesDown)}</p>
            </Card>
            <Card className="p-3.5">
              <p className="text-[11px] text-subtle">{t.change}</p>
              <p className={`mt-2 text-lg font-semibold leading-none tabular-nums ${traffic.summary.changePct === null ? 'text-muted' : traffic.summary.changePct >= 0 ? 'text-success' : 'text-danger'}`}>
                {traffic.summary.changePct === null ? '—' : `${traffic.summary.changePct > 0 ? '+' : ''}${traffic.summary.changePct}%`}
              </p>
              <p className="mt-1.5 text-[10px] text-muted">{t.previousPeriod}: {formatBytes(traffic.summary.previousTotal)}</p>
            </Card>
          </div>

          <Card className="mb-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-fg">{t.trafficDynamics}</h2>
                <p className="text-xs text-muted">{traffic.range.from} — {traffic.range.to}</p>
              </div>
              <Badge tone="brand">{traffic.data.length} {t.periodDays}</Badge>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={traffic.data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="upFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.55} />
                    <stop offset="95%" stopColor="var(--brand)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="downFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--cyan)" stopOpacity={0.55} />
                    <stop offset="95%" stopColor="var(--cyan)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: 'var(--subtle)', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fill: 'var(--subtle)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatBytes(v)} width={56} />
                <Tooltip contentStyle={chartTooltip} labelStyle={{ color: 'var(--fg)' }} formatter={(value: any, name: any) => [formatBytes(value), name === 'bytesUp' ? t.bytesUp : t.bytesDown]} />
                <Area type="monotone" dataKey="bytesUp" stackId="1" stroke="var(--brand)" fill="url(#upFill)" strokeWidth={2} />
                <Area type="monotone" dataKey="bytesDown" stackId="1" stroke="var(--cyan)" fill="url(#downFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {traffic.topUsers.length > 0 && (
            <Card className="mb-4 p-4">
              <h2 className="mb-3 text-sm font-semibold text-fg">{t.topUsers}</h2>
              <div className="space-y-2">
                {traffic.topUsers.map((user) => (
                  <div key={user.userId} className="flex items-center justify-between rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-xs">
                    <span className="flex min-w-0 items-center gap-2 text-muted"><Icon name="users" size={16} className="shrink-0 text-brand" /><span className="truncate" title={user.email}>{user.email}</span></span>
                    <Badge tone="brand">{formatBytes(user.bytes)}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'organizations' && (
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t.from}><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="field w-auto" /></Field>
            <Field label={t.to}><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="field w-auto" /></Field>
            <Badge tone="neutral">{t.total}: {orgs.length}</Badge>
          </div>
        </Card>
      )}

      {tab === 'cheburcheck' ? (
        <DataTable data={cheb} columns={chebColumns} loading={loading} getRowId={(row) => row.id} />
      ) : tab !== 'traffic' && (loading ? (
        <Card className="py-20 text-center text-xs text-muted">{t.loading}</Card>
      ) : tab === 'organizations' ? (
        <DataTable data={orgs} columns={orgColumns} loading={loading} getRowId={(row) => row.id} />
      ) : (
        <DataTable data={protocols} columns={protocolColumns} loading={loading} getRowId={(row) => row.protocol} />
      ))}
    </>
  );
}
