'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, Field, IconButton, Modal, PageHeader, Toggle } from '../../components/ui';

type InboundRow = {
  id: string;
  tag: string;
  protocol: string;
  port: number;
  transport?: string;
  security?: string;
  enabled?: boolean;
  settings?: Record<string, unknown>;
  node?: { name: string } | null;
};

type InboundForm = {
  tag: string;
  protocol: string;
  port: number;
  nodeId: string;
  transport: string;
  security: string;
  enabled: boolean;
  settingsText: string;
};

const emptyForm: InboundForm = {
  tag: '', protocol: 'vless', port: 443, nodeId: '',
  transport: 'tcp', security: 'reality', enabled: true, settingsText: '{}',
};

export default function InboundsPage() {
  const { t } = useLang();
  const [inbounds, setInbounds] = useState<InboundRow[]>([]);
  const [nodes, setNodes] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<InboundForm>(emptyForm);
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

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setOpen(true);
  };

  const startEdit = (row: InboundRow) => {
    setEditing(row.id);
    setForm({
      tag: row.tag,
      protocol: row.protocol,
      port: row.port,
      nodeId: '',
      transport: row.transport || 'tcp',
      security: row.security || 'reality',
      enabled: row.enabled ?? true,
      settingsText: JSON.stringify(row.settings || {}, null, 2),
    });
    setError('');
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(form.settingsText || '{}');
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error(t.invalidJson);
    } catch {
      setError(t.invalidJson);
      return;
    }
    setBusy(true);
    const body = {
      tag: form.tag,
      protocol: form.protocol,
      port: Number(form.port),
      transport: form.transport,
      security: form.security,
      enabled: form.enabled,
      settings,
      ...(editing ? {} : { nodeId: form.nodeId || undefined }),
    };
    try {
      if (editing) await api.patch(`/api/inbounds/${editing}`, body);
      else await api.post('/api/inbounds', body);
      setForm(emptyForm);
      setEditing(null);
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
        accessorKey: 'enabled',
        header: t.enabled,
        cell: ({ row }) => row.original.enabled === false
          ? <Badge tone="neutral" dot>{t.disabled}</Badge>
          : <Badge tone="success" dot>{t.enabled}</Badge>,
      },
      {
        id: 'actions',
        header: t.actions,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <IconButton icon="edit" label={t.edit} onClick={() => startEdit(row.original)} />
            <IconButton icon="trash" label={t.delete} tone="danger" onClick={() => remove(row.original.id)} />
          </div>
        ),
      },
    ],
    [t],
  );

  return (
    <>
      <PageHeader
        eyebrow={t.infrastructure}
        title={t.inbounds}
        subtitle={t.exposeProtocol}
        icon="plug"
        actions={<Button icon="plus" variant="primary" onClick={startCreate}>{t.newInbound}</Button>}
      />

      {error && !open && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      <DataTable data={inbounds} columns={columns} loading={loading} getRowId={(row) => row.id} />

      <Modal
        open={open}
        onClose={() => { setOpen(false); setEditing(null); setForm(emptyForm); }}
        title={editing ? t.editInbound : t.newInbound}
        subtitle={t.exposeProtocol}
        icon={<Icon name="plug" size={16} />}
        size="lg"
        footer={<><Button onClick={() => setOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="check" onClick={submit} loading={busy}>{editing ? t.save : t.create}</Button></>}
      >
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              <Icon name="alert" size={14} /> {error}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.name}><input placeholder="vless-reality-in" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} className="field" required /></Field>
            <Field label={t.port}><input type="number" min={1} max={65535} value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} className="field" required /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.protocol}>
              <select value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })} className="field">
                <option value="vless">VLESS</option><option value="vmess">VMess</option>
                <option value="trojan">Trojan</option><option value="shadowsocks">Shadowsocks</option>
              </select>
            </Field>
            <Field label={t.node} hint={!editing ? t.leaveEmptyGlobal : undefined}>
              <select value={form.nodeId} onChange={(e) => setForm({ ...form, nodeId: e.target.value })} className="field" disabled={Boolean(editing)}>
                <option value="">{t.global}</option>
                {nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.transport}><input value={form.transport} onChange={(e) => setForm({ ...form, transport: e.target.value })} className="field" /></Field>
            <Field label={t.security}><input value={form.security} onChange={(e) => setForm({ ...form, security: e.target.value })} className="field" /></Field>
          </div>
          <Field label={t.settingsJson}>
            <textarea rows={6} value={form.settingsText} onChange={(e) => setForm({ ...form, settingsText: e.target.value })} className="field mono text-[11px]" />
          </Field>
          <Toggle checked={form.enabled} onChange={(value) => setForm({ ...form, enabled: value })} label={t.enabled} />
        </form>
      </Modal>
    </>
  );
}
