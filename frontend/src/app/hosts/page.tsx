'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, Field, IconButton, Modal, PageHeader, Toggle } from '../../components/ui';

type HostRow = { id: string; address: string; port: number; sni?: string | null; path?: string | null; enabled: boolean };
type HostForm = { address: string; port: number; sni: string; path: string; enabled: boolean };

const emptyForm: HostForm = { address: '', port: 443, sni: '', path: '', enabled: true };

export default function HostsPage() {
  const { t } = useLang();
  const [hosts, setHosts] = useState<HostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<HostForm>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/hosts');
      setHosts(Array.isArray(data) ? data : data.data || []);
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
    setBusy(true);
    const body = {
      address: form.address,
      port: Number(form.port),
      sni: form.sni || undefined,
      path: form.path || undefined,
      enabled: form.enabled,
    };
    try {
      if (editing) await api.patch(`/api/hosts/${editing}`, body);
      else await api.post('/api/hosts', body);
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

  const startEdit = (host: HostRow) => {
    setEditing(host.id);
    setForm({ address: host.address, port: host.port, sni: host.sni || '', path: host.path || '', enabled: host.enabled });
    setOpen(true);
  };

  const remove = async (id: string) => {
    if (!confirm(t.confirmDelete)) return;
    try {
      await api.delete(`/api/hosts/${id}`);
      if (editing === id) { setEditing(null); setForm(emptyForm); }
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const columns = useMemo<ColumnDef<HostRow>[]>(
    () => [
      {
        accessorKey: 'address',
        header: t.address,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-2 text-brand"><Icon name="globe" size={15} /></div>
            <div>
              <p className="mono font-medium text-fg">{row.original.address}</p>
              <p className="text-[10px] text-subtle">{row.original.sni || t.noSni}</p>
            </div>
          </div>
        ),
      },
      { accessorKey: 'port', header: t.port, cell: ({ row }) => <span className="mono text-xs text-muted">{row.original.port}</span> },
      { accessorKey: 'sni', header: t.sni, cell: ({ row }) => row.original.sni ? <span className="mono text-xs text-muted">{row.original.sni}</span> : <span className="text-subtle">—</span> },
      { accessorKey: 'path', header: t.path, cell: ({ row }) => row.original.path ? <code className="mono text-[11px] text-cyan">{row.original.path}</code> : <span className="text-subtle">—</span> },
      {
        accessorKey: 'enabled', header: t.enabled,
        cell: ({ row }) => row.original.enabled ? <Badge tone="success" dot>{t.enabled}</Badge> : <Badge tone="neutral" dot>{t.disabled}</Badge>,
      },
      {
        id: 'actions', header: t.actions, enableSorting: false,
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
        eyebrow="Infrastructure"
        title={t.hosts}
        subtitle={t.hostsSubtitle}
        icon="globe"
        actions={<Button icon="plus" variant="primary" onClick={() => { setEditing(null); setForm(emptyForm); setOpen(true); }}>{t.newHost}</Button>}
      />

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      <DataTable data={hosts} columns={columns} loading={loading} getRowId={(row) => row.id} />

      <Modal open={open} onClose={() => { setOpen(false); setEditing(null); setForm(emptyForm); }} title={editing ? t.editHost : t.newHost} subtitle={t.routingDestination} icon={<Icon name="globe" size={16} />}
        footer={<><Button onClick={() => setOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="check" onClick={submit} loading={busy}>{editing ? t.save : t.create}</Button></>}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.address}><input placeholder="example.com" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="field" required /></Field>
            <Field label={t.port}><input type="number" min={1} max={65535} value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} className="field" required /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.sni}><input placeholder="sni.example.com" value={form.sni} onChange={(e) => setForm({ ...form, sni: e.target.value })} className="field" /></Field>
            <Field label={t.path}><input placeholder="/path" value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} className="field" /></Field>
          </div>
          <Toggle checked={form.enabled} onChange={(value) => setForm({ ...form, enabled: value })} label={t.enabled} />
        </form>
      </Modal>
    </>
  );
}
