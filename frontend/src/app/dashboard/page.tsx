'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { lazyChart } from '../../components/lazy-chart';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { fetchUpdateStatus, type UpdateStatus } from '../../lib/updates';
import { UpdateDialog } from '../../components/update-dialog';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, PageHeader, ProgressBar, SectionTitle, StatCard, formatBytes } from '../../components/ui';

type Stats = { total: number; active: number; expired: number; disabled: number; trafficUsed: string };
type DoctorCheck = { id: string; severity: 'ok' | 'warning' | 'critical'; title: string };
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

const ResponsiveContainer = lazyChart('ResponsiveContainer');
const PieChart = lazyChart('PieChart');
const Pie = lazyChart('Pie');
const Cell = lazyChart('Cell');
const BarChart = lazyChart('BarChart');
const Bar = lazyChart('Bar');
const CartesianGrid = lazyChart('CartesianGrid');
const XAxis = lazyChart('XAxis');
const YAxis = lazyChart('YAxis');
const Tooltip = lazyChart('Tooltip');

export default function DashboardPage() {
  const { t } = useLang();
  const [stats, setStats] = useState<Stats | null>(null);
  const [nodeStats, setNodeStats] = useState<NodeStats | null>(null);
  const [loads, setLoads] = useState<NodeLoad[]>([]);
  const [inboundCount, setInboundCount] = useState<number | null>(null);
  const [problems, setProblems] = useState<DoctorCheck[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      api.get<Stats>('/api/users/stats').then(setStats).catch(() => setStats(null)),
      api.get<NodeStats>('/api/nodes/stats').then(setNodeStats).catch(() => setNodeStats(null)),
      api.get<any[]>('/api/inbounds')
        .then((rows) => setInboundCount((Array.isArray(rows) ? rows : (rows as any).data || []).length))
        .catch(() => setInboundCount(null)),
      api.get<DoctorCheck[]>('/api/doctor')
        .then((checks) => setProblems((Array.isArray(checks) ? checks : []).filter((check) => check.severity !== 'ok')))
        .catch(() => setProblems([])),
      fetchUpdateStatus()
        .then(setUpdate)
        .catch(() => setUpdate(null)),
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
        eyebrow={t.overview}
        title={t.dashboard}
        subtitle={t.dashboardSubtitle}
        icon="grid"
        actions={
          <>
            <span className="inline-flex items-center gap-2 rounded-md border border-success/25 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
              <span className="animate-soft-pulse h-1.5 w-1.5 rounded-full bg-success" />
              {t.live}
            </span>
            <Button icon="refresh" size="sm" onClick={load} loading={refreshing}>{t.refresh}</Button>
          </>
        }
      />

      {update?.error && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
          {t.updateCheckError.replace('{error}', update.error)}
        </div>
      )}

      {update?.updateAvailable && (
        <Card className="mb-4 border-warning/30 bg-warning/5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-warning/30 bg-warning/10 text-warning">
                <Icon name="download" size={18} />
              </div>
              <div>
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                  {t.updateAvailable}
                  <Badge tone="warning">v{update.latestVersion}</Badge>
                </p>
                <p className="mt-1 text-xs text-muted">
                  {t.updateAvailableHint
                    .replace('{current}', update.currentVersion)
                    .replace('{latest}', update.latestVersion || '')}
                </p>
                {update.releaseUrl && (
                  <a
                    href={update.releaseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                  >
                    {t.updateNotes}
                    <Icon name="external" size={12} />
                  </a>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {update.agents.outdated > 0 && (
                <Link href="/nodes">
                  <Badge tone="danger" dot>
                    {t.agentsOutdated.replace('{count}', String(update.agents.outdated))}
                  </Badge>
                </Link>
              )}
              <Button
                icon="download"
                variant="primary"
                onClick={() => setUpdateOpen(true)}
              >
                {t.updateNow}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6">
        <StatCard delay={0} label={t.totalUsers} value={stats?.total ?? '—'} icon="users" tone="brand" hint={t.registeredAccounts} />
        <StatCard delay={60} label={t.activeUsers} value={stats?.active ?? '—'} icon="checkCircle" tone="success" hint={totalUsers ? `${Math.round(((stats?.active || 0) / totalUsers) * 100)}${t.percentOfUsers}` : undefined} />
        <StatCard delay={120} label={t.totalNodes} value={nodeStats?.total ?? '—'} icon="server" tone="cyan" hint={t.configuredNodes} />
        <StatCard delay={180} label={t.onlineNodes} value={nodeStats?.online ?? '—'} icon="activity" tone="success" hint={totalNodes ? `${Math.round(((nodeStats?.online || 0) / totalNodes) * 100)}% ${t.availability}` : undefined} />
        <StatCard delay={240} label={t.totalInbounds} value={inboundCount ?? '—'} icon="plug" tone="cyan" hint={t.configuredInbounds} />
        <Link href="/doctor" className="block">
          <StatCard
            delay={300}
            label={t.problems}
            value={problems.length}
            icon={problems.length ? 'alert' : 'checkCircle'}
            tone={problems.length ? 'danger' : 'success'}
            hint={problems.length ? problems[0].title : t.noProblems}
          />
        </Link>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Card delay={240}>
          <SectionTitle title={t.usersByStatus} subtitle={t.distributionStatuses} />
          <div className="flex items-center gap-4">
            <div className="relative h-[150px] w-[150px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={userStatus} dataKey="value" nameKey="name" innerRadius={46} outerRadius={66} paddingAngle={3} stroke="none">
                    {userStatus.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold tracking-tight text-fg tabular-nums">{totalUsers}</span>
                <span className="text-[10px] uppercase tracking-widest text-subtle">{t.total}</span>
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

        <Card delay={300}>
          <SectionTitle title={t.nodesByStatus} subtitle={t.healthAcrossLocations} />
          <ResponsiveContainer width="100%" height={180}>
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

      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        <Card delay={360} className="xl:col-span-2">
          <SectionTitle title={t.nodeLoad} subtitle={t.cpuRamByNode} />
          {loads.length === 0 ? (
            <div className="grid h-[180px] place-items-center text-xs text-subtle">{t.noNodeMetrics}</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
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

        <Card delay={420}>
          <SectionTitle title={t.trafficOverview} subtitle={t.aggregatedUsage} />
          <div className="rounded-xl border border-line bg-surface-2/60 p-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl border border-cyan/25 bg-cyan/10 text-cyan">
                <Icon name="activity" size={20} />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-subtle">{t.trafficUsed}</p>
                <p className="text-xl font-semibold tracking-tight text-fg tabular-nums">{formatBytes(stats?.trafficUsed)}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-subtle">{t.active}</p>
                <p className="mt-1 text-sm font-medium text-fg tabular-nums">{stats?.active ?? '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-subtle">{t.online}</p>
                <p className="mt-1 text-sm font-medium text-fg tabular-nums">{nodeStats?.online ?? '—'}</p>
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <Link href="/users" className="flex items-center justify-between rounded-lg border border-line bg-surface-2/40 px-3 py-2.5 text-xs text-muted transition-colors hover:border-brand/30 hover:text-fg">
              <span className="flex items-center gap-2"><Icon name="users" size={18} className="text-brand" /> {t.manageSubscribers}</span>
              <Icon name="arrowUpRight" size={18} />
            </Link>
            <Link href="/nodes" className="flex items-center justify-between rounded-lg border border-line bg-surface-2/40 px-3 py-2.5 text-xs text-muted transition-colors hover:border-brand/30 hover:text-fg">
              <span className="flex items-center gap-2"><Icon name="server" size={18} className="text-cyan" /> {t.inspectNodes}</span>
              <Icon name="arrowUpRight" size={18} />
            </Link>
          </div>
        </Card>
      </div>

      {updateOpen && <UpdateDialog open onClose={() => setUpdateOpen(false)} status={update} />}
    </>
  );
}
