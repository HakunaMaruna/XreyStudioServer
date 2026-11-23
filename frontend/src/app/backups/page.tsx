'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';

type BackupRow = { name: string; size: number; createdAt: string };

function formatSize(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export default function BackupsPage() {
  const { t } = useLang();
  const [rows, setRows] = useState<BackupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/backups');
      setRows(data.data || []);
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
      await api.post('/api/backups');
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
    try {
      await api.delete(`/api/backups/${encodeURIComponent(name)}`);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const restore = async (name: string) => {
    if (!window.confirm(t.confirmRestore)) return;
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

  const columns = useMemo<ColumnDef<BackupRow>[]>(
    () => [
      { accessorKey: 'name', header: t.name, cell: ({ row }) => <code>{row.original.name}</code> },
      {
        accessorKey: 'size',
        header: t.size,
        cell: ({ row }) => formatSize(row.original.size),
      },
      {
        accessorKey: 'createdAt',
        header: t.createdAt,
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
      },
      {
        id: 'actions',
        header: t.actions,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex gap-3">
            <button
              onClick={() => download(row.original.name)}
              className="text-blue-500"
              disabled={busy}
            >
              {t.download}
            </button>
            <button
              onClick={() => restore(row.original.name)}
              className="text-orange-500"
              disabled={busy}
            >
              {t.restore}
            </button>
            <button
              onClick={() => remove(row.original.name)}
              className="text-red-500"
              disabled={busy}
            >
              {t.delete}
            </button>
          </div>
        ),
      },
    ],
    [t, busy],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t.backups}</h1>
        <button
          onClick={create}
          disabled={busy}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {t.createBackup}
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {notice && <p className="text-sm text-green-500">{notice}</p>}
      <DataTable
        data={rows}
        columns={columns}
        loading={loading}
        getRowId={(row) => row.name}
        hideSearch
      />
    </div>
  );
}
