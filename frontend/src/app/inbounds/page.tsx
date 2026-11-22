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
  nodeId?: string | null;
  enabled?: boolean;
  settings?: unknown;
  node?: { name: string } | null;
};

type EditForm = {
  tag: string;
  protocol: string;
  transport: string;
  security: string;
  port: number;
  nodeId: string;
  enabled: boolean;
  settings: string;
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
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>({
    tag: '',
    protocol: 'vless',
    transport: 'tcp',
    security: 'reality',
    port: 443,
    nodeId: '',
    enabled: true,
    settings: '{}',
  });

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
    if (!confirm(t.confirmDelete)) return;
    await api.delete(`/api/inbounds/${id}`);
    load();
  };

  const startEdit = async (id: string) => {
    setError('');
    try {
      const item: InboundRow = await api.get(`/api/inbounds/${id}`);
      setEditing(id);
      setForm({
        tag: item.tag,
        protocol: item.protocol,
        transport: item.transport || 'tcp',
        security: item.security || 'none',
        port: item.port,
        nodeId: item.nodeId || '',
        enabled: item.enabled !== false,
        settings: JSON.stringify(item.settings || {}, null, 2),
      });
    } catch (e: any) {
      setError(e.message);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await api.patch(`/api/inbounds/${editing}`, {
        tag: form.tag,
        protocol: form.protocol,
        transport: form.transport,
        security: form.security,
        port: form.port,
        nodeId: form.nodeId || null,
        enabled: form.enabled,
        settings: JSON.parse(form.settings),
      });
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const columns = useMemo<ColumnDef<InboundRow>[]>(
    () => [
      { accessorKey: 'tag', header: t.name },
      { accessorKey: 'protocol', header: t.protocol },
      { accessorKey: 'port', header: t.port },
      {
        id: 'node',
        header: t.nodes,
        accessorFn: (row) => row.node?.name || 'Global',
        enableSorting: false,
      },
      {
        accessorKey: 'enabled',
        header: t.enabled,
        cell: ({ row }) => (row.original.enabled === false ? '—' : '✓'),
      },
      {
        id: 'actions',
        header: t.actions,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="space-x-3">
            <button onClick={() => startEdit(row.original.id)} className="text-blue-500">
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

      {editing && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={save} className="w-full max-w-lg space-y-3 rounded bg-white p-5 dark:bg-gray-900">
            <h2 className="text-lg font-semibold">{t.edit}</h2>
            <input
              value={form.tag}
              onChange={(e) => setForm({ ...form, tag: e.target.value })}
              className="w-full rounded border px-3 py-2 dark:bg-gray-800"
            />
            <div className="flex flex-wrap gap-2">
              <select
                value={form.protocol}
                onChange={(e) => setForm({ ...form, protocol: e.target.value })}
                className="rounded border px-3 py-2 dark:bg-gray-800"
              >
                {['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'tuic', 'wireguard'].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <input
                value={form.transport}
                onChange={(e) => setForm({ ...form, transport: e.target.value })}
                placeholder={t.transport}
                className="rounded border px-3 py-2 dark:bg-gray-800"
              />
              <input
                value={form.security}
                onChange={(e) => setForm({ ...form, security: e.target.value })}
                placeholder={t.security}
                className="rounded border px-3 py-2 dark:bg-gray-800"
              />
              <input
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
                className="w-24 rounded border px-3 py-2 dark:bg-gray-800"
              />
            </div>
            <select
              value={form.nodeId}
              onChange={(e) => setForm({ ...form, nodeId: e.target.value })}
              className="w-full rounded border px-3 py-2 dark:bg-gray-800"
            >
              <option value="">Global</option>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>{node.name}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />
              {t.enabled}
            </label>
            <textarea
              value={form.settings}
              onChange={(e) => setForm({ ...form, settings: e.target.value })}
              rows={8}
              className="w-full rounded border px-3 py-2 font-mono text-xs dark:bg-gray-800"
              placeholder={t.payload}
            />
            <div className="flex gap-2">
              <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">{t.save}</button>
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
