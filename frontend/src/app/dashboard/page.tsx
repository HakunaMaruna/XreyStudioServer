'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, PageHeader, ProgressBar, SectionTitle, StatCard, formatBytes } from '../../components/ui';

type Stats = { total: number; active: number; expired: number; disabled: number; trafficUsed: string };
type NodeStats = { total: number; online: number; offline: number; error: number };
type NodeLoad = { name: string; cpu: number; ram: number };

const CHART_COLORS = ['var(--success)', 'var(--warning)', 'var(--danger)'];

const tooltipStyle = {
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  fontSize: 11,
  color: 'var(--fg)',
  boxShadow: '0 12px 30px -12px rgba(0,0,0,.6)',
};

export default function DashboardPage() {
  const { t } = useLang();
  const [stats, setStats] = useState<Stats | null>(null);
  const [nodeStats, setNodeStats] = useState<NodeStats | null>(null);
  const [loads, setLoads] = useState<NodeLoad[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      api.get<Stats>('/api/users/stats').then(setStats).catch(() => setStats(null)),
      api.get<NodeStats>('/api/nodes/stats').then(setNodeStats).catch(() => setNodeStats(null)),
      api
        .get<any>('/api/nodes')
        .then((nodes) =>
          setLoads(
            (Array.isArray(nodes) ? nodes : nodes.data || []).map((node: any) => ({
              name: node.name,
              cpu: Number(node.metrics?.[0]?.cpu || 0),
              ram: Number(node.metrics?.[0]?.ram || 0),
            })),
          ),
        )
        .catch(() => setLoads([])),
    ]);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    load();
  }, [load]);

  const userStatus = [
    { name: t.activeUsers, value: stats?.active || 0 },
    { name: t.expired, value: stats?.expired || 0 },
    { name: t.disabledUsers, value: stats?.disabled || 0 },
  ];
  const nodeStatus = [
    { name: 'Online', value: nodeStats?.online || 0 },
    { name: 'Offline', value: nodeStats?.offline || 0 },
    { name: 'Error', value: nodeStats?.error || 0 },
  ];
  const totalUsers = stats?.total || 0;
  const totalNodes = nodeStats?.total || 0;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={t.dashboard}
        subtitle="Live snapshot of your infrastructure and subscriber base"
        icon="grid"
        actions={
          <>
            <Badge tone="success" dot>Live</Badge>
            <Button icon="refresh" size="sm" onClick={load} loading={refreshing}>Refresh</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t.totalUsers} value={stats?.total ?? '—'} icon="users" tone="brand" hint="Registered accounts" />
        <StatCard label={t.activeUsers} value={stats?.active ?? '—'} icon="checkCircle" tone="success" hint={totalUsers ? `${Math.round(((stats?.active || 0) / totalUsers) * 100)}% of all users` : undefined} />
        <StatCard label={t.totalNodes} value={nodeStats?.total ?? '—'} icon="server" tone="cyan" hint="Configured nodes" />
        <StatCard label={t.onlineNodes} value={nodeStats?.online ?? '—'} icon="activity" tone="success" hint={totalNodes ? `${Math.round(((nodeStats?.online || 0) / totalNodes) * 100)}% availability` : undefined} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle title={t.usersByStatus} subtitle="Distribution of subscriber states" />
          <div className="flex items-center gap-4">
            <div className="relative h-[190px] w-[190px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={userStatus} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={3} stroke="none">
                    {userStatus.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold tracking-tight text-fg tabular-nums">{totalUsers}</span>
                <span className="text-[10px] uppercase tracking-widest text-subtle">Total</span>
              </div>
            </div>
            <div className="flex-1 space-y-3">
              {userStatus.map((item, index) => (
                <div key={item.name}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-muted">
                      <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[index] }} />
                      {item.name}
                    </span>
                    <span className="font-medium text-fg tabular-nums">{item.value}</span>
                  </div>
                  <ProgressBar value={totalUsers ? (item.value / totalUsers) * 100 : 0} tone={index === 0 ? 'success' : index === 1 ? 'warning' : 'danger'} />
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle title={t.nodesByStatus} subtitle="Health across all locations" />
          <ResponsiveContainer width="100%" height={224}>
            <BarChart data={nodeStatus} barSize={42}>
              <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--subtle)', fontSize: 11 }} dy={8} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: 'var(--subtle)', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {nodeStatus.map((entry, index) => (
                  <Cell key={entry.name} fill={CHART_COLORS[index]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <SectionTitle title={t.nodeLoad} subtitle="CPU and memory utilisation by node" />
          {loads.length === 0 ? (
            <div className="grid h-[220px] place-items-center text-xs text-subtle">No node metrics available yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={224}>
              <BarChart data={loads} barGap={4}>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--subtle)', fontSize: 10 }} dy={8} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: 'var(--subtle)', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
                <Bar dataKey="cpu" name={t.cpu} fill="var(--brand)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ram" name={t.ram} fill="var(--cyan)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <SectionTitle title="Traffic overview" subtitle="Aggregated usage across all accounts" />
          <div className="rounded-xl border border-line bg-surface-2/60 p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/25 bg-cyan/10 text-cyan">
                <Icon name="activity" size={18} />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-subtle">{t.trafficUsed}</p>
                <p className="text-xl font-semibold tracking-tight text-fg tabular-nums">{formatBytes(stats?.trafficUsed)}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-subtle">Active</p>
                <p className="mt-1 text-sm font-medium text-fg tabular-nums">{stats?.active ?? '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-subtle">Online</p>
                <p className="mt-1 text-sm font-medium text-fg tabular-nums">{nodeStats?.online ?? '—'}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Link href="/users" className="flex items-center justify-between rounded-lg border border-line bg-surface-2/40 px-3 py-2.5 text-xs text-muted transition-colors hover:border-brand/30 hover:text-fg">
              <span className="flex items-center gap-2"><Icon name="users" size={14} className="text-brand" /> Manage subscribers</span>
              <Icon name="arrowUpRight" size={13} />
            </Link>
            <Link href="/nodes" className="flex items-center justify-between rounded-lg border border-line bg-surface-2/40 px-3 py-2.5 text-xs text-muted transition-colors hover:border-brand/30 hover:text-fg">
              <span className="flex items-center gap-2"><Icon name="server" size={14} className="text-cyan" /> Inspect nodes</span>
              <Icon name="arrowUpRight" size={13} />
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}
