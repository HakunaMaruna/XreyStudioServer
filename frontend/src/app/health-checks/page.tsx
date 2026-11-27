// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, PageHeader, SectionTitle, StatCard } from '../../components/ui';

type QuarantineRow = {
  id: string; address: string; nodeId: string | null; reason: string; until: string; createdAt: string;
};

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
  bytes?: number | null;
  error: string | null;
  checkedAt: string;
};

export default function HealthChecksPage() {
  const { t, lang } = useLang();
  const [rows, setRows] = useState<Check[]>([]);
  const [nodes, setNodes] = useState<{ id: string; name: string }[]>([]);
  const [nodeId, setNodeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [quarantine, setQuarantine] = useState<QuarantineRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (nodeId) params.set('nodeId', nodeId);
      const [data, quarantined] = await Promise.all([
        api.get(`/api/health-checks?${params.toString()}`),
        api.get<QuarantineRow[]>('/api/resilience/quarantine').catch(() => []),
      ]);
      setRows(Array.isArray(data) ? data : data.data || []);
      setQuarantine(Array.isArray(quarantined) ? quarantined : (quarantined as any).data || []);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [nodeId]);

  const autoQuarantine = async () => {
    setBusy(true);
    try {
      await api.post('/api/resilience/auto-quarantine', {});
      await load();
    } catch { /* keep current view */ }
    finally { setBusy(false); }
  };

  const release = async (address: string) => {
    setBusy(true);
    try {
      await api.delete(`/api/resilience/quarantine/${encodeURIComponent(address)}`);
      await load();
    } catch { /* keep current view */ }
    finally { setBusy(false); }
  };

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
      { accessorKey: 'bytes', header: lang === 'ru' ? 'Байты' : 'Bytes', cell: ({ row }) => <span className="text-xs text-fg tabular-nums">{row.original.bytes ?? '—'}</span> },
      { accessorKey: 'checkedAt', header: t.createdAt, cell: ({ row }) => <span className="text-xs text-muted">{new Date(row.original.checkedAt).toLocaleString()}</span> },
    ],
    [t],
  );

  return (
    <>
      <PageHeader eyebrow={t.infrastructure} title={t.healthChecks} subtitle={t.healthChecksSubtitle} icon="pulse"
        actions={<>
          <Button icon="shield" onClick={autoQuarantine} loading={busy}>{lang === 'ru' ? 'Автокарантин' : 'Auto quarantine'}</Button>
          <Button icon="refresh" onClick={load} loading={loading}>{t.refresh}</Button>
        </>} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t.healthChecks} value={latest.length} icon="activity" tone="brand" />
        <StatCard label={t.onlineNodes} value={success} icon="checkCircle" tone="success" />
        <StatCard label={t.latency} value={`${avg} ms`} icon="gauge" tone="cyan" />
      </div>

      <Card className="mt-5 mb-5 p-4">
        <select aria-label={t.nodes} value={nodeId} onChange={(e) => setNodeId(e.target.value)} className="field w-auto min-w-[240px]">
          <option value="">{t.all} {t.nodes}</option>
          {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      </Card>

      {quarantine.length > 0 && (
        <Card className="mb-5 p-4">
          <SectionTitle title={lang === 'ru' ? 'Карантин выходов' : 'Exit quarantine'} subtitle={lang === 'ru' ? 'Адрес выведен из балансировки до истечения срока' : 'Address excluded from balancers until cooldown expires'} />
          <div className="space-y-2">
            {quarantine.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs">
                <div className="min-w-0">
                  <code className="mono text-fg">{row.address}</code>
                  <span className="ml-2 text-muted">{row.reason}</span>
                  <span className="ml-2 text-subtle">→ {new Date(row.until).toLocaleString()}</span>
                </div>
                <Button size="sm" variant="subtle" loading={busy} onClick={() => release(row.address)}>{lang === 'ru' ? 'Вернуть' : 'Release'}</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <DataTable data={latest} columns={columns} loading={loading} getRowId={(row) => row.id} />
    </>
  );
}
