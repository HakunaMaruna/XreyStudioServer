// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import ChainCard from '../../components/chain-card';
import {
  Avatar, Badge, Button, Card, Field, HelpTip, IconButton, Modal, PageHeader,
  Segmented, StatusBadge, formatBytes,
} from '../../components/ui';

type UserRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  trafficLimit: string | number;
  telegramId?: string | null;
};

type ExternalLinkRow = {
  id: string;
  kind: 'link' | 'subscription';
  value: string;
  remark: string | null;
  enabled: boolean;
  lastFetchAt: string | null;
  lastFetchError: string | null;
  createdAt: string;
};

export default function UsersPage() {
  const { t } = useLang();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
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
  const [pageNotice, setPageNotice] = useState('');
  const [modalError, setModalError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', trafficLimit: 100, telegramId: '' });
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ role: 'USER', status: 'ACTIVE', trafficLimit: 100, telegramId: '' });
  const [saving, setSaving] = useState(false);
  const [connection, setConnection] = useState<any | null>(null);
  const [inbounds, setInbounds] = useState<{ id: string; tag: string }[]>([]);
  const [attachMode, setAttachMode] = useState<'all' | 'selected' | 'one'>('selected');
  const [attachIds, setAttachIds] = useState<string[]>([]);
  const [attachError, setAttachError] = useState('');
  const [deviceLimitInput, setDeviceLimitInput] = useState('0');
  const [deviceLimitError, setDeviceLimitError] = useState('');
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [subTemplates, setSubTemplates] = useState<{ id: string; name: string }[]>([]);
  const [devices, setDevices] = useState<{ id: string; hwid: string; name: string | null; lastSeenAt: string | null }[]>([]);
  const [hwidInput, setHwidInput] = useState('');
  const [externalLinks, setExternalLinks] = useState<ExternalLinkRow[]>([]);
  const [externalLinkForm, setExternalLinkForm] = useState<{ kind: 'link' | 'subscription'; value: string; remark: string }>({
    kind: 'link', value: '', remark: '',
  });
  const [externalLinkError, setExternalLinkError] = useState('');
  const [externalLinkSaving, setExternalLinkSaving] = useState(false);
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

  const loadExternalLinks = useCallback(async (userId: string) => {
    try {
      const data = await api.get(`/api/users/${userId}/external-links`);
      const rows = Array.isArray(data) ? data : data.items || [];
      setExternalLinks(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      setExternalLinkError(e.message);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    // Restore the last filters from the URL: a reload or a shared link keeps them.
    const params = new URLSearchParams(window.location.search);
    const searchParam = params.get('q') || '';
    const statusParam = params.get('status') || '';
    const roleParam = params.get('role') || '';
    const pageParam = Number(params.get('page'));
    const limitParam = Number(params.get('limit'));
    if (searchParam) {
      setSearch(searchParam);
      setAppliedSearch(searchParam);
    }
    if (statusParam) setStatus(statusParam);
    if (roleParam) setRole(roleParam);
    if (Number.isInteger(pageParam) && pageParam > 1) setPageIndex(pageParam - 1);
    if ([10, 20, 50, 100].includes(limitParam)) setPageSize(limitParam);
    setReady(true);
  }, []);

  // Skip the first run so filters restored from the URL keep their page index.
  const filtersRef = useRef<{ search: string; status: string; role: string } | null>(null);

  useEffect(() => {
    if (!ready) return;
    const previous = filtersRef.current;
    filtersRef.current = { search, status, role };
    if (!previous) return;
    const changed = previous.search !== search || previous.status !== status || previous.role !== role;
    if (!changed) return;
    const timer = setTimeout(() => {
      setAppliedSearch(search);
      setPageIndex(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, status, role, ready]);

  useEffect(() => {
    if (ready && isLoggedIn()) load();
  }, [ready, load]);

  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams();
    if (appliedSearch) params.set('q', appliedSearch);
    if (status) params.set('status', status);
    if (role) params.set('role', role);
    if (pageIndex > 0) params.set('page', String(pageIndex + 1));
    if (pageSize !== 20) params.set('limit', String(pageSize));
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [ready, appliedSearch, status, role, pageIndex, pageSize]);

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
    setModalError('');
    setSaving(true);
    try {
      await api.post('/api/users', {
        email: form.email,
        password: form.password || undefined,
        trafficLimit: form.trafficLimit * 1024 ** 3,
        telegramId: form.telegramId || null,
      });
      const email = form.email;
      setForm({ email: '', password: '', trafficLimit: 100, telegramId: '' });
      setCreateOpen(false);
      setPageNotice(`${t.userCreated}: ${email}`);
      await load();
    } catch (e: any) {
      setModalError(e.message);
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
    setModalError('');
    setSaving(true);
    try {
      await api.patch(`/api/users/${editing.id}`, {
        role: editForm.role,
        status: editForm.status,
        trafficLimit: editForm.trafficLimit * 1024 ** 3,
        telegramId: editForm.telegramId || null,
      });
      setPageNotice(`${t.userSaved}: ${editing.email}`);
      setEditing(null);
      await load();
    } catch (e: any) {
      setModalError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const openConnection = async (user: UserRow) => {
    try {
      const data = await api.get(`/api/users/${user.id}`);
      setConnection(data);
      setDeviceLimitInput(String(data.deviceLimit ?? 0));
      setDeviceLimitError('');
      const manualIds: string[] = (data.inboundClients || [])
        .filter((c: any) => !c.sourceSquadId)
        .map((c: any) => c.inboundId);
      setAttachIds(manualIds);
      setAttachMode(manualIds.length === 1 ? 'one' : 'selected');
      setAttachError('');
      setExternalLinkError('');
      setExternalLinkForm({ kind: 'link', value: '', remark: '' });
      setExternalLinks([]);
      const list = await api.get('/api/inbounds');
      const rows = Array.isArray(list) ? list : list.data || [];
      setInbounds(rows.map((i: any) => ({ id: i.id, tag: i.tag })));
      if (manualIds.length && manualIds.length === rows.length) setAttachMode('all');
      const profileList = await api.get('/api/config-profiles').catch(() => ({ data: [] }));
      const profileRows = Array.isArray(profileList) ? profileList : profileList.data || [];
      setProfiles(profileRows.map((p: any) => ({ id: p.id, name: p.name })));
      const templateList = await api.get('/api/subscription-templates').catch(() => ({ data: [] }));
      const templateRows = Array.isArray(templateList) ? templateList : templateList.data || [];
      setSubTemplates(templateRows.map((p: any) => ({ id: p.id, name: p.name })));
      const deviceList = await api.get(`/api/devices?userId=${user.id}`).catch(() => []);
      const deviceRows = Array.isArray(deviceList) ? deviceList : deviceList.data || [];
      setDevices(deviceRows);
      await loadExternalLinks(user.id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const addExternalLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connection) return;
    const value = externalLinkForm.value.trim();
    if (!value) {
      setExternalLinkError(t.externalLinkNoValue);
      return;
    }
    setExternalLinkSaving(true);
    setExternalLinkError('');
    try {
      await api.post(`/api/users/${connection.id}/external-links`, {
        kind: externalLinkForm.kind,
        value,
        remark: externalLinkForm.remark.trim() || undefined,
      });
      setExternalLinkForm((form) => ({ ...form, value: '', remark: '' }));
      await loadExternalLinks(connection.id);
    } catch (e: any) {
      setExternalLinkError(e.message);
    } finally {
      setExternalLinkSaving(false);
    }
  };

  const deleteExternalLink = async (id: string) => {
    if (!connection) return;
    setExternalLinkError('');
    try {
      await api.delete(`/api/users/${connection.id}/external-links/${id}`);
      await loadExternalLinks(connection.id);
    } catch (e: any) {
      setExternalLinkError(e.message);
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
    if (!connection) return;
    setAttachError('');
    setSaving(true);
    try {
      const result = await api.put(`/api/users/${connection.id}/inbounds`, {
        mode: attachMode,
        inboundIds: attachMode === 'all' ? undefined : attachIds,
      });
      const fresh = await api.get(`/api/users/${connection.id}`);
      setConnection(fresh);
      setAttachIds(result.inboundIds || []);
      setNotice(`${t.inboundsSaved}: +${result.added ?? 0} / −${result.removed ?? 0}`);
      setTimeout(() => setNotice(''), 3000);
    } catch (e: any) {
      setAttachError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleAttach = (id: string) => {
    if (attachMode === 'one') {
      setAttachIds([id]);
      return;
    }
    setAttachIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
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
        size: 44,
        meta: { noTruncate: true },
      },
      {
        accessorKey: 'email',
        header: t.email,
        size: 300,
        meta: { noTruncate: true },
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar label={row.original.email.slice(0, 2).toUpperCase()} size="sm" />
            <div className="min-w-0">
              <p className="truncate font-medium text-fg" title={row.original.email}>{row.original.email}</p>
              <p className="truncate text-[10px] text-subtle" title={row.original.id}>
                {t.idLabel} <span className="mono">{row.original.id.slice(0, 8)}</span>
              </p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'telegramId',
        header: t.telegramId,
        size: 150,
        meta: { noTruncate: true },
        cell: ({ row }) =>
          row.original.telegramId ? (
            <a
              href={`https://t.me/${encodeURIComponent(row.original.telegramId)}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`@${row.original.telegramId}`}
              className="inline-flex max-w-full min-w-0 items-center gap-1 text-xs text-brand hover:underline"
            >
              <Icon name="external" size={12} className="shrink-0" />
              <span className="truncate">@{row.original.telegramId}</span>
            </a>
          ) : (
            <span className="text-xs text-muted">—</span>
          ),
      },
      {
        accessorKey: 'role',
        header: t.role,
        size: 110,
        cell: ({ row }) => (
          <Badge tone={row.original.role === 'ADMIN' ? 'brand' : row.original.role === 'OPERATOR' ? 'cyan' : 'neutral'}>
            {row.original.role}
          </Badge>
        ),
      },
      {
        accessorKey: 'status',
        header: t.status,
        size: 120,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'trafficLimit',
        header: t.trafficLimit,
        size: 120,
        cell: ({ row }) => <span className="font-medium text-fg tabular-nums">{formatBytes(row.original.trafficLimit)}</span>,
      },
      {
        id: 'chain',
        header: t.chainBadge,
        enableSorting: false,
        size: 200,
        meta: { noTruncate: true, mobileHidden: true },
        cell: ({ row }) => <ChainCard userId={row.original.id} onUnbound={() => load()} />,
      },
      {
        id: 'actions',
        header: t.actions,
        enableSorting: false,
        size: 136,
        meta: { noTruncate: true, align: 'right' },
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <IconButton icon="key" label={t.connectionKey} tone="brand" onClick={() => openConnection(row.original)} />
            <IconButton icon="edit" label={t.edit} onClick={() => startEdit(row.original)} />
            <IconButton icon="trash" label={t.delete} tone="danger" onClick={() => remove(row.original.id)} />
          </div>
        ),
      },
    ],
    [t, selectedIds, users, load],
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
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      {pageNotice && (
        <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs text-success">
          <Icon name="check" size={15} /> <span className="flex-1">{pageNotice}</span>
          <IconButton icon="close" label={t.close} onClick={() => setPageNotice('')} className="h-6 w-6" />
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
        fillHeight
        total={total}
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

      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setModalError(''); }} title={t.newUser} subtitle={t.createAccount} icon={<Icon name="users" size={16} />}
        footer={<><Button onClick={() => setCreateOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="plus" type="submit" form="create-user-form" loading={saving}>{t.create}</Button></>}>
        <form id="create-user-form" onSubmit={create} className="space-y-4">
          {modalError && <div role="alert" className="flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger"><Icon name="alert" size={15} /> {modalError}</div>}
          <Field label={t.email}><input type="email" placeholder="user@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="field" required /></Field>
          <Field label={t.passwordOptional} hint={t.passwordOptionalHint}><input type="password" minLength={6} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="field" /></Field>
          <Field label={t.trafficLimit} hint={t.valueInGB}><input type="number" min={1} value={form.trafficLimit} onChange={(e) => setForm({ ...form, trafficLimit: Number(e.target.value) })} className="field" /></Field>
          <Field label={t.telegramId} hint={t.telegramIdHint}><input inputMode="numeric" pattern="[0-9]{5,12}" value={form.telegramId} onChange={(e) => setForm({ ...form, telegramId: e.target.value })} className="field" /></Field>
        </form>
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => { setEditing(null); setModalError(''); }} title={editing?.email || ''} subtitle={t.editUserSubtitle}
        footer={<><Button onClick={() => setEditing(null)}>{t.cancel}</Button><Button variant="primary" icon="check" type="submit" form="edit-user-form" loading={saving}>{t.save}</Button></>}>
        <form id="edit-user-form" onSubmit={save} className="space-y-4">
          {modalError && <div role="alert" className="flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger"><Icon name="alert" size={15} /> {modalError}</div>}
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
              <p className="mb-2 text-xs font-semibold text-subtle">{t.subscriptionLink}</p>
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-3">
                <code className="mono min-w-0 flex-1 break-all text-xs text-muted">{connection.subscriptionUrl}</code>
                <IconButton icon="copy" label={t.copyLink} tone="brand" onClick={() => copyText(connection.subscriptionUrl)} />
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-subtle">{t.connectionKey}</p>
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
                <Field label={t.deviceLimit} hint={t.deviceLimitHint}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    step={1}
                    placeholder="0"
                    value={deviceLimitInput}
                    onChange={(e) => setDeviceLimitInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                    className="field"
                  />
                </Field>
                <Button icon="check" loading={saving} onClick={async () => {
                  const value = deviceLimitInput === '' ? 0 : Number(deviceLimitInput);
                  if (!Number.isInteger(value) || value < 0 || value > 100) {
                    setDeviceLimitError(t.deviceLimitRange);
                    return;
                  }
                  setDeviceLimitError('');
                  setSaving(true);
                  try {
                    await api.patch(`/api/users/${connection.id}`, { deviceLimit: value });
                    setConnection({ ...connection, deviceLimit: value });
                    setDeviceLimitInput(String(value));
                    setNotice(value === 0 ? t.deviceLimitSavedUnlimited : `${t.deviceLimitSaved}: ${value}`);
                    setTimeout(() => setNotice(''), 3000);
                  } catch (e: any) {
                    setDeviceLimitError(e.message);
                  } finally {
                    setSaving(false);
                  }
                }}>{t.save}</Button>
              </div>
              {deviceLimitError && (
                <div role="alert" className="mb-2 flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
                  <Icon name="alert" size={14} /> {deviceLimitError}
                </div>
              )}
              <p className="-mt-2 mb-3 text-[11px] text-subtle">
                {t.devices}: {devices.length} / {Number(connection.deviceLimit || 0) === 0 ? '∞' : connection.deviceLimit}
              </p>
              <p className="mb-2 text-xs font-semibold text-subtle">{t.devices}</p>
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
              <p className="mb-2 text-xs font-semibold text-subtle">{t.configProfiles}</p>
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
              <p className="mb-2 text-xs font-semibold text-subtle">{t.subscriptionTemplates}</p>
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
              <div className="mb-2 flex items-center gap-1.5">
                <p className="text-xs font-semibold text-subtle">{t.attachToInbound}</p>
                <HelpTip text={t.attachModeHint} />
              </div>
              <div className="mb-2">
                <Segmented
                  value={attachMode}
                  onChange={(mode) => {
                    setAttachMode(mode);
                    if (mode === 'one') setAttachIds((current) => current.slice(0, 1));
                  }}
                  options={[
                    { value: 'all', label: t.attachAll },
                    { value: 'selected', label: t.attachSelected },
                    { value: 'one', label: t.attachOne },
                  ]}
                />
              </div>
              {attachError && (
                <div role="alert" className="mb-2 flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
                  <Icon name="alert" size={14} /> {attachError}
                </div>
              )}
              {inbounds.length === 0 ? (
                <p className="text-xs text-subtle">{t.noInboundsYet}</p>
              ) : attachMode === 'all' ? (
                <p className="text-xs text-muted">{t.attachAllHint.replace('{n}', String(inbounds.length))}</p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line p-1">
                  {inbounds.map((inbound) => {
                    const fromSquad = (connection.inboundClients || []).some((c: any) => c.inboundId === inbound.id && c.sourceSquadId);
                    return (
                      <label key={inbound.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-surface-2">
                        <input
                          type={attachMode === 'one' ? 'radio' : 'checkbox'}
                          name="attach-inbound"
                          checked={attachIds.includes(inbound.id)}
                          onChange={() => toggleAttach(inbound.id)}
                        />
                        <span className="mono flex-1 truncate">{inbound.tag}</span>
                        {fromSquad && <Badge tone="cyan">{t.fromSquad}</Badge>}
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-subtle">
                  {attachMode === 'all' ? '' : `${t.selectedCount}: ${attachIds.length}`}
                </span>
                <Button
                  variant="primary"
                  icon="check"
                  onClick={attach}
                  loading={saving}
                  disabled={inbounds.length === 0 || (attachMode === 'one' && attachIds.length !== 1)}
                >
                  {t.saveBindings}
                </Button>
              </div>
            </div>
            <div className="border-t border-line pt-4">
              <p className="text-xs font-semibold text-subtle">{t.externalLinks}</p>
              <p className="mb-2 text-[10px] text-muted">{t.externalLinksSubtitle}</p>
              {externalLinkError && (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
                  <Icon name="alert" size={14} /> {externalLinkError}
                </div>
              )}
              <div className="space-y-1">
                {externalLinks.length === 0 && <p className="text-xs text-subtle">{t.externalLinkEmpty}</p>}
                {externalLinks.map((link) => (
                  <div key={link.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2">
                    <Badge tone={link.kind === 'subscription' ? 'cyan' : 'brand'}>
                      {link.kind === 'subscription' ? t.externalLinkSubscription : t.externalLinkLink}
                    </Badge>
                    <span className="max-w-[140px] truncate text-xs text-fg" title={link.remark || ''}>
                      {link.remark || '—'}
                    </span>
                    <code className="mono min-w-0 flex-1 truncate text-xs text-muted" title={link.value}>{link.value}</code>
                    <Badge tone={link.enabled ? 'success' : 'neutral'}>{link.enabled ? t.enabled : t.disabled}</Badge>
                    <IconButton icon="trash" label={t.externalLinkDelete} tone="danger" onClick={() => deleteExternalLink(link.id)} />
                    {link.lastFetchError && (
                      <p className="w-full text-[10px] text-danger">{t.externalLinkError}: {link.lastFetchError}</p>
                    )}
                  </div>
                ))}
              </div>
              <form onSubmit={addExternalLink} className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <Field label={t.externalLinkKind}>
                  <select
                    className="field"
                    value={externalLinkForm.kind}
                    onChange={(e) => setExternalLinkForm((form) => ({ ...form, kind: e.target.value as 'link' | 'subscription' }))}
                  >
                    <option value="link">{t.externalLinkLink}</option>
                    <option value="subscription">{t.externalLinkSubscription}</option>
                  </select>
                </Field>
                <Field label={t.externalLinkValue}>
                  <input
                    className="field"
                    value={externalLinkForm.value}
                    placeholder={externalLinkForm.kind === 'link' ? 'vless://…' : 'https://provider/sub/...'}
                    onChange={(e) => setExternalLinkForm((form) => ({ ...form, value: e.target.value }))}
                  />
                </Field>
                <Field label={t.externalLinkRemark}>
                  <input
                    className="field"
                    value={externalLinkForm.remark}
                    onChange={(e) => setExternalLinkForm((form) => ({ ...form, remark: e.target.value }))}
                  />
                </Field>
                <Button type="submit" icon="plus" loading={externalLinkSaving} disabled={!externalLinkForm.value.trim()}>
                  {t.externalLinkAdd}
                </Button>
              </form>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
