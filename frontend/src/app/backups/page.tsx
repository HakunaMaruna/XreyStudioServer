'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, IconButton, PageHeader, formatBytes } from '../../components/ui';

type BackupFile = { name: string; size: number; createdAt: string };

export default function BackupsPage() {
  const { t } = useLang();
  const [items, setItems] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/backups');
      setItems(Array.isArray(data) ? data : data.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post('/api/backups', {});
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const download = async (name: string) => {
    try {
      await api.download(`/api/backups/${encodeURIComponent(name)}/download`, name);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (name: string) => {
    if (!confirm(t.confirmDelete)) return;
    try {
      await api.delete(`/api/backups/${encodeURIComponent(name)}`);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const restore = async (name: string) => {
    if (!confirm(t.confirmRestore)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post(`/api/backups/${encodeURIComponent(name)}/restore`, { confirm: true });
      setNotice(t.restored);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const columns = useMemo<ColumnDef<BackupFile>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t.name,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-brand/25 bg-brand-soft text-brand"><Icon name="file" size={15} /></div>
            <code className="mono text-xs text-fg">{row.original.name}</code>
          </div>
        ),
      },
      { accessorKey: 'size', header: t.size, cell: ({ row }) => <Badge tone="neutral">{formatBytes(row.original.size)}</Badge> },
      {
        accessorKey: 'createdAt',
        header: t.createdAt,
        cell: ({ row }) => <span className="text-xs text-muted">{new Date(row.original.createdAt).toLocaleString()}</span>,
      },
      {
        id: 'actions',
        header: t.actions,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <IconButton icon="download" label={t.download} onClick={() => download(row.original.name)} />
            <IconButton icon="upload" label={t.restore} onClick={() => restore(row.original.name)} />
            <IconButton icon="trash" label={t.delete} tone="danger" onClick={() => remove(row.original.name)} />
          </div>
        ),
      },
    ],
    [t],
  );

  return (
    <>
      <PageHeader
        eyebrow={t.system}
        title={t.backups}
        subtitle={t.backupsSubtitle}
        icon="database"
        actions={<Button icon="plus" variant="primary" onClick={create} loading={busy}>{t.createBackup}</Button>}
      />

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}
      {notice && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-xs text-success">
          <Icon name="checkCircle" size={15} /> {notice}
        </div>
      )}

      {loading ? (
        <Card className="py-20 text-center text-xs text-muted">{t.loading}</Card>
      ) : items.length === 0 ? (
        <Card className="py-20 text-center">
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface-2 text-subtle"><Icon name="database" size={20} /></div>
          <p className="text-sm font-medium text-fg">{t.noBackups}</p>
          <p className="mt-1 text-xs text-muted">{t.backupsSubtitle}</p>
        </Card>
      ) : (
        <DataTable data={items} columns={columns} loading={loading} getRowId={(row) => row.name} />
      )}
    </>
  );
}
