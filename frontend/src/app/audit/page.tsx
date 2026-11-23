'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';

type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  userId: string | null;
  ip: string | null;
  metadata: unknown;
  createdAt: string;
};

export default function AuditPage() {
  const { t } = useLang();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pageIndex + 1), limit: String(pageSize) });
    if (entity) params.set('entity', entity);
    if (action) params.set('action', action);
    try {
      const data = await api.get(`/api/audit?${params.toString()}`);
      setRows(data.data || []);
      setTotal(Number(data.total || 0));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [entity, action, pageIndex, pageSize]);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    load();
  }, [load]);

  useEffect(() => {
    setPageIndex(0);
  }, [entity, action]);

  const exportCsv = async () => {
    const params = new URLSearchParams();
    if (entity) params.set('entity', entity);
    if (action) params.set('action', action);
    const query = params.toString();
    try {
      await api.downloadCsv(`/api/audit/export.csv${query ? `?${query}` : ''}`, 'audit.csv');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const columns = useMemo<ColumnDef<AuditRow>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: t.createdAt,
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
      },
      { accessorKey: 'action', header: t.action },
      { accessorKey: 'entity', header: t.entity },
      { accessorKey: 'entityId', header: t.objectId, cell: ({ row }) => row.original.entityId || '-' },
      { accessorKey: 'userId', header: t.user, cell: ({ row }) => row.original.userId || '-' },
      { accessorKey: 'ip', header: 'IP', cell: ({ row }) => row.original.ip || '-' },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.audit}</h1>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          placeholder={t.entity}
          className="rounded border px-3 py-2 dark:bg-gray-800"
        />
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder={t.action}
          className="rounded border px-3 py-2 dark:bg-gray-800"
        />
        <span className="text-gray-500">{t.total}: {total}</span>
        <button onClick={exportCsv} className="ml-auto rounded bg-blue-600 px-3 py-2 text-white text-sm">
          {t.exportCsv}
        </button>
      </div>
      <DataTable
        data={rows}
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
