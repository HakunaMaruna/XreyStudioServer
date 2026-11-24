'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import {
  Badge, Button, Card, Field, IconButton, Modal, PageHeader,
  SectionTitle, StatusBadge, formatBytes,
} from '../../components/ui';

type NodeGeo = { countryCode: string | null; city: string | null; ip: string | null; asn: string | null; checkedAt: string };
type NodeRow = { id: string; name: string; address: string; port: number; status: string; geo?: NodeGeo | null };
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
  const { t } = useLang();
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', address: '' });
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
  const [busy, setBusy] = useState(false);

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

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/api/nodes', form);
      setForm({ name: '', address: '' });
      setCreateOpen(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const apply = async (id: string) => {
    setBusy(true);
    await api.post(`/api/nodes/${id}/apply`, {});
    await load();
    setBusy(false);
  };

  const restart = async (id: string) => {
    setBusy(true);
    await api.post(`/api/nodes/${id}/restart`, {});
    await load();
    setBusy(false);
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

  const columns = useMemo<ColumnDef<NodeRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t.name,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-2 text-brand">
              <Icon name="server" size={15} />
            </div>
            <div>
              <p className="font-medium text-fg">{row.original.name}</p>
              <p className="text-[10px] text-subtle">{t.idLabel} {row.original.id.slice(0, 8)}</p>
            </div>
          </div>
        ),
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
      {
        id: 'actions',
        header: t.actions,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <IconButton icon="activity" label={t.health} onClick={() => openHealth(row.original)} />
            <IconButton icon="terminal" label={t.logs} onClick={() => openLogs(row.original)} />
            <IconButton icon="play" label={t.apply} tone="brand" onClick={() => apply(row.original.id)} />
            <IconButton icon="refresh" label={t.restart} onClick={() => restart(row.original.id)} />
            <IconButton icon="history" label={t.revisions} onClick={() => openRevisions(row.original)} />
          </div>
        ),
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
        actions={<Button icon="plus" variant="primary" onClick={() => setCreateOpen(true)}>{t.addNode}</Button>}
      />

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
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

      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setForm({ name: '', address: '' }); }} title={t.registerNode} subtitle={t.connectAgent} icon={<Icon name="server" size={16} />}
        footer={<><Button onClick={() => setCreateOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="plus" onClick={create} loading={busy}>{t.create}</Button></>}>
        <form onSubmit={create} className="space-y-4">
          <Field label={t.name}><input placeholder="node-eu-01" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" required /></Field>
          <Field label={t.address} hint="Hostname or IP of the agent"><input placeholder="10.0.0.5" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="field" required /></Field>
          <div className="rounded-lg border border-info/20 bg-info/5 p-3 text-[11px] leading-relaxed text-muted">
            {t.oneTimeTokenNote}
          </div>
        </form>
      </Modal>

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
        icon={<Icon name="terminal" size={16} />}
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
    </>
  );
}
