'use client';
import { useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';

export default function InboundsPage() {
  const { t } = useLang();
  const [inbounds, setInbounds] = useState<any[]>([]);
  const [nodes, setNodes] = useState<any[]>([]);
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
        <select value={protocol} onChange={(e) => setProtocol(e.target.value)} className="rounded border px-3 py-2 dark:bg-gray-800">
          <option value="vless">VLESS</option>
          <option value="vmess">VMess</option>
          <option value="trojan">Trojan</option>
          <option value="shadowsocks">Shadowsocks</option>
        </select>
        <input
          type="number"
          placeholder={t.port}
          value={port}
          onChange={(e) => setPort(Number(e.target.value))}
          className="w-24 rounded border px-3 py-2 dark:bg-gray-800"
        />
        <select value={nodeId} onChange={(e) => setNodeId(e.target.value)} className="rounded border px-3 py-2 dark:bg-gray-800">
          <option value="">Global</option>
          {nodes.map((node) => (
            <option key={node.id} value={node.id}>{node.name}</option>
          ))}
        </select>
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">{t.create}</button>
      </form>

      <div className="overflow-x-auto rounded border bg-white dark:bg-gray-900">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="p-2 text-left">{t.name}</th>
              <th className="p-2 text-left">Protocol</th>
              <th className="p-2 text-left">{t.port}</th>
              <th className="p-2 text-left">Node</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-4" colSpan={4}>{t.loading}</td></tr>
            ) : inbounds.length === 0 ? (
              <tr><td className="p-4" colSpan={4}>{t.noData}</td></tr>
            ) : (
              inbounds.map((inbound) => (
                <tr key={inbound.id} className="border-b">
                  <td className="p-2">{inbound.tag}</td>
                  <td className="p-2">{inbound.protocol}</td>
                  <td className="p-2">{inbound.port}</td>
                  <td className="p-2">{inbound.node?.name || 'Global'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
