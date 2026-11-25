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
  telegramId?: string | null;
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
  const [form, setForm] = useState({ email: '', password: '', trafficLimit: 100, telegramId: '' });
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ role: 'USER', status: 'ACTIVE', trafficLimit: 100, telegramId: '' });
  const [saving, setSaving] = useState(false);
  const [connection, setConnection] = useState<any | null>(null);
  const [inbounds, setInbounds] = useState<{ id: string; tag: string }[]>([]);
  const [attachId, setAttachId] = useState('');
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [subTemplates, setSubTemplates] = useState<{ id: string; name: string }[]>([]);
  const [devices, setDevices] = useState<{ id: string; hwid: string; name: string | null; lastSeenAt: string | null }[]>([]);
  const [hwidInput, setHwidInput] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [squads, setSquads] = useState<{ id: string; name: string }[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState<{ mode: 'add' | 'remove'; scope: 'selected' | 'all' | 'squad'; inboundId: string; squadId: string }>({
    mode: 'add', scope: 'selected', inboundId: '', squadId: '',
  });

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

  useEffect(() => {
    if (!isLoggedIn()) return;
    api
      .get('/api/squads?limit=200')
      .then((data: any) => {
        const rows = Array.isArray(data) ? data : data.data || [];
        setSquads(rows.map((s: any) => ({ id: s.id, name: s.name })));
      })
      .catch((e: any) => setError(e.message));
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/api/users', {
        email: form.email,
        password: form.password,
        trafficLimit: form.trafficLimit * 1024 ** 3,
        telegramId: form.telegramId || null,
      });
      setForm({ email: '', password: '', trafficLimit: 100, telegramId: '' });
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
      telegramId: user.telegramId || '',
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
        telegramId: editForm.telegramId || null,
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
      const profileList = await api.get('/api/config-profiles').catch(() => ({ data: [] }));
      const profileRows = Array.isArray(profileList) ? profileList : profileList.data || [];
      setProfiles(profileRows.map((p: any) => ({ id: p.id, name: p.name })));
      const templateList = await api.get('/api/subscription-templates').catch(() => ({ data: [] }));
      const templateRows = Array.isArray(templateList) ? templateList : templateList.data || [];
      setSubTemplates(templateRows.map((p: any) => ({ id: p.id, name: p.name })));
      const deviceList = await api.get(`/api/devices?userId=${user.id}`).catch(() => []);
      const deviceRows = Array.isArray(deviceList) ? deviceList : deviceList.data || [];
      setDevices(deviceRows);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const openBulk = async (scope: 'selected' | 'all' | 'squad') => {
    setError('');
    if (scope === 'selected' && selectedIds.length === 0) {
      setError(t.bulkNoSelection);
      return;
    }
    let list = inbounds;
    if (list.length === 0) {
      try {
        const data = await api.get('/api/inbounds');
        const rows = Array.isArray(data) ? data : data.data || [];
        list = rows.map((i: any) => ({ id: i.id, tag: i.tag }));
        setInbounds(list);
      } catch (e: any) {
        setError(e.message);
        return;
      }
    }
    if (list.length === 0) {
      setError(t.noConnections);
      return;
    }
    setBulkForm({
      mode: 'add',
      scope,
      inboundId: list[0].id,
      squadId: squads[0]?.id || '',
    });
    setBulkOpen(true);
  };

  const applyBulk = async () => {
    if (!bulkForm.inboundId) return;
    if (bulkForm.scope === 'squad' && !bulkForm.squadId) {
      setError(t.bulkNoSquad);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        mode: bulkForm.mode,
        scope: bulkForm.scope,
      };
      if (bulkForm.scope === 'selected') body.userIds = selectedIds;
      if (bulkForm.scope === 'squad') body.squadId = bulkForm.squadId;
      const result = await api.post(`/api/inbounds/${bulkForm.inboundId}/users/bulk`, body);
      const inbound = inbounds.find((i) => i.id === bulkForm.inboundId);
      const label = inbound ? inbound.tag : bulkForm.inboundId;
      setNotice(
        `${t.bulkApplied} ${label}: ${t.bulkAffected} ${result.affected ?? 0}, ${t.bulkSkipped} ${result.skipped ?? 0}`,
      );
      setBulkOpen(false);
      setSelectedIds([]);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
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
        id: 'select',
        header: () => (
          <input
            type="checkbox"
            aria-label={t.bulkSelectAll}
            checked={users.length > 0 && users.every((u) => selectedIds.includes(u.id))}
            onChange={(e) => setSelectedIds(e.target.checked ? users.map((u) => u.id) : [])}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`${t.bulkSelect} ${row.original.email}`}
            checked={selectedIds.includes(row.original.id)}
            onChange={() =>
              setSelectedIds((prev) =>
                prev.includes(row.original.id)
                  ? prev.filter((x) => x !== row.original.id)
                  : [...prev, row.original.id],
              )
            }
          />
        ),
        enableSorting: false,
        size: 40,
      },
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
        accessorKey: 'telegramId',
        header: t.telegramId,
        cell: ({ row }) =>
          row.original.telegramId ? (
            <a
              href={`https://t.me/${encodeURIComponent(row.original.telegramId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
            >
              <Icon name="external" size={12} /> @{row.original.telegramId}
            </a>
          ) : (
            <span className="text-xs text-muted">—</span>
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">
          {t.bulkSelected}: {selectedIds.length}
        </span>
        <Button size="sm" icon="plus" onClick={() => openBulk('selected')}>
          {t.bulkAddSelected}
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon="close"
          onClick={() => {
            void openBulk('selected').then(() => setBulkForm((f) => ({ ...f, mode: 'remove' })));
          }}
        >
          {t.bulkRemoveSelected}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => openBulk('all')}>
          {t.bulkAddAll}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => openBulk('squad')}>
          {t.bulkBySquad}
        </Button>
      </div>

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

      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title={t.bulkOperations}
        subtitle={t.bulkSubtitle}
        icon={<Icon name="link" size={16} />}
        footer={
          <>
            <Button onClick={() => setBulkOpen(false)}>{t.cancel}</Button>
            <Button variant="primary" icon="check" loading={saving} onClick={applyBulk}>
              {t.apply}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label={t.bulkConnection}>
            <select
              className="field-input"
              value={bulkForm.inboundId}
              onChange={(e) => setBulkForm({ ...bulkForm, inboundId: e.target.value })}
            >
              {inbounds.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.tag}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.bulkMode}>
            <select
              className="field-input"
              value={bulkForm.mode}
              onChange={(e) => setBulkForm({ ...bulkForm, mode: e.target.value as 'add' | 'remove' })}
            >
              <option value="add">{t.bulkModeAdd}</option>
              <option value="remove">{t.bulkModeRemove}</option>
            </select>
          </Field>
          <Field label={t.bulkScope}>
            <select
              className="field-input"
              value={bulkForm.scope}
              onChange={(e) => setBulkForm({ ...bulkForm, scope: e.target.value as 'selected' | 'all' | 'squad' })}
            >
              <option value="selected">{t.bulkScopeSelected} ({selectedIds.length})</option>
              <option value="all">{t.bulkScopeAll}</option>
              <option value="squad">{t.bulkScopeSquad}</option>
            </select>
          </Field>
          {bulkForm.scope === 'squad' && (
            <Field label={t.bulkSquad}>
              <select
                className="field-input"
                value={bulkForm.squadId}
                onChange={(e) => setBulkForm({ ...bulkForm, squadId: e.target.value })}
              >
                <option value="">—</option>
                {squads.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </Modal>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t.newUser} subtitle={t.createAccount} icon={<Icon name="users" size={16} />}
        footer={<><Button onClick={() => setCreateOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="plus" onClick={create} loading={saving}>{t.create}</Button></>}>
        <form onSubmit={create} className="space-y-4">
          <Field label={t.email}><input type="email" placeholder="user@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="field" required /></Field>
          <Field label={t.password} hint={t.atLeast6Chars}><input type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="field" required /></Field>
          <Field label={t.trafficLimit} hint={t.valueInGB}><input type="number" min={1} value={form.trafficLimit} onChange={(e) => setForm({ ...form, trafficLimit: Number(e.target.value) })} className="field" /></Field>
          <Field label={t.telegramId} hint={t.telegramIdHint}><input inputMode="numeric" pattern="[0-9]{5,12}" value={form.telegramId} onChange={(e) => setForm({ ...form, telegramId: e.target.value })} className="field" /></Field>
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
          <Field label={t.telegramId} hint={t.telegramIdHint}>
            <input
              inputMode="numeric"
              pattern="[0-9]{5,12}"
              value={editForm.telegramId}
              onChange={(e) => setEditForm({ ...editForm, telegramId: e.target.value })}
              className="field"
            />
          </Field>
        </form>
      </Modal>

      <Modal open={Boolean(connection)} onClose={() => setConnection(null)} title={connection?.email || ''} subtitle={t.connectionKey} icon={<Icon name="key" size={16} />} size="lg">
        {connection && (
          <div className="space-y-5">
            {notice && <div className="rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs text-success">{notice}</div>}
            {connection.telegramId && (
              <a
                href={`https://t.me/${encodeURIComponent(connection.telegramId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-xs text-brand hover:bg-brand/20"
              >
                <Icon name="external" size={13} /> {t.openTelegram}: @{connection.telegramId}
              </a>
            )}
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
              <div className="mb-3 flex items-end gap-2">
                <Field label={t.deviceLimit}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={connection.deviceLimit ?? 0}
                    onChange={(e) => setConnection({ ...connection, deviceLimit: Number(e.target.value) })}
                    className="field"
                  />
                </Field>
                <Button icon="check" onClick={async () => {
                  try {
                    await api.patch(`/api/users/${connection.id}`, { deviceLimit: connection.deviceLimit });
                    setNotice(t.save);
                  } catch (e: any) { setError(e.message); }
                }}>{t.save}</Button>
              </div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">{t.devices}</p>
              <div className="mb-2 flex gap-2">
                <input value={hwidInput} onChange={(e) => setHwidInput(e.target.value)} placeholder={t.hwid} className="field" />
                <Button icon="plus" disabled={!hwidInput} onClick={async () => {
                  try {
                    await api.post('/api/devices', { userId: connection.id, hwid: hwidInput });
                    setHwidInput('');
                    const list = await api.get(`/api/devices?userId=${connection.id}`);
                    setDevices(Array.isArray(list) ? list : list.data || []);
                  } catch (e: any) { setError(e.message); }
                }}>{t.bindDevice}</Button>
              </div>
              <div className="space-y-1">
                {devices.length === 0 && <p className="text-xs text-subtle">—</p>}
                {devices.map((device) => (
                  <div key={device.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="mono truncate text-xs text-fg">{device.hwid}</p>
                      <p className="text-[10px] text-subtle">{device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : device.name || '—'}</p>
                    </div>
                    <IconButton icon="trash" label={t.delete} tone="danger" onClick={async () => {
                      await api.delete(`/api/devices/${device.id}`);
                      const list = await api.get(`/api/devices?userId=${connection.id}`);
                      setDevices(Array.isArray(list) ? list : list.data || []);
                    }} />
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-line pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">{t.configProfiles}</p>
              <select
                value={connection.configProfileId || ''}
                onChange={async (e) => {
                  const value = e.target.value || null;
                  try {
                    await api.patch(`/api/users/${connection.id}`, { configProfileId: value });
                    setConnection({ ...connection, configProfileId: value });
                  } catch (err: any) { setError(err.message); }
                }}
                className="field"
              >
                <option value="">—</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="border-t border-line pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">{t.subscriptionTemplates}</p>
              <select
                value={connection.subscriptionTemplateId || ''}
                onChange={async (e) => {
                  const value = e.target.value || null;
                  try {
                    await api.patch(`/api/users/${connection.id}`, { subscriptionTemplateId: value });
                    setConnection({ ...connection, subscriptionTemplateId: value });
                  } catch (err: any) { setError(err.message); }
                }}
                className="field"
              >
                <option value="">—</option>
                {subTemplates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
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
