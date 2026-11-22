'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';

type HostRow = {
  id: string;
  address: string;
  port: number;
  sni?: string | null;
  path?: string | null;
  enabled: boolean;
};

type HostForm = {
  address: string;
  port: number;
  sni: string;
  path: string;
  enabled: boolean;
};

const emptyForm: HostForm = { address: '', port: 443, sni: '', path: '', enabled: true };

export default function HostsPage() {
  const { t } = useLang();
  const [hosts, setHosts] = useState<HostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<HostForm>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/hosts');
      setHosts(Array.isArray(data) ? data : data.data || []);
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const body = {
      address: form.address,
      port: Number(form.port),
      sni: form.sni || undefined,
      path: form.path || undefined,
      enabled: form.enabled,
    };
    try {
      if (editing) await api.patch(`/api/hosts/${editing}`, body);
      else await api.post('/api/hosts', body);
      setForm(emptyForm);
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const startEdit = (host: HostRow) => {
    setEditing(host.id);
    setForm({
      address: host.address,
      port: host.port,
      sni: host.sni || '',
      path: host.path || '',
      enabled: host.enabled,
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm(emptyForm);
  };

  const remove = async (id: string) => {
    if (!confirm(t.confirmDelete)) return;
    try {
      await api.delete(`/api/hosts/${id}`);
      if (editing === id) cancelEdit();
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const columns = useMemo<ColumnDef<HostRow>[]>(
    () => [
      { accessorKey: 'address', header: t.address },
      { accessorKey: 'port', header: t.port },
      { accessorKey: 'sni', header: t.sni },
      { accessorKey: 'path', header: t.path },
      {
        accessorKey: 'enabled',
        header: t.enabled,
        cell: ({ row }) => (row.original.enabled ? '✓' : '—'),
      },
      {
        id: 'actions',
        header: t.actions,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="space-x-3">
            <button onClick={() => startEdit(row.original)} className="text-blue-500">
              {t.edit}
            </button>
            <button onClick={() => remove(row.original.id)} className="text-red-500">
              {t.delete}
            </button>
          </div>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.hosts}</h1>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <form onSubmit={submit} className="flex flex-wrap gap-2 rounded border bg-white p-4 dark:bg-gray-900">
        <input
          placeholder={t.address}
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          className="rounded border px-3 py-2 dark:bg-gray-800"
          required
        />
        <input
          type="number"
          min={1}
          max={65535}
          value={form.port}
          onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
          className="w-24 rounded border px-3 py-2 dark:bg-gray-800"
          required
        />
        <input
          placeholder={t.sni}
          value={form.sni}
          onChange={(e) => setForm({ ...form, sni: e.target.value })}
          className="rounded border px-3 py-2 dark:bg-gray-800"
        />
        <input
          placeholder={t.path}
          value={form.path}
          onChange={(e) => setForm({ ...form, path: e.target.value })}
          className="rounded border px-3 py-2 dark:bg-gray-800"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          {t.enabled}
        </label>
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
          {editing ? t.save : t.create}
        </button>
        {editing && (
          <button type="button" onClick={cancelEdit} className="rounded border px-4 py-2">
            {t.cancel}
          </button>
        )}
      </form>

      <DataTable data={hosts} columns={columns} loading={loading} getRowId={(row) => row.id} />
    </div>
  );
}
