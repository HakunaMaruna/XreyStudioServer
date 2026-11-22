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

type RevisionRow = {
  id: string;
  version: number;
  applied: boolean;
  createdAt: string;
};

export default function NodesPage() {
  const { t } = useLang();
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [revisionsNode, setRevisionsNode] = useState<NodeRow | null>(null);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [logsNode, setLogsNode] = useState<NodeRow | null>(null);
  const [logService, setLogService] = useState('xray');
  const [logLines, setLogLines] = useState(200);
  const [logOutput, setLogOutput] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);

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

  const openRevisions = async (node: NodeRow) => {
    setRevisionsNode(node);
    setRevisions([]);
    setError('');
    setRevisionsLoading(true);
    try {
      const data = await api.get(`/api/nodes/${node.id}/revisions`);
      setRevisions(Array.isArray(data) ? data : data.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRevisionsLoading(false);
    }
  };

  const applyRevision = async (revisionId: string) => {
    if (!revisionsNode) return;
    try {
      await api.post(`/api/nodes/${revisionsNode.id}/apply`, { revisionId });
      await openRevisions(revisionsNode);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const rollback = async (revisionId: string) => {
    if (!revisionsNode) return;
    try {
      await api.post(`/api/nodes/${revisionsNode.id}/rollback/${revisionId}`, {});
      await openRevisions(revisionsNode);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const loadLogs = async (node: NodeRow, service = logService, lines = logLines) => {
    setLogsNode(node);
    setLogService(service);
    setLogLines(lines);
    setLogsLoading(true);
    try {
      const data = await api.get(`/api/nodes/${node.id}/logs?service=${service}&lines=${lines}`);
      setLogOutput(data.output || data.error || t.noData);
    } catch (e: any) {
      setLogOutput(e.message);
    } finally {
      setLogsLoading(false);
    }
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
            <button onClick={() => openRevisions(row.original)} className="text-purple-500">
              {t.revisions}
            </button>
            <button onClick={() => loadLogs(row.original)} className="text-teal-500">
              {t.logs}
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

      {revisionsNode && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl space-y-3 rounded bg-white p-5 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {t.revisions} — {revisionsNode.name}
              </h2>
              <button onClick={() => setRevisionsNode(null)} className="rounded border px-3 py-1">
                {t.close}
              </button>
            </div>
            <button
              onClick={() => applyRevision('')}
              className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-40"
              disabled={revisionsLoading}
            >
              {t.apply}
            </button>
            {revisionsLoading ? (
              <p className="text-sm text-gray-500">{t.loading}</p>
            ) : revisions.length === 0 ? (
              <p className="text-sm text-gray-500">{t.noData}</p>
            ) : (
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="p-2 text-left">{t.version}</th>
                      <th className="p-2 text-left">{t.applied}</th>
                      <th className="p-2 text-left">{t.createdAt}</th>
                      <th className="p-2 text-left">{t.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revisions.map((revision) => (
                      <tr key={revision.id} className="border-b">
                        <td className="p-2">v{revision.version}</td>
                        <td className="p-2">{revision.applied ? '✓' : '—'}</td>
                        <td className="p-2">{new Date(revision.createdAt).toLocaleString()}</td>
                        <td className="p-2">
                          <div className="space-x-3">
                            <button onClick={() => applyRevision(revision.id)} className="text-blue-500">
                              {t.apply}
                            </button>
                            <button onClick={() => rollback(revision.id)} className="text-purple-500">
                              {t.rollback}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {logsNode && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl space-y-3 rounded bg-white p-5 dark:bg-gray-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{t.logs} — {logsNode.name}</h2>
              <button onClick={() => setLogsNode(null)} className="rounded border px-3 py-1">
                {t.close}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={logService}
                onChange={(e) => loadLogs(logsNode, e.target.value, logLines)}
                className="rounded border px-3 py-1 dark:bg-gray-800"
              >
                <option value="xray">Xray</option>
                <option value="singbox">sing-box</option>
              </select>
              <select
                value={logLines}
                onChange={(e) => loadLogs(logsNode, logService, Number(e.target.value))}
                className="rounded border px-3 py-1 dark:bg-gray-800"
              >
                {[100, 200, 500, 1000].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <button
                onClick={() => loadLogs(logsNode)}
                className="rounded border px-3 py-1"
                disabled={logsLoading}
              >
                {t.refresh}
              </button>
            </div>
            <pre className="max-h-[60vh] overflow-auto rounded bg-gray-100 p-3 text-xs dark:bg-gray-800">
              {logsLoading ? t.loading : logOutput}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
