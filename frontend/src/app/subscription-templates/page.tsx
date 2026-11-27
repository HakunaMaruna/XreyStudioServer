// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, Field, IconButton, Modal, PageHeader, Toggle } from '../../components/ui';

type Template = {
  id: string;
  name: string;
  title: string;
  description: string | null;
  accent: string;
  instructions: Record<string, string> | null;
  footer: string | null;
  enabled: boolean;
  isDefault?: boolean;
  createdAt: string;
  _count?: { users: number; squads: number };
};

const emptyForm = {
  name: '', title: '', description: '', accent: '#8474ff', footer: '',
  instructionsText: '{}', enabled: true, isDefault: false,
};

export default function SubscriptionTemplatesPage() {
  const { t } = useLang();
  const [rows, setRows] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<Array<{ id: string; email: string; subscriptionTemplateId?: string | null }>>([]);
  const [squads, setSquads] = useState<Array<{ id: string; name: string; subscriptionTemplateId?: string | null }>>([]);
  const [assignTemplate, setAssignTemplate] = useState<Template | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [data, userRows, squadRows] = await Promise.all([
        api.get('/api/subscription-templates'),
        api.get('/api/users?limit=500').catch(() => ({ data: [] })),
        api.get('/api/squads').catch(() => []),
      ]);
      setRows(Array.isArray(data) ? data : data.data || []);
      setUsers(Array.isArray(userRows) ? userRows : userRows.data || []);
      setSquads(Array.isArray(squadRows) ? squadRows : squadRows.data || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!isLoggedIn()) { window.location.href = '/login'; return; }
    load();
  }, []);

  const startCreate = () => { setEditing(null); setForm(emptyForm); setError(''); setOpen(true); };
  const startEdit = (row: Template) => {
    setEditing(row.id);
    setForm({
      name: row.name, title: row.title, description: row.description || '', accent: row.accent,
      footer: row.footer || '', instructionsText: JSON.stringify(row.instructions || {}, null, 2), enabled: row.enabled, isDefault: Boolean(row.isDefault),
    });
    setError(''); setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let instructions: unknown;
    try { instructions = JSON.parse(form.instructionsText); } catch { setError(t.invalidJson); return; }
    setBusy(true);
    try {
      const body = {
        name: form.name, title: form.title, description: form.description || undefined,
        accent: form.accent, footer: form.footer || undefined, instructions, enabled: form.enabled, isDefault: form.isDefault,
      };
      if (editing) await api.patch(`/api/subscription-templates/${editing}`, body);
      else await api.post('/api/subscription-templates', body);
      setOpen(false); await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const toggle = async (row: Template) => {
    try { await api.patch(`/api/subscription-templates/${row.id}`, { enabled: !row.enabled }); await load(); }
    catch (e: any) { setError(e.message); }
  };

  const remove = async (id: string) => {
    if (!confirm(t.confirmDelete)) return;
    await api.delete(`/api/subscription-templates/${id}`); await load();
  };

  const columns = useMemo<ColumnDef<Template>[]>(
    () => [
      {
        accessorKey: 'name', header: t.name,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="h-8 w-1 rounded-full" style={{ background: row.original.accent }} />
            <div>
              <p className="font-medium text-fg">{row.original.name}</p>
              <p className="text-[10px] text-subtle">{row.original.title}</p>
            </div>
          </div>
        ),
      },
      { id: 'users', header: t.users, cell: ({ row }) => <span className="text-xs text-fg">{row.original._count?.users ?? 0}</span> },
      { id: 'squads', header: t.templateSquads, cell: ({ row }) => <span className="text-xs text-fg">{row.original._count?.squads ?? 0}</span> },
      { id: 'default', header: t.templateDefault, cell: ({ row }) => row.original.isDefault ? <Badge tone="brand">{t.yes}</Badge> : <span className="text-subtle">—</span> },
      { accessorKey: 'enabled', header: t.enabled, cell: ({ row }) => row.original.enabled ? <Badge tone="success" dot>{t.enabled}</Badge> : <Badge tone="neutral" dot>{t.disabled}</Badge> },
      { accessorKey: 'createdAt', header: t.createdAt, cell: ({ row }) => <span className="text-xs text-muted">{new Date(row.original.createdAt).toLocaleDateString()}</span> },
      {
        id: 'actions', header: t.actions, enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <IconButton icon="eye" label={t.templatePreview} onClick={() => setPreviewTemplate(row.original)} />
            <IconButton icon="link" label={t.templateAssign} onClick={() => setAssignTemplate(row.original)} />
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
      <PageHeader eyebrow={t.billing} title={t.subscriptionTemplates} subtitle={t.subscriptionTemplatesSubtitle} icon="file"
        actions={<Button icon="plus" variant="primary" onClick={startCreate}>{t.create}</Button>} />
      {error && <div className="mb-4 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
      <DataTable data={rows} columns={columns} loading={loading} getRowId={(row) => row.id} />

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t.edit : t.create} subtitle={t.subscriptionTemplatesSubtitle} icon={<Icon name="file" size={16} />} size="lg"
        footer={<><Button onClick={() => setOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="check" onClick={submit} loading={busy}>{t.save}</Button></>}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.name}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" required /></Field>
            <Field label={t.title}><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="field" required /></Field>
          </div>
          <Field label={t.description}><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="field" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Accent"><input type="color" value={form.accent} onChange={(e) => setForm({ ...form, accent: e.target.value })} className="field h-10" /></Field>
            <Field label={t.footer}><input value={form.footer} onChange={(e) => setForm({ ...form, footer: e.target.value })} className="field" /></Field>
          </div>
          <Field label={t.instructions} hint="JSON: platform → text">
            <textarea rows={8} value={form.instructionsText} onChange={(e) => setForm({ ...form, instructionsText: e.target.value })} className="field mono text-[11px]" />
          </Field>
          <div className="flex flex-wrap gap-6">
            <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label={t.enabled} />
            <Toggle checked={form.isDefault} onChange={(v) => setForm({ ...form, isDefault: v })} label={t.templateDefault} />
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(assignTemplate)} onClose={() => setAssignTemplate(null)} title={t.templateAssign}
        subtitle={assignTemplate?.name} icon={<Icon name="link" size={16} />} size="lg"
        footer={<Button onClick={() => setAssignTemplate(null)}>{t.close}</Button>}>
        <div className="space-y-4">
          <p className="text-xs font-semibold text-subtle">{t.users}</p>
          <div className="grid max-h-48 gap-1 overflow-auto sm:grid-cols-2">
            {users.map((user) => (
              <label key={user.id} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5 text-xs">
                <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]"
                  checked={Boolean(assignTemplate && user.subscriptionTemplateId === assignTemplate.id)}
                  onChange={async (e) => {
                    try {
                      await api.patch(`/api/users/${user.id}`, { subscriptionTemplateId: e.target.checked ? assignTemplate!.id : null });
                      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, subscriptionTemplateId: e.target.checked ? assignTemplate!.id : null } : u));
                    } catch (err: any) { setError(err.message); }
                  }} />
                <span className="truncate">{user.email}</span>
              </label>
            ))}
          </div>
          <p className="text-xs font-semibold text-subtle">{t.templateSquads}</p>
          <div className="grid max-h-48 gap-1 overflow-auto sm:grid-cols-2">
            {squads.map((squad) => (
              <label key={squad.id} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5 text-xs">
                <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]"
                  checked={Boolean(assignTemplate && squad.subscriptionTemplateId === assignTemplate.id)}
                  onChange={async (e) => {
                    try {
                      await api.patch(`/api/squads/${squad.id}`, { subscriptionTemplateId: e.target.checked ? assignTemplate!.id : null });
                      setSquads((prev) => prev.map((sq) => sq.id === squad.id ? { ...sq, subscriptionTemplateId: e.target.checked ? assignTemplate!.id : null } : sq));
                    } catch (err: any) { setError(err.message); }
                  }} />
                <span className="truncate">{squad.name}</span>
              </label>
            ))}
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(previewTemplate)} onClose={() => setPreviewTemplate(null)} title={t.templatePreview}
        subtitle={previewTemplate?.name} icon={<Icon name="eye" size={16} />} size="lg"
        footer={<Button onClick={() => setPreviewTemplate(null)}>{t.close}</Button>}>
        {previewTemplate && (
          <div className="space-y-3">
            <p className="text-lg font-semibold" style={{ color: previewTemplate.accent }}>{previewTemplate.title}</p>
            {previewTemplate.description && <p className="text-xs text-muted">{previewTemplate.description}</p>}
            {Object.entries(previewTemplate.instructions || {}).filter(([, v]) => typeof v === 'string' && v.trim()).map(([key, value]) => (
              <div key={key} className="rounded-lg border border-line p-3 text-xs"><span className="font-semibold">{key}:</span> {String(value)}</div>
            ))}
            {previewTemplate.footer && <p className="border-t border-line pt-3 text-center text-[11px] text-subtle">{previewTemplate.footer}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
