'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';

type AlertRow = {
  id: string;
  status: string;
  title: string;
  message: string | null;
  severity: string | null;
  source: string;
  createdAt: string;
};

type Channels = Record<'telegram' | 'webhook' | 'email' | 'signal', boolean>;

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

  useEffect(() => {
    setPageIndex(0);
  }, [status]);

  const columns = useMemo<ColumnDef<AlertRow>[]>(
    () => [
      {
        accessorKey: 'status',
        header: t.status,
        cell: ({ row }) => (
          <span className={row.original.status === 'resolved' ? 'text-green-500' : 'text-red-500'}>
            {row.original.status}
          </span>
        ),
      },
      { accessorKey: 'title', header: t.title },
      { accessorKey: 'severity', header: t.severity, cell: ({ row }) => row.original.severity || '-' },
      { accessorKey: 'source', header: t.source },
      { accessorKey: 'message', header: t.message, cell: ({ row }) => row.original.message || '-' },
      {
        accessorKey: 'createdAt',
        header: t.createdAt,
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.alerts}</h1>
      {error && <p className="text-sm text-red-500">{error}</p>}

      {channels && (
        <div className="flex flex-wrap gap-3 rounded border bg-white p-3 text-sm dark:bg-gray-900">
          <span className="font-medium">{t.channels}:</span>
          {(Object.keys(channels) as (keyof Channels)[]).map((key) => (
            <span key={key} className={channels[key] ? 'text-green-500' : 'text-gray-400'}>
              {key} {channels[key] ? '✓' : '—'}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded border px-3 py-2 dark:bg-gray-800"
        >
          <option value="">{t.all} {t.status}</option>
          <option value="firing">{t.firing}</option>
          <option value="resolved">{t.resolved}</option>
        </select>
        <span className="text-gray-500">{t.total}: {total}</span>
      </div>

      <DataTable
        data={alerts}
        columns={columns}
        loading={loading}
        getRowId={(row) => row.id}
        hideSearch
        serverPagination={{
          pageIndex,
          pageSize,
          pageCount: Math.max(1, Math.ceil(total / pageSize)),
          onPageChange: setPageIndex,
          onPageSizeChange: (size) => {
            setPageSize(size);
            setPageIndex(0);
          },
        }}
      />
    </div>
  );
}
