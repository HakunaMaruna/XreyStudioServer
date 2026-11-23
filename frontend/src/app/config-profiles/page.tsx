'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, Field, IconButton, Modal, PageHeader, Toggle } from '../../components/ui';

type Profile = {
  id: string;
  name: string;
  description: string | null;
  payload: unknown;
  enabled: boolean;
  createdAt: string;
  _count?: { users: number };
};

const emptyForm = { name: '', description: '', payloadText: '{\n  "routingRules": []\n}', enabled: true };

export default function ConfigProfilesPage() {
  const { t } = useLang();
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/config-profiles');
      setRows(Array.isArray(data) ? data : data.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn()) { window.location.href = '/login'; return; }
    load();
  }, []);

  const startCreate = () => { setEditing(null); setForm(emptyForm); setError(''); setOpen(true); };
  const startEdit = (row: Profile) => {
    setEditing(row.id);
    setForm({ name: row.name, description: row.description || '', payloadText: JSON.stringify(row.payload, null, 2), enabled: row.enabled });
    setError('');
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let payload: unknown;
    try { payload = JSON.parse(form.payloadText); } catch { setError(t.invalidJson); return; }
    setBusy(true);
    try {
      const body = { name: form.name, description: form.description || undefined, payload, enabled: form.enabled };
      if (editing) await api.patch(`/api/config-profiles/${editing}`, body);
      else await api.post('/api/config-profiles', body);
      setOpen(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (row: Profile) => {
    try { await api.patch(`/api/config-profiles/${row.id}`, { enabled: !row.enabled }); await load(); }
    catch (e: any) { setError(e.message); }
  };

  const remove = async (id: string) => {
    if (!confirm(t.confirmDelete)) return;
    await api.delete(`/api/config-profiles/${id}`);
    await load();
  };

  const columns = useMemo<ColumnDef<Profile>[]>(
    () => [
      {
        accessorKey: 'name', header: t.name,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-2 text-brand"><Icon name="sliders" size={15} /></div>
            <div>
              <p className="font-medium text-fg">{row.original.name}</p>
              <p className="text-[10px] text-subtle">{row.original.description || '—'}</p>
            </div>
          </div>
        ),
      },
      { id: 'users', header: t.users, cell: ({ row }) => <span className="text-xs text-fg">{row.original._count?.users ?? 0}</span> },
      { accessorKey: 'enabled', header: t.enabled, cell: ({ row }) => row.original.enabled ? <Badge tone="success" dot>{t.enabled}</Badge> : <Badge tone="neutral" dot>{t.disabled}</Badge> },
      { accessorKey: 'createdAt', header: t.createdAt, cell: ({ row }) => <span className="text-xs text-muted">{new Date(row.original.createdAt).toLocaleDateString()}</span> },
      {
        id: 'actions', header: t.actions, enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <IconButton icon="power" label={t.enabled} onClick={() => toggle(row.original)} />
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
      <PageHeader eyebrow={t.access} title={t.configProfiles} subtitle={t.configProfilesSubtitle} icon="sliders"
        actions={<Button icon="plus" variant="primary" onClick={startCreate}>{t.create}</Button>} />
      {error && <div className="mb-5 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger">{error}</div>}
      <DataTable data={rows} columns={columns} loading={loading} getRowId={(row) => row.id} />

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t.edit : t.create} subtitle={t.configProfilesSubtitle} icon={<Icon name="sliders" size={16} />} size="lg"
        footer={<><Button onClick={() => setOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="check" onClick={submit} loading={busy}>{t.save}</Button></>}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.name}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" required /></Field>
            <Field label={t.comment}><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="field" /></Field>
          </div>
          <Field label={t.payload} hint="routingRules / dnsServers / outbounds">
            <textarea rows={12} value={form.payloadText} onChange={(e) => setForm({ ...form, payloadText: e.target.value })} className="field mono text-[11px]" />
          </Field>
          <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label={t.enabled} />
        </form>
      </Modal>
    </>
  );
}
