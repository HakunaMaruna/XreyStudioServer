'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';

type InboundRow = {
  id: string;
  tag: string;
  protocol: string;
  port: number;
  transport?: string;
  security?: string;
  node?: { name: string } | null;
};

export default function InboundsPage() {
  const { t } = useLang();
  const [inbounds, setInbounds] = useState<InboundRow[]>([]);
  const [nodes, setNodes] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [tag, setTag] = useState('');
  const [protocol, setProtocol] = useState('vless');
  const [port, setPort] = useState(443);
  const [nodeId, setNodeId] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [ib, nd] = await Promise.all([api.get('/api/inbounds'), api.get('/api/nodes')]);
      setInbounds(Array.isArray(ib) ? ib : ib.data || []);
      setNodes(Array.isArray(nd) ? nd : nd.data || []);
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
      await api.post('/api/inbounds', {
        tag,
        protocol,
        port,
        nodeId: nodeId || undefined,
        transport: 'tcp',
        security: 'reality',
        settings: { clients: [] },
      });
      setTag('');
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete inbound?')) return;
    await api.delete(`/api/inbounds/${id}`);
    load();
  };

  const columns = useMemo<ColumnDef<InboundRow>[]>(
    () => [
      { accessorKey: 'tag', header: t.name },
      { accessorKey: 'protocol', header: 'Protocol' },
      { accessorKey: 'port', header: t.port },
      {
        id: 'node',
        header: 'Node',
        accessorFn: (row) => row.node?.name || 'Global',
        enableSorting: false,
      },
      {
        id: 'actions',
        header: t.actions,
        enableSorting: false,
        cell: ({ row }) => (
          <button onClick={() => remove(row.original.id)} className="text-red-500">
            {t.delete}
          </button>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.inbounds}</h1>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <form onSubmit={create} className="flex flex-wrap gap-2 rounded border bg-white p-4 dark:bg-gray-900">
        <input
          placeholder={t.name}
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          className="rounded border px-3 py-2 dark:bg-gray-800"
          required
        />
        <select
          value={protocol}
          onChange={(e) => setProtocol(e.target.value)}
          className="rounded border px-3 py-2 dark:bg-gray-800"
        >
          <option value="vless">VLESS</option>
          <option value="vmess">VMess</option>
          <option value="trojan">Trojan</option>
          <option value="shadowsocks">Shadowsocks</option>
        </select>
        <input
          type="number"
          min={1}
          max={65535}
          placeholder={t.port}
          value={port}
          onChange={(e) => setPort(Number(e.target.value))}
          className="w-24 rounded border px-3 py-2 dark:bg-gray-800"
        />
        <select
          value={nodeId}
          onChange={(e) => setNodeId(e.target.value)}
          className="rounded border px-3 py-2 dark:bg-gray-800"
        >
          <option value="">Global</option>
          {nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
          {t.create}
        </button>
      </form>

      <DataTable data={inbounds} columns={columns} loading={loading} getRowId={(row) => row.id} />
    </div>
  );
}
