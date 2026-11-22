'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';

type NodeRow = {
  id: string;
  name: string;
  address: string;
  port: number;
  status: string;
};

export default function NodesPage() {
  const { t } = useLang();
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/nodes');
      setNodes(Array.isArray(data) ? data : data.data || []);
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
      await api.post('/api/nodes', { name, address });
      setName('');
      setAddress('');
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const apply = async (id: string) => {
    await api.post(`/api/nodes/${id}/apply`, {});
    load();
  };

  const restart = async (id: string) => {
    await api.post(`/api/nodes/${id}/restart`, {});
    load();
  };

  const columns = useMemo<ColumnDef<NodeRow>[]>(
    () => [
      { accessorKey: 'name', header: t.name },
      {
        id: 'address',
        header: t.address,
        accessorFn: (row) => `${row.address}:${row.port}`,
      },
      {
        accessorKey: 'status',
        header: t.status,
        cell: ({ row }) => (
          <span className={row.original.status === 'ONLINE' ? 'text-green-500' : 'text-gray-500'}>
            {row.original.status}
          </span>
        ),
      },
      {
        id: 'actions',
        header: t.actions,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="space-x-3">
            <button onClick={() => apply(row.original.id)} className="text-blue-500">
              {t.apply}
            </button>
            <button onClick={() => restart(row.original.id)} className="text-orange-500">
              {t.restart}
            </button>
          </div>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.nodes}</h1>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <form onSubmit={create} className="flex flex-wrap gap-2 rounded border bg-white p-4 dark:bg-gray-900">
        <input
          placeholder={t.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border px-3 py-2 dark:bg-gray-800"
          required
        />
        <input
          placeholder={t.address}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="rounded border px-3 py-2 dark:bg-gray-800"
          required
        />
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
          {t.create}
        </button>
      </form>

      <DataTable data={nodes} columns={columns} loading={loading} getRowId={(row) => row.id} />
    </div>
  );
}
