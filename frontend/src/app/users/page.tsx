'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';

type UserRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  trafficLimit: string | number;
};

export default function UsersPage() {
  const { t } = useLang();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [trafficLimit, setTrafficLimit] = useState(100);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editRole, setEditRole] = useState('USER');
  const [editStatus, setEditStatus] = useState('ACTIVE');
  const [editTraffic, setEditTraffic] = useState(100);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/users');
      setUsers(data.data || data);
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

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/api/users', { email, password, trafficLimit: trafficLimit * 1024 ** 3 });
      setEmail('');
      setPassword('');
      setTrafficLimit(100);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete user?')) return;
    await api.delete(`/api/users/${id}`);
    load();
  };

  const startEdit = (user: UserRow) => {
    setEditing(user);
    setEditRole(user.role);
    setEditStatus(user.status);
    setEditTraffic(Math.round(Number(user.trafficLimit) / 1024 ** 3));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await api.patch(`/api/users/${editing.id}`, {
        role: editRole,
        status: editStatus,
        trafficLimit: editTraffic * 1024 ** 3,
      });
      setEditing(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const columns = useMemo<ColumnDef<UserRow>[]>(
    () => [
      { accessorKey: 'email', header: t.email },
      { accessorKey: 'role', header: t.role },
      { accessorKey: 'status', header: t.status },
      {
        accessorKey: 'trafficLimit',
        header: t.trafficLimit,
        cell: ({ row }) => `${Math.round(Number(row.original.trafficLimit) / 1024 ** 3)} GB`,
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
      <h1 className="text-2xl font-bold">{t.users}</h1>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <form onSubmit={create} className="flex flex-wrap gap-2 rounded border bg-white p-4 dark:bg-gray-900">
        <input
          type="email"
          placeholder={t.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border px-3 py-2 dark:bg-gray-800"
          required
        />
        <input
          type="password"
          minLength={6}
          placeholder={t.password}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border px-3 py-2 dark:bg-gray-800"
          required
        />
        <input
          type="number"
          min={1}
          placeholder={t.trafficLimit}
          value={trafficLimit}
          onChange={(e) => setTrafficLimit(Number(e.target.value))}
          className="w-28 rounded border px-3 py-2 dark:bg-gray-800"
        />
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
          {t.create}
        </button>
      </form>

      <DataTable data={users} columns={columns} loading={loading} getRowId={(row) => row.id} />

      {editing && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={save} className="w-full max-w-md space-y-3 rounded bg-white p-5 dark:bg-gray-900">
            <h2 className="text-lg font-semibold">{editing.email}</h2>
            <select
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
              className="w-full rounded border px-3 py-2 dark:bg-gray-800"
            >
              <option value="ADMIN">ADMIN</option>
              <option value="OPERATOR">OPERATOR</option>
              <option value="USER">USER</option>
            </select>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
              className="w-full rounded border px-3 py-2 dark:bg-gray-800"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="DISABLED">DISABLED</option>
            </select>
            <input
              type="number"
              min={0}
              value={editTraffic}
              onChange={(e) => setEditTraffic(Number(e.target.value))}
              className="w-full rounded border px-3 py-2 dark:bg-gray-800"
            />
            <div className="flex gap-2">
              <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
                {t.save}
              </button>
              <button type="button" onClick={() => setEditing(null)} className="rounded border px-4 py-2">
                {t.cancel}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
