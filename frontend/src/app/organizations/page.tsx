'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  branding: unknown;
  _count?: { users: number; nodes: number };
  createdAt: string;
};

type Form = { name: string; slug: string; branding: string };

const empty: Form = { name: '', slug: '', branding: '{}' };

export default function OrganizationsPage() {
  const { t } = useLang();
  const [rows, setRows] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Form>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/organizations');
      setRows(Array.isArray(data) ? data : data.data || []);
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
    try {
      const payload = { name: form.name, slug: form.slug, branding: JSON.parse(form.branding) };
      if (editing) await api.patch(`/api/organizations/${editing}`, payload);
      else await api.post('/api/organizations', payload);
      setForm(empty);
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const startEdit = (row: OrgRow) => {
    setEditing(row.id);
    setForm({
      name: row.name,
      slug: row.slug,
      branding: JSON.stringify(row.branding || {}, null, 2),
    });
  };

  const remove = async (id: string) => {
    if (!confirm(t.confirmDelete)) return;
    await api.delete(`/api/organizations/${id}`);
    await load();
  };

  const columns = useMemo<ColumnDef<OrgRow>[]>(
    () => [
      { accessorKey: 'name', header: t.name },
      { accessorKey: 'slug', header: 'Slug' },
      {
        accessorKey: 'users',
        header: t.users,
        enableSorting: false,
        cell: ({ row }) => row.original._count?.users ?? '-',
      },
      {
        accessorKey: 'nodes',
        header: t.nodes,
        enableSorting: false,
        cell: ({ row }) => row.original._count?.nodes ?? '-',
      },
      {
        id: 'actions',
        header: t.actions,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="space-x-3">
            <button onClick={() => startEdit(row.original)} className="text-blue-500">{t.edit}</button>
            <button onClick={() => remove(row.original.id)} className="text-red-500">{t.delete}</button>
          </div>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.organizations}</h1>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <form onSubmit={submit} className="flex flex-wrap gap-2 rounded border bg-white p-4 dark:bg-gray-900">
        <input
          placeholder={t.name}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded border px-3 py-2 dark:bg-gray-800"
          required
        />
        <input
          placeholder="Slug"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          className="rounded border px-3 py-2 dark:bg-gray-800"
          required
        />
        <input
          placeholder="Branding JSON"
          value={form.branding}
          onChange={(e) => setForm({ ...form, branding: e.target.value })}
          className="w-56 rounded border px-3 py-2 font-mono text-xs dark:bg-gray-800"
        />
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
          {editing ? t.save : t.create}
        </button>
        {editing && (
          <button type="button" onClick={() => { setEditing(null); setForm(empty); }} className="rounded border px-4 py-2">
            {t.cancel}
          </button>
        )}
      </form>
      <DataTable data={rows} columns={columns} loading={loading} getRowId={(row) => row.id} />
    </div>
  );
}
