'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { COUNTRIES } from '../../lib/countries';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import {
  Badge, Button, Card, Field, HelpButton, IconButton, Modal, PageHeader,
  ProgressBar, SectionTitle, StatusBadge, formatBytes,
} from '../../components/ui';

type NodeGeo = { countryCode: string | null; city: string | null; ip: string | null; asn: string | null; checkedAt: string };
type NodeMetricRow = {
  cpu: number; ram: number; disk: number;
  trafficUp: string; trafficDown: string; connections: number; createdAt: string;
  xrayStatus?: string | null;
};
type NodeRow = {
  id: string; name: string; address: string; port: number; status: string;
  location?: string | null; geo?: NodeGeo | null; metrics?: NodeMetricRow[];
};
type RevisionRow = { id: string; version: number; applied: boolean; createdAt: string };
type LogEntry = { timestamp: string; level: string; message: string };
type NodeLogs = { nodeId: string; logs: LogEntry[] };

type NodeHealth = {
  nodeId: string;
  status: string;
  online: boolean;
  lastSeenAt: string | null;
  lastError: string | null;
  latestMetric: {
    cpu: number;
    ram: number;
    disk: number;
    trafficUp: string;
    trafficDown: string;
    connections: number;
    createdAt: string;
  } | null;
};

export default function NodesPage() {
  const { t, lang } = useLang();
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revisionsNode, setRevisionsNode] = useState<NodeRow | null>(null);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [healthNode, setHealthNode] = useState<NodeRow | null>(null);
  const [health, setHealth] = useState<NodeHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [logsNode, setLogsNode] = useState<NodeRow | null>(null);
  const [logsData, setLogsData] = useState<NodeLogs | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [editNodeId, setEditNodeId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [metricsNode, setMetricsNode] = useState<NodeRow | null>(null);
  const [metricsData, setMetricsData] = useState<any>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [checkNode, setCheckNode] = useState<NodeRow | null>(null);
  const [checkData, setCheckData] = useState<any>(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkStep, setCheckStep] = useState(0);

  const countryNames = useMemo(
    () => new Intl.DisplayNames([lang === 'ru' ? 'ru' : 'en'], { type: 'region' }),
    [lang],
  );
  const flagFor = (code?: string | null) => COUNTRIES.find((c) => c.code === code)?.flag || '';

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/nodes');
      setNodes(Array.isArray(data) ? data : data.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    load();
  }, []);

  const apply = async (id: string) => {
    await api.post(`/api/nodes/${id}/apply`, {});
    await load();
  };

  const restart = async (id: string) => {
    await api.post(`/api/nodes/${id}/restart`, {});
    await load();
  };

  const openRevisions = async (node: NodeRow) => {
    setRevisionsNode(node);
    setRevisions([]);
    setError('');
    setRevisionsLoading(true);
    try {
      const data = await api.get(`/api/nodes/${node.id}/revisions`);
      setRevisions(Array.isArray(data) ? data : data.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRevisionsLoading(false);
    }
  };

  const applyRevision = async (revisionId: string) => {
    if (!revisionsNode) return;
    try {
      await api.post(`/api/nodes/${revisionsNode.id}/apply`, revisionId ? { revisionId } : {});
      await openRevisions(revisionsNode);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const rollback = async (revisionId: string) => {
    if (!revisionsNode) return;
    try {
      await api.post(`/api/nodes/${revisionsNode.id}/rollback/${revisionId}`, {});
      await openRevisions(revisionsNode);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const openHealth = async (node: NodeRow) => {
    setHealthNode(node);
    setHealth(null);
    setHealthLoading(true);
    try {
      const data = await api.get(`/api/nodes/${node.id}/health`);
      setHealth(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setHealthLoading(false);
    }
  };

  const openLogs = async (node: NodeRow) => {
    setLogsNode(node);
    setLogsData(null);
    setLogsLoading(true);
    try {
      const data = await api.get(`/api/nodes/${node.id}/logs?limit=200`);
      setLogsData(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLogsLoading(false);
    }
  };

  const openEdit = async (node: NodeRow) => {
    setEditNodeId(node.id);
    setEditData(null);
    setError('');
    try {
      const data = await api.get(`/api/wizard/nodes/${node.id}`);
      setEditData({ ...data, name: data.name || node.name, address: data.address || node.address });
    } catch (e: any) {
      setError(e.message);
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editNodeId || !editData) return;
    setEditBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        name: editData.name,
        address: editData.address,
        location: editData.location || undefined,
        sshUser: editData.sshUser,
        sshPort: Number(editData.sshPort) || 22,
        authMode: editData.authMode,
        ipv4: editData.ipv4 || undefined,
        ipv6: editData.ipv6 || undefined,
        userDomain: editData.userDomain || undefined,
      };
      if (editData.password) body.password = editData.password;
      if (editData.privateKey) body.privateKey = editData.privateKey;
      if (editData.passphrase) body.passphrase = editData.passphrase;
      await api.patch(`/api/wizard/nodes/${editNodeId}`, body);
      setEditNodeId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEditBusy(false);
    }
  };

  const openMetrics = async (node: NodeRow) => {
    setMetricsNode(node);
    setMetricsData(null);
    setMetricsLoading(true);
    try {
      setMetricsData(await api.get(`/api/nodes/${node.id}/health`));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setMetricsLoading(false);
    }
  };

  const runCheburcheck = async (node: NodeRow) => {
    setCheckNode(node);
    setCheckData(null);
    setCheckStep(1);
    setCheckBusy(true);
    setError('');
    const timer = window.setInterval(() => setCheckStep((current) => Math.min(3, current + 1)), 6000);
    try {
      const data = await api.post('/api/cheburcheck/check', { nodeId: node.id });
      setCheckData(data);
      setCheckStep(4);
    } catch (e: any) {
      setError(e.message);
      setCheckStep(4);
    } finally {
      window.clearInterval(timer);
      setCheckBusy(false);
    }
  };

  const columns = useMemo<ColumnDef<NodeRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t.name,
        size: 420,
        cell: ({ row }) => {
          const metric = row.original.metrics?.[0];
          const interval = 15;
          const upMbps = metric ? Number((Number(metric.trafficUp) * 8 / interval / 1_000_000).toFixed(3)) : 0;
          const downMbps = metric ? Number((Number(metric.trafficDown) * 8 / interval / 1_000_000).toFixed(3)) : 0;
          return (
            <div className="flex min-w-[420px] flex-wrap items-stretch gap-3 py-2">
              <div className="node-card flex min-w-[280px] flex-1 items-center gap-3 rounded-2xl border border-line-2 bg-surface-2/70 px-3 py-2.5">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-brand/30 bg-brand/10 text-brand">
                  <Icon name="server" size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {flagFor(row.original.geo?.countryCode || row.original.location) && (
                      <span title={row.original.geo?.countryCode || row.original.location || ''}>
                        {flagFor(row.original.geo?.countryCode || row.original.location)}
                      </span>
                    )}
                    <p className="truncate font-semibold text-fg">{row.original.name}</p>
                    <StatusBadge status={row.original.status} />
                  </div>
                  <p className="mono text-[10px] text-subtle">{t.idLabel} {row.original.id.slice(0, 8)} · {row.original.address}:{row.original.port}</p>
                  {metric ? (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <div className="mb-1 flex justify-between text-[10px] text-subtle"><span>CPU</span><span className="tabular-nums text-fg">{Number(metric.cpu).toFixed(0)}%</span></div>
                        <ProgressBar value={Number(metric.cpu)} tone={Number(metric.cpu) > 85 ? 'danger' : Number(metric.cpu) > 65 ? 'warning' : 'success'} />
                      </div>
                      <div>
                        <div className="mb-1 flex justify-between text-[10px] text-subtle"><span>RAM</span><span className="tabular-nums text-fg">{Number(metric.ram).toFixed(0)}%</span></div>
                        <ProgressBar value={Number(metric.ram)} tone={Number(metric.ram) > 85 ? 'danger' : Number(metric.ram) > 65 ? 'warning' : 'cyan'} />
                      </div>
                      <div className="col-span-2 flex items-center gap-3 text-[10px] text-subtle">
                        <span className="flex items-center gap-1"><Icon name="upload" size={13} className="text-brand" /> ↑ {upMbps} Mbps</span>
                        <span className="flex items-center gap-1"><Icon name="download" size={13} className="text-cyan" /> ↓ {downMbps} Mbps</span>
                        <span className="flex items-center gap-1"><Icon name="activity" size={13} className="text-success" /> {metric.connections} {t.connections.toLowerCase()}</span>
                      </div>
                    </div>
                  ) : <p className="mt-1 text-[10px] text-subtle">{t.noNodeMetrics}</p>}
                </div>
              </div>
              <div className="flex min-w-[240px] flex-col justify-center gap-1.5">
                <div className="flex flex-wrap gap-1">
                  <IconButton icon="gauge" label={t.metrics} tone="brand" onClick={() => openMetrics(row.original)} />
                  <IconButton icon="activity" label={t.health} onClick={() => openHealth(row.original)} />
                  <IconButton icon="shield" label={t.cheburcheckCheck} tone="brand" onClick={() => runCheburcheck(row.original)} />
                  <IconButton icon="edit" label={t.edit} onClick={() => openEdit(row.original)} />
                  <IconButton icon="play" label={t.apply} tone="brand" onClick={() => apply(row.original.id)} />
                  <IconButton icon="refresh" label={t.restart} onClick={() => restart(row.original.id)} />
                  <IconButton icon="history" label={t.revisions} onClick={() => openRevisions(row.original)} />
                  <IconButton icon="terminal" label={t.logs} onClick={() => openLogs(row.original)} />
                </div>
                <div className="flex flex-wrap gap-1 text-[9px] text-subtle">
                  <span>{t.metrics}</span><span>·</span><span>{t.health}</span><span>·</span><span>Cheburcheck</span><span>·</span><span>{t.edit}</span>
                </div>
              </div>
            </div>
          );
        },
      },
      {
        id: 'address',
        header: t.address,
        accessorFn: (row) => `${row.address}:${row.port}`,
        cell: ({ row }) => <span className="mono text-xs text-muted">{row.original.address}:{row.original.port}</span>,
      },
      {
        accessorKey: 'status',
        header: t.status,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'geo',
        header: 'Geo',
        enableSorting: false,
        cell: ({ row }) => {
          const geo = row.original.geo;
          if (!geo?.countryCode) return <span className="text-xs text-subtle">—</span>;
          return (
            <div className="text-xs text-fg">
              <Badge tone="neutral">{geo.countryCode}</Badge>
              {geo.city && <span className="ml-1.5 text-muted">{geo.city}</span>}
              <p className="mono text-[10px] text-subtle">{geo.ip || geo.asn || ''}</p>
            </div>
          );
        },
      },
    ],
    [t],
  );

  const online = nodes.filter((node) => node.status === 'ONLINE').length;

  return (
    <>
      <PageHeader
        eyebrow="Infrastructure"
        title={t.nodes}
        subtitle={t.nodesSubtitle}
        icon="server"
        actions={
          <>
            <HelpButton title={t.help}>
              <p>{lang === 'ru' ? 'Здесь собраны ноды и их состояние. Карточка ноды показывает CPU, RAM, скорость сети и число подключений — данные приходят от агента каждые 15 секунд.' : 'Nodes and their status live here. The node card shows CPU, RAM, network speed and connections — the agent reports every 15 seconds.'}</p>
              <p>{lang === 'ru' ? 'Кнопки рядом: метрики и Ping, история конфигов, редактирование параметров мастера, проверка Cheburcheck, применение конфига, перезапуск и логи.' : 'Buttons next to the card: metrics and ping, config history, wizard parameters, Cheburcheck check, apply config, restart and logs.'}</p>
            </HelpButton>
            <Button icon="plus" variant="primary" onClick={() => { window.location.href = '/wizard'; }}>
              {t.wizard}
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Card className="flex items-center gap-3 p-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface-2 text-muted"><Icon name="server" size={17} /></div>
          <div><p className="text-[10px] uppercase tracking-wider text-subtle">{t.totalNodesLabel}</p><p className="text-lg font-semibold text-fg tabular-nums">{nodes.length}</p></div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-success/25 bg-success/10 text-success"><Icon name="activity" size={17} /></div>
          <div><p className="text-[10px] uppercase tracking-wider text-subtle">{t.online}</p><p className="text-lg font-semibold text-fg tabular-nums">{online}</p></div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-warning/25 bg-warning/10 text-warning"><Icon name="pulse" size={17} /></div>
          <div><p className="text-[10px] uppercase tracking-wider text-subtle">{t.availability}</p><p className="text-lg font-semibold text-fg tabular-nums">{nodes.length ? Math.round((online / nodes.length) * 100) : 0}%</p></div>
        </Card>
      </div>

      <DataTable data={nodes} columns={columns} loading={loading} getRowId={(row) => row.id} />

      <Modal open={Boolean(revisionsNode)} onClose={() => setRevisionsNode(null)} title={`${t.revisions} — ${revisionsNode?.name || ''}`} subtitle="Version history and deployment control" size="lg">
        <SectionTitle title={t.configHistory} action={<Button size="sm" icon="play" onClick={() => applyRevision('')} loading={revisionsLoading}>{t.applyLatest}</Button>} />
        {revisionsLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted"><Icon name="refresh" size={15} className="animate-spin text-brand" />{t.loading}</div>
        ) : revisions.length === 0 ? (
          <div className="py-10 text-center text-xs text-subtle">{t.noData}</div>
        ) : (
          <div className="relative space-y-3 pl-6">
            <div className="absolute bottom-3 left-[7px] top-3 w-px bg-line" />
            {revisions.map((revision) => (
              <div key={revision.id} className="relative rounded-xl border border-line bg-surface-2/50 p-3.5">
                <span className="absolute -left-[22px] top-5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand" />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Badge tone="brand">v{revision.version}</Badge>
                    {revision.applied && <Badge tone="success" dot>{t.applied}</Badge>}
                    <span className="text-[11px] text-subtle">{new Date(revision.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" icon="play" onClick={() => applyRevision(revision.id)}>{t.apply}</Button>
                    <Button size="sm" variant="ghost" icon="history" onClick={() => rollback(revision.id)}>{t.rollback}</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(healthNode)}
        onClose={() => { setHealthNode(null); setHealth(null); }}
        title={t.nodeHealth}
        subtitle={healthNode?.name}
        icon={<Icon name="activity" size={16} />}
      >
        {healthLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted">
            <Icon name="refresh" size={15} className="animate-spin text-brand" />{t.loading}
          </div>
        ) : health ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={health.status} />
              <Badge tone={health.online ? 'success' : 'danger'} dot>{health.online ? t.online : t.offline}</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: t.lastSeen, value: health.lastSeenAt ? new Date(health.lastSeenAt).toLocaleString() : '—' },
                { label: t.cpu, value: health.latestMetric ? `${Number(health.latestMetric.cpu).toFixed(1)}%` : '—' },
                { label: t.ram, value: health.latestMetric ? `${Number(health.latestMetric.ram).toFixed(1)}%` : '—' },
                { label: t.disk, value: health.latestMetric ? `${Number(health.latestMetric.disk).toFixed(1)}%` : '—' },
                { label: t.trafficUsed, value: health.latestMetric ? formatBytes(health.latestMetric.trafficUp) : '—' },
                { label: t.connections, value: health.latestMetric ? String(health.latestMetric.connections) : '—' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-line bg-surface-2/50 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-subtle">{item.label}</p>
                  <p className="mt-1.5 text-sm font-medium text-fg tabular-nums">{item.value}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-wider text-subtle">{t.lastError}</p>
              {health.lastError ? (
                <div className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/10 p-3 text-xs text-danger">
                  <Icon name="alert" size={14} className="mt-0.5 shrink-0" />{health.lastError}
                </div>
              ) : (
                <p className="text-xs text-subtle">{t.noErrors}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-subtle">{t.noData}</div>
        )}
      </Modal>

      <Modal
        open={Boolean(logsNode)}
        onClose={() => { setLogsNode(null); setLogsData(null); }}
        title={t.logs}
        subtitle={logsNode?.name}
        icon={<Icon name="server" size={16} />}
        size="lg"
      >
        {logsLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted">
            <Icon name="refresh" size={15} className="animate-spin text-brand" />{t.loading}
          </div>
        ) : logsData?.logs?.length ? (
          <div className="mono max-h-[60vh] space-y-1 overflow-y-auto rounded-xl border border-line bg-app/70 p-3 text-[11px] leading-relaxed">
            {logsData.logs.map((entry, index) => (
              <div key={`${entry.timestamp}-${index}`} className="flex gap-3">
                <span className="shrink-0 text-subtle">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                <span className={entry.level === 'error' ? 'shrink-0 text-danger' : entry.level === 'warn' ? 'shrink-0 text-warning' : 'shrink-0 text-brand'}>
                  {entry.level.toUpperCase()}
                </span>
                <span className="min-w-0 break-all text-muted">{entry.message}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-subtle">{t.noLogs}</div>
        )}
      </Modal>


      <Modal
        open={Boolean(editNodeId)}
        onClose={() => { setEditNodeId(null); setEditData(null); }}
        title={t.editNode}
        subtitle={editData?.name || undefined}
        icon={<Icon name="edit" size={16} />}
        size="lg"
        footer={<>
          <Button onClick={() => { setEditNodeId(null); setEditData(null); }}>{t.cancel}</Button>
          <Button variant="primary" icon="check" form="edit-node-form" loading={editBusy}>{t.save}</Button>
        </>}
      >
        {editData ? (
          <form id="edit-node-form" onSubmit={saveEdit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.name}>
                <input className="field" value={editData.name || ''} onChange={(e) => setEditData({ ...editData, name: e.target.value })} required />
              </Field>
              <Field label={t.wizardHost}>
                <input className="field" value={editData.address || ''} onChange={(e) => setEditData({ ...editData, address: e.target.value })} required />
              </Field>
              <Field label={t.wizardLocation}>
                <select className="field" value={editData.location || ''} onChange={(e) => setEditData({ ...editData, location: e.target.value || null })}>
                  <option value="">—</option>
                  {COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.flag} {countryNames.of(country.code)} ({country.code})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t.wizardAuthMode}>
                <select className="field" value={editData.authMode || 'key'} onChange={(e) => setEditData({ ...editData, authMode: e.target.value })}>
                  <option value="key">{t.wizardKey}</option>
                  <option value="password">{t.wizardPassword}</option>
                  <option value="password_key">{t.wizardPassword} + {t.wizardKey}</option>
                </select>
              </Field>
              <Field label={t.wizardUser}>
                <input className="field" value={editData.sshUser || ''} onChange={(e) => setEditData({ ...editData, sshUser: e.target.value })} />
              </Field>
              <Field label={t.wizardPort}>
                <input className="field" type="number" min={1} max={65535} value={editData.sshPort ?? 22} onChange={(e) => setEditData({ ...editData, sshPort: e.target.value })} />
              </Field>
              <Field label={t.wizardIpv4}>
                <input className="field" value={editData.ipv4 || ''} onChange={(e) => setEditData({ ...editData, ipv4: e.target.value })} />
              </Field>
              <Field label={t.wizardIpv6}>
                <input className="field" value={editData.ipv6 || ''} onChange={(e) => setEditData({ ...editData, ipv6: e.target.value })} />
              </Field>
              <Field label={t.wizardUserDomain}>
                <input className="field" value={editData.userDomain || ''} onChange={(e) => setEditData({ ...editData, userDomain: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.wizardPassword} hint={t.keepSecret}>
                <input className="field" type="password" autoComplete="new-password" value={editData.password || ''} onChange={(e) => setEditData({ ...editData, password: e.target.value })} />
              </Field>
              <Field label={t.wizardKey} hint={t.keepSecret}>
                <textarea className="field mono min-h-20 text-[11px]" value={editData.privateKey || ''} onChange={(e) => setEditData({ ...editData, privateKey: e.target.value })} />
              </Field>
              <Field label={t.wizardPassphrase} hint={t.keepSecret}>
                <input className="field" type="password" autoComplete="off" value={editData.passphrase || ''} onChange={(e) => setEditData({ ...editData, passphrase: e.target.value })} />
              </Field>
            </div>
          </form>
        ) : (
          <div className="py-10 text-center text-xs text-subtle"><Icon name="refresh" size={15} className="mx-auto animate-spin text-brand" /></div>
        )}
      </Modal>

      <Modal
        open={Boolean(metricsNode)}
        onClose={() => { setMetricsNode(null); setMetricsData(null); }}
        title={t.metrics}
        subtitle={metricsNode?.name}
        icon={<Icon name="gauge" size={16} />}
      >
        {metricsLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted">
            <Icon name="refresh" size={15} className="animate-spin text-brand" />{t.loading}
          </div>
        ) : metricsData ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={metricsData.status} />
              <Badge tone={metricsData.xray === 'running' ? 'success' : 'danger'} dot>
                {t.xrayStatus}: {metricsData.xray}
              </Badge>
              <Badge tone={metricsData.ping?.reachable ? 'success' : 'danger'} dot>
                {t.ping}: {metricsData.ping?.reachable ? `${metricsData.ping.latencyMs} ms` : t.unreachable}
              </Badge>
            </div>
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-wider text-subtle">{t.networkSpeed}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: t.upload, value: `${metricsData.network?.uploadMbps ?? 0} Mbps` },
                  { label: t.download, value: `${metricsData.network?.downloadMbps ?? 0} Mbps` },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-line bg-surface-2/50 p-3">
                    <p className="text-[11px] text-subtle">{item.label}</p>
                    <p className="mt-1 text-sm font-semibold text-fg tabular-nums">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-subtle">{t.noData}</div>
        )}
      </Modal>


      <Modal
        open={Boolean(checkNode)}
        onClose={() => { setCheckNode(null); setCheckData(null); }}
        title={t.cheburcheck}
        subtitle={checkNode?.address}
        icon={<Icon name="shield" size={16} />}
        size="lg"
        footer={<Button onClick={() => { setCheckNode(null); setCheckData(null); }}>{t.close}</Button>}
      >
        {checkBusy && (
          <div className="flex flex-col items-center gap-5 py-6">
            <div className="cheb-radar"><span /><span /><span /><i /></div>
            <p className="text-sm font-medium text-fg">{t.cheburcheckChecking}</p>
            <div className="w-full max-w-md space-y-2">
              {[t.cheburcheckStep1, t.cheburcheckStep2, t.cheburcheckStep3].map((label, index) => (
                <div key={label} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all ${checkStep >= index + 1 ? 'border-brand/30 bg-brand/10 text-fg' : 'border-line bg-surface-2 text-subtle'}`}>
                  <span className={`grid h-5 w-5 place-items-center rounded-full border ${checkStep > index + 1 ? 'border-success/40 bg-success/20 text-success' : checkStep === index + 1 ? 'border-brand/40 bg-brand/20 text-brand' : 'border-line text-subtle'}`}>
                    {checkStep > index + 1 ? '✓' : index + 1}
                  </span>
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}

        {!checkBusy && checkData && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={checkData.blocked ? 'danger' : 'success'} dot>
                {checkData.blocked ? t.cheburcheckBlocked : t.cheburcheckOk}
              </Badge>
              <Badge tone="brand">{t.cheburcheckVerdict}: {checkData.verdict}</Badge>
              <Badge tone="neutral">{checkData.targetType || '—'}</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface-2/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-subtle">{t.cheburcheckTarget}</p>
                <p className="mono mt-1 text-sm text-fg">{checkData.target}</p>
                <p className="mt-1 text-[11px] text-muted">{checkData.ips?.join(', ') || '—'}</p>
              </div>
              <div className="rounded-xl border border-line bg-surface-2/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-subtle">{t.cheburcheckGeo}</p>
                <p className="mt-1 text-sm text-fg">{checkData.geo?.location || '—'}</p>
                <p className="mt-1 text-[11px] text-muted">{checkData.geo?.organisation || ''} {checkData.geo?.asn || ''}</p>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-subtle">{t.cheburcheckProbes}</p>
                <Badge tone="neutral">{checkData.probes?.length || 0}</Badge>
              </div>
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {(checkData.probes || []).map((probe: any, index: number) => (
                  <div key={`${probe.probeId}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2 text-muted">
                      <span className="mono text-brand">#{probe.probeId}</span>
                      <span>{probe.region || '—'}</span>
                      <span>{probe.provider || ''}</span>
                      <span className="mono">{probe.asn || ''}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(probe.verdicts || []).map((verdict: string) => (
                        <Badge key={verdict} tone={verdict === 'ok' ? 'success' : verdict === 'uncertain' ? 'warning' : 'danger'}>{verdict}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
                {!checkData.probes?.length && <p className="py-4 text-center text-xs text-subtle">{checkData.probeError || t.noData}</p>}
              </div>
            </div>
          </div>
        )}
      </Modal>

    </>
  );
}
