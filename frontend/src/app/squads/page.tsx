// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, Field, IconButton, Modal, PageHeader, Toggle, formatBytes } from '../../components/ui';

type Squad = {
  id: string;
  name: string;
  description: string | null;
  trafficLimit: string | number;
  expiresAt: string | null;
  enabled: boolean;
  createdAt: string;
  _count?: { users: number };
};

const emptyForm = { name: '', description: '', trafficLimitGb: 0, expiresAt: '', enabled: true };

export default function SquadsPage() {
  const { t } = useLang();
  const [rows, setRows] = useState<Squad[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [members, setMembers] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; email: string; telegramId?: string | null }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/squads');
      setRows(Array.isArray(data) ? data : data.data || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!isLoggedIn()) { window.location.href = '/login'; return; }
    load();
    api.get('/api/users?limit=100').then((d) => setAllUsers(d.data || [])).catch(() => undefined);
  }, []);

  const startCreate = () => { setEditing(null); setForm(emptyForm); setMembers([]); setError(''); setOpen(true); };

  const startEdit = async (row: Squad) => {
    setEditing(row.id);
    setForm({
      name: row.name,
      description: row.description || '',
      trafficLimitGb: Number(row.trafficLimit || 0) / 1024 ** 3,
      expiresAt: row.expiresAt ? row.expiresAt.slice(0, 10) : '',
      enabled: row.enabled,
    });
    try {
      const detail = await api.get(`/api/squads/${row.id}`);
      setMembers((detail.users || []).map((u: any) => u.id));
    } catch { setMembers([]); }
    setError('');
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        trafficLimit: Math.round(form.trafficLimitGb * 1024 ** 3),
        expiresAt: form.expiresAt || undefined,
        enabled: form.enabled,
      };
      let id = editing;
      if (editing) await api.patch(`/api/squads/${editing}`, body);
      else { const created = await api.post('/api/squads', body); id = created.id; }
      if (id) await api.patch(`/api/squads/${id}/members`, { userIds: members });
      setOpen(false);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const toggle = async (row: Squad) => {
    try { await api.patch(`/api/squads/${row.id}`, { enabled: !row.enabled }); await load(); }
    catch (e: any) { setError(e.message); }
  };

  const remove = async (id: string) => {
    if (!confirm(t.confirmDelete)) return;
    await api.delete(`/api/squads/${id}`);
    await load();
  };

  const columns = useMemo<ColumnDef<Squad>[]>(
    () => [
      {
        accessorKey: 'name', header: t.name,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-2 text-brand"><Icon name="users" size={15} /></div>
            <div>
              <p className="font-medium text-fg">{row.original.name}</p>
              <p className="text-[10px] text-subtle">{row.original.description || '—'}</p>
            </div>
          </div>
        ),
      },
      { id: 'users', header: t.users, cell: ({ row }) => <span className="text-xs text-fg">{row.original._count?.users ?? 0}</span> },
      { id: 'traffic', header: t.trafficLimit, cell: ({ row }) => <span className="text-xs text-fg">{Number(row.original.trafficLimit || 0) > 0 ? formatBytes(row.original.trafficLimit) : '∞'}</span> },
      { accessorKey: 'expiresAt', header: t.expiresAt, cell: ({ row }) => row.original.expiresAt ? <span className="text-xs text-muted">{new Date(row.original.expiresAt).toLocaleDateString()}</span> : <span className="text-subtle">—</span> },
      { accessorKey: 'enabled', header: t.enabled, cell: ({ row }) => row.original.enabled ? <Badge tone="success" dot>{t.enabled}</Badge> : <Badge tone="neutral" dot>{t.disabled}</Badge> },
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
      <PageHeader eyebrow={t.access} title={t.squads} subtitle={t.squadsSubtitle} icon="users"
        actions={<Button icon="plus" variant="primary" onClick={startCreate}>{t.create}</Button>} />
      {error && <div className="mb-4 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
      <DataTable data={rows} columns={columns} loading={loading} getRowId={(row) => row.id} />

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t.edit : t.create} subtitle={t.squadsSubtitle} icon={<Icon name="users" size={16} />} size="lg"
        footer={<><Button onClick={() => setOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="check" onClick={submit} loading={busy}>{t.save}</Button></>}>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.name}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" required /></Field>
            <Field label={t.comment}><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="field" /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.trafficLimit} hint="GB"><input type="number" min={0} value={form.trafficLimitGb} onChange={(e) => setForm({ ...form, trafficLimitGb: Number(e.target.value) })} className="field" /></Field>
            <Field label={t.expiresAt}><input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="field" /></Field>
          </div>
          <div className="border-t border-line pt-4">
            <p className="mb-2 text-xs font-semibold text-subtle">{t.users}</p>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line bg-surface-2/40 p-2">
              {allUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs text-muted hover:bg-surface-3">
                  <label className="flex flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={members.includes(u.id)}
                      onChange={(e) => setMembers(e.target.checked ? [...members, u.id] : members.filter((id) => id !== u.id))}
                    />
                    {u.email}
                  </label>
                  {u.telegramId && (
                    <a
                      href={`https://t.me/${encodeURIComponent(u.telegramId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${t.openTelegram}: ${u.email}`}
                      className="text-brand hover:underline"
                    >
                      <Icon name="external" size={12} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
          <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label={t.enabled} />
        </form>
      </Modal>
    </>
  );
}
