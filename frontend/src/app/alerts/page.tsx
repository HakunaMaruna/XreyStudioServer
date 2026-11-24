'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon, type IconName } from '../../components/icons';
import { Badge, Card, PageHeader, cn } from '../../components/ui';

type AlertRow = {
  id: string; status: string; title: string; message: string | null;
  severity: string | null; source: string; createdAt: string;
};
type Channels = Record<'telegram' | 'webhook' | 'email' | 'signal', boolean>;

const channelIcons: Record<keyof Channels, IconName> = {
  telegram: 'zap', webhook: 'link', email: 'box', signal: 'pulse',
};

export default function AlertsPage() {
  const { t } = useLang();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [channels, setChannels] = useState<Channels | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pageIndex + 1), limit: String(pageSize) });
    if (status) params.set('status', status);
    try {
      const data = await api.get(`/api/notifications/alerts?${params.toString()}`);
      setAlerts(data.data || []);
      setTotal(Number(data.total || 0));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [status, pageIndex, pageSize]);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    load();
    api.get<Channels>('/api/notifications/channels').then(setChannels).catch(() => undefined);
  }, [load]);

  useEffect(() => { setPageIndex(0); }, [status]);

  const columns = useMemo<ColumnDef<AlertRow>[]>(
    () => [
      {
        accessorKey: 'status', header: t.status,
        cell: ({ row }) => row.original.status === 'resolved'
          ? <Badge tone="success" dot>{t.resolved}</Badge>
          : <Badge tone="danger" dot>{t.firing}</Badge>,
      },
      { accessorKey: 'title', header: t.title, cell: ({ row }) => <p className="font-medium text-fg">{row.original.title}</p> },
      { accessorKey: 'severity', header: t.severity, cell: ({ row }) => <Badge tone={row.original.severity === 'critical' ? 'danger' : 'warning'}>{row.original.severity || '—'}</Badge> },
      { accessorKey: 'source', header: t.source, cell: ({ row }) => <span className="mono text-[11px] text-muted">{row.original.source}</span> },
      { accessorKey: 'message', header: t.message, cell: ({ row }) => <span className="text-xs text-muted">{row.original.message || '—'}</span> },
      { accessorKey: 'createdAt', header: t.createdAt, cell: ({ row }) => <span className="text-xs text-muted">{new Date(row.original.createdAt).toLocaleString()}</span> },
    ],
    [t],
  );

  const enabledCount = channels ? Object.values(channels).filter(Boolean).length : 0;

  return (
    <>
      <PageHeader
        eyebrow={t.overview}
        title={t.alerts}
        subtitle={t.alertsSubtitle}
        icon="bell"
        actions={<Badge tone={total > 0 ? 'warning' : 'success'} dot>{total} {t.events}</Badge>}
      />

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {channels ? (Object.keys(channels) as (keyof Channels)[]).map((key) => (
          <Card key={key} className="flex items-center gap-3 p-4">
            <div className={cn('grid h-9 w-9 place-items-center rounded-lg border', channels[key] ? 'border-success/25 bg-success/10 text-success' : 'border-line bg-surface-2 text-subtle')}>
              <Icon name={channelIcons[key]} size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium capitalize text-fg">{key}</p>
              <p className="text-[10px] text-subtle">{channels[key] ? t.connected : t.notConfigured}</p>
            </div>
            <span className={cn('h-2 w-2 rounded-full', channels[key] ? 'bg-success shadow-[0_0_8px_var(--success)]' : 'bg-line-2')} />
          </Card>
        )) : (
          <div className="col-span-full py-4 text-center text-xs text-subtle">{t.loadingChannels}</div>
        )}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="field w-auto min-w-[180px]">
          <option value="">{t.all} {t.status}</option>
          <option value="firing">{t.firing}</option>
          <option value="resolved">{t.resolved}</option>
        </select>
        <Badge tone="neutral">{t.total}: {total}</Badge>
        <Badge tone="brand">{enabledCount}/4 {t.channelsActive}</Badge>
      </div>

      <DataTable
        data={alerts}
        columns={columns}
        loading={loading}
        getRowId={(row) => row.id}
        hideSearch
        serverPagination={{
          pageIndex, pageSize,
          pageCount: Math.max(1, Math.ceil(total / pageSize)),
          onPageChange: setPageIndex,
          onPageSizeChange: (size) => { setPageSize(size); setPageIndex(0); },
        }}
      />
    </>
  );
}
