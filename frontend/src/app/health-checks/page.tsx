'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, PageHeader, StatCard } from '../../components/ui';

type Check = {
  id: string;
  nodeId: string;
  node?: { id: string; name: string } | null;
  inboundId: string | null;
  tag: string;
  protocol: string;
  host: string;
  port: number;
  success: boolean;
  latencyMs: number | null;
  error: string | null;
  checkedAt: string;
};

export default function HealthChecksPage() {
  const { t } = useLang();
  const [rows, setRows] = useState<Check[]>([]);
  const [nodes, setNodes] = useState<{ id: string; name: string }[]>([]);
  const [nodeId, setNodeId] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (nodeId) params.set('nodeId', nodeId);
      const data = await api.get(`/api/health-checks?${params.toString()}`);
      setRows(Array.isArray(data) ? data : data.data || []);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [nodeId]);

  useEffect(() => {
    if (!isLoggedIn()) { window.location.href = '/login'; return; }
    api.get('/api/nodes').then((d) => setNodes(Array.isArray(d) ? d : d.data || [])).catch(() => undefined);
    load();
  }, [load]);

  const latest = useMemo(() => {
    const map = new Map<string, Check>();
    for (const row of rows) {
      const key = row.inboundId || `${row.nodeId}:${row.tag}`;
      if (!map.has(key)) map.set(key, row);
    }
    return Array.from(map.values());
  }, [rows]);

  const success = latest.filter((r) => r.success).length;
  const avg = latest.length
    ? Math.round(latest.reduce((sum, r) => sum + (r.latencyMs || 0), 0) / latest.length)
    : 0;

  const columns = useMemo<ColumnDef<Check>[]>(
    () => [
      { accessorKey: 'node', header: t.nodes, cell: ({ row }) => <span className="text-xs text-fg">{row.original.node?.name || '—'}</span> },
      { accessorKey: 'tag', header: t.name, cell: ({ row }) => <span className="font-medium text-fg">{row.original.tag}</span> },
      { accessorKey: 'protocol', header: t.protocol, cell: ({ row }) => <Badge tone="brand">{row.original.protocol.toUpperCase()}</Badge> },
      { id: 'target', header: t.address, cell: ({ row }) => <code className="mono text-xs text-muted">{row.original.host}:{row.original.port}</code> },
      { accessorKey: 'success', header: t.status, cell: ({ row }) => row.original.success ? <Badge tone="success" dot>OK</Badge> : <Badge tone="danger" dot>{row.original.error || 'FAIL'}</Badge> },
      { accessorKey: 'latencyMs', header: t.latency, cell: ({ row }) => <span className="text-xs text-fg tabular-nums">{row.original.latencyMs ?? '—'} ms</span> },
      { accessorKey: 'checkedAt', header: t.createdAt, cell: ({ row }) => <span className="text-xs text-muted">{new Date(row.original.checkedAt).toLocaleString()}</span> },
    ],
    [t],
  );

  return (
    <>
      <PageHeader eyebrow={t.infrastructure} title={t.healthChecks} subtitle={t.healthChecksSubtitle} icon="pulse"
        actions={<Button icon="refresh" onClick={load} loading={loading}>{t.refresh}</Button>} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t.healthChecks} value={latest.length} icon="activity" tone="brand" />
        <StatCard label={t.onlineNodes} value={success} icon="checkCircle" tone="success" />
        <StatCard label={t.latency} value={`${avg} ms`} icon="gauge" tone="cyan" />
      </div>

      <Card className="mt-5 mb-5 p-4">
        <select value={nodeId} onChange={(e) => setNodeId(e.target.value)} className="field w-auto min-w-[240px]">
          <option value="">{t.all} {t.nodes}</option>
          {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      </Card>

      <DataTable data={latest} columns={columns} loading={loading} getRowId={(row) => row.id} />
    </>
  );
}
