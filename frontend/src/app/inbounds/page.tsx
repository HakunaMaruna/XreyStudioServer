'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, Field, IconButton, Modal, PageHeader } from '../../components/ui';

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
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ tag: '', protocol: 'vless', port: 443, nodeId: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    try {
      await api.post('/api/inbounds', {
        tag: form.tag,
        protocol: form.protocol,
        port: Number(form.port),
        nodeId: form.nodeId || undefined,
        transport: 'tcp',
        security: 'reality',
        settings: { clients: [] },
      });
      setForm({ tag: '', protocol: 'vless', port: 443, nodeId: '' });
      setOpen(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(t.confirmDelete)) return;
    await api.delete(`/api/inbounds/${id}`);
    await load();
  };

  const columns = useMemo<ColumnDef<InboundRow>[]>(
    () => [
      {
        accessorKey: 'tag',
        header: t.name,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-2 text-cyan"><Icon name="plug" size={15} /></div>
            <div>
              <p className="font-medium text-fg">{row.original.tag}</p>
              <p className="text-[10px] text-subtle">{row.original.security || t.noSecurity} / {row.original.transport || 'tcp'}</p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'protocol',
        header: t.protocol,
        cell: ({ row }) => <Badge tone="brand">{row.original.protocol.toUpperCase()}</Badge>,
      },
      { accessorKey: 'port', header: t.port, cell: ({ row }) => <span className="mono text-xs text-fg">{row.original.port}</span> },
      {
        id: 'node',
        header: t.node,
        accessorFn: (row) => row.node?.name || t.global,
        enableSorting: false,
        cell: ({ row }) => <span className="text-xs text-muted">{row.original.node?.name || t.global}</span>,
      },
      {
        id: 'actions',
        header: t.actions,
        enableSorting: false,
        cell: ({ row }) => (
          <IconButton icon="trash" label={t.delete} tone="danger" onClick={() => remove(row.original.id)} />
        ),
      },
    ],
    [t],
  );

  return (
    <>
      <PageHeader
        eyebrow="Infrastructure"
        title={t.inbounds}
        subtitle="Listening ports and protocol adapters on your nodes"
        icon="plug"
        actions={<Button icon="plus" variant="primary" onClick={() => setOpen(true)}>{t.newInbound}</Button>}
      />

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      <DataTable data={inbounds} columns={columns} loading={loading} getRowId={(row) => row.id} />

      <Modal open={open} onClose={() => setOpen(false)} title={t.newInbound} subtitle={t.exposeProtocol} icon={<Icon name="plug" size={16} />}
        footer={<><Button onClick={() => setOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="plus" onClick={create} loading={busy}>{t.create}</Button></>}>
        <form onSubmit={create} className="space-y-4">
          <Field label={t.name}><input placeholder="vless-reality-in" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} className="field" required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.protocol}>
              <select value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })} className="field">
                <option value="vless">VLESS</option><option value="vmess">VMess</option>
                <option value="trojan">Trojan</option><option value="shadowsocks">Shadowsocks</option>
              </select>
            </Field>
            <Field label={t.port}><input type="number" min={1} max={65535} value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} className="field" /></Field>
          </div>
          <Field label={t.node} hint={t.leaveEmptyGlobal}>
            <select value={form.nodeId} onChange={(e) => setForm({ ...form, nodeId: e.target.value })} className="field">
              <option value="">{t.global}</option>
              {nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
            </select>
          </Field>
        </form>
      </Modal>
    </>
  );
}
