'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Card, PageHeader } from '../../components/ui';

type AuditRow = {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export default function AuditPage() {
  const { t } = useLang();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState('');
  const [userId, setUserId] = useState('');
  const [appliedUserId, setAppliedUserId] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pageIndex + 1), limit: String(pageSize) });
    if (entity) params.set('entity', entity);
    if (appliedUserId) params.set('userId', appliedUserId);
    try {
      const data = await api.get(`/api/audit?${params.toString()}`);
      setRows(data.data || []);
      setTotal(Number(data.total || 0));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [entity, appliedUserId, pageIndex, pageSize]);

  useEffect(() => {
    if (!isLoggedIn()) window.location.href = '/login';
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedUserId(userId.trim());
      setPageIndex(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [userId, entity]);

  useEffect(() => {
    if (isLoggedIn()) load();
  }, [load]);

  const columns = useMemo<ColumnDef<AuditRow>[]>(
    () => [
      {
        accessorKey: 'action',
        header: t.action,
        cell: ({ row }) => <Badge tone="brand">{row.original.action}</Badge>,
      },
      {
        accessorKey: 'entity',
        header: t.entity,
        cell: ({ row }) => <Badge tone="cyan">{row.original.entity}</Badge>,
      },
      {
        accessorKey: 'entityId',
        header: t.entityId,
        cell: ({ row }) => row.original.entityId
          ? <code className="mono text-[11px] text-muted" title={row.original.entityId}>{row.original.entityId.slice(0, 8)}…</code>
          : <span className="text-subtle">—</span>,
      },
      {
        accessorKey: 'userId',
        header: t.user,
        cell: ({ row }) => row.original.userId
          ? <code className="mono text-[11px] text-muted" title={row.original.userId}>{row.original.userId.slice(0, 8)}…</code>
          : <span className="text-subtle">—</span>,
      },
      { accessorKey: 'ip', header: t.ip, cell: ({ row }) => <span className="mono text-[11px] text-muted">{row.original.ip || '—'}</span> },
      {
        accessorKey: 'metadata',
        header: t.metadata,
        enableSorting: false,
        cell: ({ row }) => row.original.metadata
          ? <code className="mono text-[10px] text-subtle">{JSON.stringify(row.original.metadata).slice(0, 60)}…</code>
          : <span className="text-subtle">—</span>,
      },
      {
        accessorKey: 'createdAt',
        header: t.createdAt,
        cell: ({ row }) => <span className="text-xs text-muted">{new Date(row.original.createdAt).toLocaleString()}</span>,
      },
    ],
    [t],
  );

  return (
    <>
      <PageHeader
        eyebrow={t.system}
        title={t.auditLog}
        subtitle={t.auditSubtitle}
        icon="file"
        actions={<Badge tone="neutral">{t.total}: {total}</Badge>}
      />

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select value={entity} onChange={(e) => setEntity(e.target.value)} className="field w-auto min-w-[160px]">
            <option value="">{t.all} {t.entity}</option>
            <option value="User">User</option>
            <option value="Node">Node</option>
            <option value="Inbound">Inbound</option>
          </select>
          <div className="relative min-w-[200px] flex-1">
            <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder={`${t.user} ID`}
              className="field pl-9"
            />
          </div>
          <Badge tone="neutral">{t.total}: {total}</Badge>
        </div>
      </Card>

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
          onPageSizeChange: (size) => { setPageSize(size); setPageIndex(0); },
        }}
      />
    </>
  );
}
