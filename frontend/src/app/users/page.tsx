'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import {
  Avatar, Badge, Button, Card, Field, IconButton, Modal, PageHeader,
  StatusBadge, formatBytes,
} from '../../components/ui';

type UserRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  trafficLimit: string | number;
};

export default function UsersPage() {
  const { t } = useLang();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', trafficLimit: 100 });
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ role: 'USER', status: 'ACTIVE', trafficLimit: 100 });
  const [saving, setSaving] = useState(false);
  const [connection, setConnection] = useState<any | null>(null);
  const [inbounds, setInbounds] = useState<{ id: string; tag: string }[]>([]);
  const [attachId, setAttachId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pageIndex + 1), limit: String(pageSize) });
    if (appliedSearch) params.set('search', appliedSearch);
    if (status) params.set('status', status);
    if (role) params.set('role', role);
    if (sorting[0]) {
      params.set('sortBy', sorting[0].id);
      params.set('sortOrder', sorting[0].desc ? 'desc' : 'asc');
    }
    try {
      const data = await api.get(`/api/users?${params.toString()}`);
      setUsers(data.data || []);
      setTotal(Number(data.total || 0));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, status, role, pageIndex, pageSize, sorting]);

  useEffect(() => {
    if (!isLoggedIn()) window.location.href = '/login';
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search);
      setPageIndex(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, status, role]);

  useEffect(() => {
    if (isLoggedIn()) load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/api/users', { email: form.email, password: form.password, trafficLimit: form.trafficLimit * 1024 ** 3 });
      setForm({ email: '', password: '', trafficLimit: 100 });
      setCreateOpen(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(t.confirmDelete)) return;
    await api.delete(`/api/users/${id}`);
    await load();
  };

  const startEdit = (user: UserRow) => {
    setEditing(user);
    setEditForm({
      role: user.role,
      status: user.status,
      trafficLimit: Math.round(Number(user.trafficLimit) / 1024 ** 3),
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      await api.patch(`/api/users/${editing.id}`, {
        role: editForm.role,
        status: editForm.status,
        trafficLimit: editForm.trafficLimit * 1024 ** 3,
      });
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const openConnection = async (user: UserRow) => {
    try {
      const data = await api.get(`/api/users/${user.id}`);
      setConnection(data);
      setAttachId('');
      const list = await api.get('/api/inbounds');
      const rows = Array.isArray(list) ? list : list.data || [];
      setInbounds(rows.map((i: any) => ({ id: i.id, tag: i.tag })));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const attach = async () => {
    if (!connection || !attachId) return;
    setSaving(true);
    try {
      const current = await api.get(`/api/inbounds/${attachId}`);
      const clients = current.clients || [];
      if (!clients.some((c: any) => c.userId === connection.id)) {
        await api.patch(`/api/inbounds/${attachId}`, { clients: [...clients, { userId: connection.id, enabled: true }] });
      }
      setConnection(await api.get(`/api/users/${connection.id}`));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(t.copy);
      setTimeout(() => setNotice(''), 1500);
    } catch {}
  };

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    setSorting(updater);
    setPageIndex(0);
  };

  const columns = useMemo<ColumnDef<UserRow>[]>(
    () => [
      {
        accessorKey: 'email',
        header: t.email,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar label={row.original.email.slice(0, 2).toUpperCase()} size="sm" />
            <div>
              <p className="font-medium text-fg">{row.original.email}</p>
              <p className="text-[10px] text-subtle">{t.idLabel} {row.original.id.slice(0, 8)}</p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'role',
        header: t.role,
        cell: ({ row }) => (
          <Badge tone={row.original.role === 'ADMIN' ? 'brand' : row.original.role === 'OPERATOR' ? 'cyan' : 'neutral'}>
            {row.original.role}
          </Badge>
        ),
      },
      {
        accessorKey: 'status',
        header: t.status,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'trafficLimit',
        header: t.trafficLimit,
        cell: ({ row }) => <span className="font-medium text-fg tabular-nums">{formatBytes(row.original.trafficLimit)}</span>,
      },
      {
        id: 'actions',
        header: t.actions,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <IconButton icon="key" label={t.connectionKey} tone="brand" onClick={() => openConnection(row.original)} />
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
        eyebrow="Access"
        title={t.users}
        subtitle={t.usersSubtitle}
        icon="users"
        actions={<Button icon="plus" variant="primary" onClick={() => setCreateOpen(true)}>{t.create}</Button>}
      />

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.search} className="field pl-9" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="field w-auto min-w-[140px]">
            <option value="">{t.all} {t.status}</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="DISABLED">DISABLED</option>
            <option value="EXPIRED">EXPIRED</option>
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="field w-auto min-w-[140px]">
            <option value="">{t.all} {t.role}</option>
            <option value="ADMIN">ADMIN</option>
            <option value="OPERATOR">OPERATOR</option>
            <option value="USER">USER</option>
          </select>
          <Badge tone="neutral">{t.total}: {total}</Badge>
        </div>
      </Card>

      <DataTable
        data={users}
        columns={columns}
        loading={loading}
        getRowId={(row) => row.id}
        hideSearch
        sorting={sorting}
        onSortingChange={handleSortingChange}
        manualSorting
        serverPagination={{
          pageIndex,
          pageSize,
          pageCount: Math.max(1, Math.ceil(total / pageSize)),
          onPageChange: setPageIndex,
          onPageSizeChange: (size) => { setPageSize(size); setPageIndex(0); },
        }}
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t.newUser} subtitle={t.createAccount} icon={<Icon name="users" size={16} />}
        footer={<><Button onClick={() => setCreateOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="plus" onClick={create} loading={saving}>{t.create}</Button></>}>
        <form onSubmit={create} className="space-y-4">
          <Field label={t.email}><input type="email" placeholder="user@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="field" required /></Field>
          <Field label={t.password} hint={t.atLeast6Chars}><input type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="field" required /></Field>
          <Field label={t.trafficLimit} hint={t.valueInGB}><input type="number" min={1} value={form.trafficLimit} onChange={(e) => setForm({ ...form, trafficLimit: Number(e.target.value) })} className="field" /></Field>
        </form>
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.email || ''} subtitle={t.editUserSubtitle}
        footer={<><Button onClick={() => setEditing(null)}>{t.cancel}</Button><Button variant="primary" icon="check" onClick={save} loading={saving}>{t.save}</Button></>}>
        <form onSubmit={save} className="space-y-4">
          <Field label={t.role}>
            <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} className="field">
              <option value="ADMIN">ADMIN</option><option value="OPERATOR">OPERATOR</option><option value="USER">USER</option>
            </select>
          </Field>
          <Field label={t.status}>
            <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="field">
              <option value="ACTIVE">ACTIVE</option><option value="DISABLED">DISABLED</option>
            </select>
          </Field>
          <Field label={t.trafficLimit} hint={t.valueInGB}>
            <input type="number" min={0} value={editForm.trafficLimit} onChange={(e) => setEditForm({ ...editForm, trafficLimit: Number(e.target.value) })} className="field" />
          </Field>
        </form>
      </Modal>

      <Modal open={Boolean(connection)} onClose={() => setConnection(null)} title={connection?.email || ''} subtitle={t.connectionKey} icon={<Icon name="key" size={16} />} size="lg">
        {connection && (
          <div className="space-y-5">
            {notice && <div className="rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs text-success">{notice}</div>}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">{t.subscriptionLink}</p>
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-3">
                <code className="mono min-w-0 flex-1 break-all text-xs text-muted">{connection.subscriptionUrl}</code>
                <IconButton icon="copy" label={t.copyLink} tone="brand" onClick={() => copyText(connection.subscriptionUrl)} />
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">{t.connectionKey}</p>
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-3">
                <code className="mono min-w-0 flex-1 break-all text-xs text-fg">{connection.subscriptionToken}</code>
                <IconButton icon="copy" label={t.copy} onClick={() => copyText(connection.subscriptionToken)} />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(connection.links || {}).map(([name, url]) => (
                <button key={name} onClick={() => copyText(String(url))} className="flex items-center justify-between rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-xs text-muted transition-colors hover:border-brand/30 hover:text-fg">
                  <span className="font-medium uppercase">{name}</span><Icon name="copy" size={13} />
                </button>
              ))}
            </div>
            <div className="border-t border-line pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">{t.attachToInbound}</p>
              <div className="flex gap-2">
                <select value={attachId} onChange={(e) => setAttachId(e.target.value)} className="field">
                  <option value="">{t.selectInbound}</option>
                  {inbounds.map((i) => <option key={i.id} value={i.id}>{i.tag}</option>)}
                </select>
                <Button icon="plus" onClick={attach} loading={saving} disabled={!attachId}>{t.attachToInbound}</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
