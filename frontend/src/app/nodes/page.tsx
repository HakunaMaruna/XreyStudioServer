'use client';
import { useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';

export default function NodesPage() {
  const { t } = useLang();
  const [nodes, setNodes] = useState<any[]>([]);
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
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">{t.create}</button>
      </form>

      <div className="overflow-x-auto rounded border bg-white dark:bg-gray-900">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="p-2 text-left">{t.name}</th>
              <th className="p-2 text-left">{t.address}</th>
              <th className="p-2 text-left">{t.status}</th>
              <th className="p-2 text-left">{t.actions}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-4" colSpan={4}>{t.loading}</td></tr>
            ) : nodes.length === 0 ? (
              <tr><td className="p-4" colSpan={4}>{t.noData}</td></tr>
            ) : (
              nodes.map((node) => (
                <tr key={node.id} className="border-b">
                  <td className="p-2">{node.name}</td>
                  <td className="p-2">{node.address}:{node.port}</td>
                  <td className="p-2">
                    <span className={node.status === 'ONLINE' ? 'text-green-500' : 'text-gray-500'}>
                      {node.status}
                    </span>
                  </td>
                  <td className="p-2 space-x-2">
                    <button onClick={() => apply(node.id)} className="text-blue-500">{t.apply}</button>
                    <button onClick={() => restart(node.id)} className="text-orange-500">{t.restart}</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
