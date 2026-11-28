// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, Field, IconButton, Modal, PageHeader, Toggle, formatBytes } from '../../components/ui';
import { QRCodeSVG } from 'qrcode.react';

type InboundRow = {
  id: string;
  tag: string;
  protocol: string;
  port: number;
  listen?: string;
  transport?: string;
  security?: string;
  flow?: string | null;
  path?: string | null;
  sni?: string | null;
  serviceName?: string | null;
  trafficLimit?: string | number;
  trafficUsed?: string | number;
  expiresAt?: string | null;
  resetSchedule?: string;
  resetDay?: number | null;
  enabled?: boolean;
  settings?: Record<string, unknown>;
  node?: { name: string } | null;
  clients?: Array<{ userId: string }>;
};

type Recipe = {
  id: string;
  name: string;
  description?: string;
  nameRu?: string;
  descriptionRu?: string;
  purpose?: 'main' | 'spare' | 'test';
  port?: number;
  portBusyBy?: string | null;
  source?: string;
  pluginId?: string;
};

type Created = { id: string; tag: string; nodeId: string; applied: boolean; applyError: string; bound: number | null };

type Client = { userId: string; trafficLimitGb: number; expiresAt: string; enabled: boolean; comment: string; sortIndex: number };

type InboundForm = {
  tag: string;
  protocol: string;
  port: number | '';
  nodeId: string;
  listen: string;
  transport: string;
  security: string;
  flow: string;
  path: string;
  sni: string;
  serviceName: string;
  trafficLimitGb: number | '';
  expiresAt: string;
  resetSchedule: string;
  resetDay: number | '';
  enabled: boolean;
  settingsText: string;
  fallbacks: Array<{ childId: string; path: string; alpn: string; dest: string; xver: number }>;
  clients: Client[];
};

const emptyForm: InboundForm = {
  tag: '', protocol: 'vless', port: 443, nodeId: '', listen: '0.0.0.0',
  transport: 'tcp', security: 'reality', flow: '', path: '/ws', sni: '', serviceName: 'xss',
  trafficLimitGb: 0, expiresAt: '', resetSchedule: 'never', resetDay: 1,
  enabled: true, settingsText: '{}', fallbacks: [], clients: [],
};

const PROTOCOLS = ['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'tuic', 'wireguard', 'socks', 'http', 'mixed', 'dokodemo-door'];
const TRANSPORTS = ['tcp', 'ws', 'grpc', 'httpupgrade', 'xhttp'];
const SECURITIES = ['none', 'tls', 'reality'];
const RESETS = ['never', 'hourly', 'daily', 'weekly', 'monthly'];

const emptyClient = (sortIndex = 0): Client => ({ userId: '', trafficLimitGb: 0, expiresAt: '', enabled: true, comment: '', sortIndex });

const normalizeClients = (list: unknown): Client[] =>
  Array.isArray(list)
    ? list.map((c: any) => ({
        userId: c.userId || '',
        trafficLimitGb: Number(c.trafficLimit || 0) / 1024 ** 3,
        expiresAt: c.expiresAt ? String(c.expiresAt).slice(0, 10) : '',
        enabled: c.enabled !== false,
        comment: c.comment || '',
        sortIndex: c.sortIndex || 0,
      }))
    : [];

const normalizeFallbacks = (list: unknown): InboundForm['fallbacks'] =>
  Array.isArray(list)
    ? list.map((f: any) => ({ childId: f.childId, path: f.path || '', alpn: f.alpn || '', dest: f.dest || '', xver: f.xver || 0 }))
    : [];

const formFromRow = (row: InboundRow): InboundForm => ({
  tag: row.tag,
  protocol: row.protocol,
  port: row.port,
  nodeId: '',
  listen: row.listen || '0.0.0.0',
  transport: row.transport || 'tcp',
  security: row.security || 'none',
  flow: row.flow || '',
  path: row.path || '/ws',
  sni: row.sni || '',
  serviceName: row.serviceName || 'xss',
  trafficLimitGb: Number(row.trafficLimit || 0) / 1024 ** 3,
  expiresAt: row.expiresAt ? row.expiresAt.slice(0, 10) : '',
  resetSchedule: row.resetSchedule || 'never',
  resetDay: row.resetDay || 1,
  enabled: row.enabled ?? true,
  settingsText: JSON.stringify(row.settings || {}, null, 2),
  fallbacks: normalizeFallbacks((row as any).fallbacks),
  clients: normalizeClients((row as any).clients),
});

const clientPayload = (c: Client) => ({
  userId: c.userId,
  trafficLimit: Math.round(c.trafficLimitGb * 1024 ** 3),
  expiresAt: c.expiresAt || undefined,
  enabled: c.enabled,
  comment: c.comment || undefined,
  sortIndex: c.sortIndex,
});

export default function InboundsPage() {
  const { t, lang } = useLang();
  const [inbounds, setInbounds] = useState<InboundRow[]>([]);
  const [nodes, setNodes] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; email: string }[]>([]);
  const [squads, setSquads] = useState<Array<{ id: string; name: string; _count?: { users: number }; userCount?: number }>>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeId, setRecipeId] = useState('');
  const [portNote, setPortNote] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [qrUser, setQrUser] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<InboundForm>(emptyForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Client-list modal (edits the clients of a single inbound).
  const [clientsOpen, setClientsOpen] = useState(false);
  const [clientsInboundId, setClientsInboundId] = useState<string | null>(null);

  // Group modal (bulk-add users as clients of a single inbound).
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupInboundId, setGroupInboundId] = useState<string | null>(null);
  const [groupSquadId, setGroupSquadId] = useState('');
  const [groupBindings, setGroupBindings] = useState<Array<{ squadId: string; squadName: string; memberCount: number }>>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [ib, nd, us, rc, sq] = await Promise.all([
        api.get('/api/inbounds'),
        api.get('/api/nodes'),
        api.get('/api/users?limit=100').catch(() => ({ data: [] })),
        api.get('/api/inbounds/recipes').catch(() => ({ data: [] })),
        api.get('/api/squads').catch(() => []),
      ]);
      setInbounds(Array.isArray(ib) ? ib : ib.data || []);
      setNodes(Array.isArray(nd) ? nd : nd.data || []);
      setUsers(us.data || []);
      setRecipes(Array.isArray(rc) ? rc : rc.data || []);
      setSquads(Array.isArray(sq) ? sq : sq.data || []);
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

  const loadRecipes = async (nodeId: string) => {
    const rc: any = await api.get(`/api/inbounds/recipes${nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : ''}`).catch(() => []);
    setRecipes(Array.isArray(rc) ? rc : rc.data || []);
  };

  const recipeLabel = (r: Recipe) => {
    const name = lang === 'ru' && r.nameRu ? r.nameRu : r.name;
    return r.portBusyBy ? `${name} — ${lang === 'ru' ? 'порт занят' : 'port taken'}` : name;
  };

  const startCreate = () => {
    setEditing(null); setForm(emptyForm); setRecipeId(''); setPortNote(''); setError(''); setNotice('');
    setShowAdvanced(false); setOpen(true);
    void loadRecipes('');
  };

  const changeNode = (nodeId: string) => {
    setForm((prev) => ({ ...prev, nodeId }));
    if (editing) return;
    void loadRecipes(nodeId);
    if (recipeId) void chooseRecipe(recipeId, nodeId);
  };

  const startEdit = (row: InboundRow) => {
    setEditing(row.id);
    setForm(formFromRow(row));
    setRecipeId((row as any).recipe || '');
    setError('');
    setShowAdvanced(true);
    setOpen(true);
  };

  // Recipes are prepared server-side; the returned DTO fills the form, but every
  // field stays editable afterwards.
  const applyPrepared = (dto: any) => {
    if (!dto || typeof dto !== 'object') return;
    const str = (value: unknown, fallback: string) => (value === undefined ? fallback : value == null ? '' : String(value));
    setForm((prev) => ({
      ...prev,
      tag: str(dto.tag, prev.tag),
      protocol: str(dto.protocol, prev.protocol),
      port: dto.port === undefined ? prev.port : Number(dto.port),
      nodeId: str(dto.nodeId, prev.nodeId),
      listen: str(dto.listen, prev.listen),
      transport: str(dto.transport, prev.transport),
      security: str(dto.security, prev.security),
      flow: str(dto.flow, prev.flow),
      path: str(dto.path, prev.path),
      sni: str(dto.sni, prev.sni),
      serviceName: str(dto.serviceName, prev.serviceName),
      settingsText: dto.settings === undefined ? prev.settingsText : JSON.stringify(dto.settings ?? {}, null, 2),
      enabled: dto.enabled === undefined ? prev.enabled : Boolean(dto.enabled),
      trafficLimitGb: dto.trafficLimit === undefined ? prev.trafficLimitGb : Number(dto.trafficLimit) / 1024 ** 3,
      expiresAt: dto.expiresAt === undefined ? prev.expiresAt : str(dto.expiresAt, ''),
      resetSchedule: str(dto.resetSchedule, prev.resetSchedule),
      resetDay: dto.resetDay === undefined ? prev.resetDay : Number(dto.resetDay),
      fallbacks: Array.isArray(dto.fallbacks) ? normalizeFallbacks(dto.fallbacks) : prev.fallbacks,
      clients: Array.isArray(dto.clients) ? normalizeClients(dto.clients) : prev.clients,
    }));
  };

  const chooseRecipe = async (id: string, nodeId = form.nodeId) => {
    setRecipeId(id);
    setError('');
    setPortNote('');
    if (!id) return;
    setBusy(true);
    try {
      const dto: any = await api.post(`/api/inbounds/recipes/${encodeURIComponent(id)}/prepare`, {
        nodeId: nodeId || undefined,
        tag: form.tag || undefined,
      });
      applyPrepared(dto);
      if (dto?.autoPort) {
        setPortNote(lang === 'ru'
          ? `Порт ${dto.recipePort} на ноде занят подключением «${dto.portBusyBy || '—'}», выбран свободный ${dto.port}. Если нужно просто добавить пользователей, привяжите их к существующему подключению.`
          : `Port ${dto.recipePort} is taken on this node by "${dto.portBusyBy || '—'}", picked free port ${dto.port}. To add users, bind them to the existing inbound instead.`);
      }
    } catch (e: any) {
      setError(e.message || t.recipeFailed);
    } finally {
      setBusy(false);
    }
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
      nodeId: form.nodeId || undefined,
      listen: form.listen,
      transport: form.transport,
      security: form.security,
      flow: form.flow || undefined,
      path: form.path || undefined,
      sni: form.sni || undefined,
      serviceName: form.serviceName || undefined,
      trafficLimit: Math.round(Number(form.trafficLimitGb || 0) * 1024 ** 3),
      expiresAt: form.expiresAt || undefined,
      resetSchedule: form.resetSchedule,
      resetDay: form.resetSchedule === 'monthly' ? Number(form.resetDay || 1) : undefined,
      enabled: form.enabled,
      settings,
      fallbacks: form.fallbacks.filter((f) => f.childId),
      clients: form.clients.filter((c) => c.userId).map(clientPayload),
    };
    try {
      if (editing) {
        await api.patch(`/api/inbounds/${editing}`, body);
      } else {
        const row: any = await api.post('/api/inbounds', body);
        const next: Created = { id: row.id, tag: row.tag, nodeId: form.nodeId, applied: false, applyError: '', bound: null };
        // A new inbound only serves clients once the node runs the new config.
        if (form.nodeId) {
          try { await api.post(`/api/nodes/${form.nodeId}/apply`, {}); next.applied = true; }
          catch (err: any) { next.applyError = err.message || 'apply failed'; }
        }
        setCreated(next); setQrUser(''); setQrUrl('');
      }
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

  const closeCreated = () => { setCreated(null); setQrUrl(''); setQrUser(''); setError(''); };

  const remove = async (id: string) => {
    if (!confirm(t.confirmDelete)) return;
    try {
      await api.delete(`/api/inbounds/${id}`);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const closeClients = () => { setClientsOpen(false); setClientsInboundId(null); setError(''); };

  const openClients = (row: InboundRow, addEmpty = false) => {
    setForm(formFromRow(row));
    setClientsInboundId(row.id);
    if (addEmpty) setForm((prev) => ({ ...prev, clients: [...prev.clients, emptyClient(prev.clients.length)] }));
    setError('');
    setClientsOpen(true);
  };

  const saveClients = async () => {
    if (!clientsInboundId) return;
    setError('');
    setBusy(true);
    try {
      await api.patch(`/api/inbounds/${clientsInboundId}`, {
        clients: form.clients.filter((c) => c.userId).map(clientPayload),
      });
      closeClients();
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const closeGroup = () => { setGroupOpen(false); setGroupInboundId(null); setGroupSquadId(''); setGroupBindings([]); setError(''); };

  const refreshGroupBindings = async (inboundId: string) => {
    const data: any = await api.get(`/api/inbounds/${inboundId}/squads`);
    setGroupBindings(Array.isArray(data) ? data : data.items || []);
  };

  const openGroup = (row: InboundRow) => {
    setNotice('');
    setForm(formFromRow(row));
    setGroupInboundId(row.id);
    setGroupSquadId('');
    setGroupBindings([]);
    setError('');
    setGroupOpen(true);
    refreshGroupBindings(row.id).catch((e: any) => setError(e.message));
  };

  const bindGroup = async (squadId: string) => {
    if (!groupInboundId) return;
    setError('');
    setBusy(true);
    try {
      await api.post(`/api/inbounds/${groupInboundId}/squads`, { squadId });
      closeGroup();
      setNotice(t.groupBound);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const unbindGroup = async (squadId: string) => {
    if (!groupInboundId) return;
    setError('');
    setBusy(true);
    try {
      await api.delete(`/api/inbounds/${groupInboundId}/squads/${encodeURIComponent(squadId)}`);
      closeGroup();
      setNotice(t.groupUnbound);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const bindCreated = async (scope: 'all' | 'selected') => {
    if (!created) return;
    if (scope === 'selected' && !qrUser) return;
    setError(''); setBusy(true);
    try {
      const result: any = await api.post(`/api/inbounds/${created.id}/users/bulk`, {
        mode: 'add', scope, ...(scope === 'selected' ? { userIds: [qrUser] } : {}),
      });
      let applyError = created.applyError;
      if (created.nodeId) {
        try { await api.post(`/api/nodes/${created.nodeId}/apply`, {}); applyError = ''; }
        catch (err: any) { applyError = err.message || 'apply failed'; }
      }
      setCreated({ ...created, bound: (created.bound || 0) + Number(result.affected || 0), applied: !applyError, applyError });
      if (scope === 'selected') await showQr(qrUser);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const showQr = async (userId: string) => {
    setQrUser(userId); setQrUrl('');
    if (!userId) return;
    try {
      const data: any = await api.get(`/api/users/${userId}`);
      setQrUrl(data.subscriptionUrl || '');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const selectedRecipe = recipes.find((r) => r.id === recipeId);
  const clientsInbound = inbounds.find((i) => i.id === clientsInboundId);
  const groupInbound = inbounds.find((i) => i.id === groupInboundId);

  const columns = useMemo<ColumnDef<InboundRow>[]>(
    () => [
      {
        accessorKey: 'tag',
        size: 220,
        header: t.name,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-2 text-cyan"><Icon name="plug" size={15} /></div>
            <div>
              <p className="font-medium text-fg">{row.original.tag}</p>
              <p className="text-[10px] text-subtle">{row.original.listen || '0.0.0.0'}:{row.original.port}</p>
            </div>
          </div>
        ),
      },
      { accessorKey: 'protocol', size: 80, header: t.protocol, cell: ({ row }) => <Badge tone="brand">{row.original.protocol.toUpperCase()}</Badge> },
      {
        id: 'clients', size: 60, header: t.users,
        cell: ({ row }) => <span className="text-xs text-muted tabular-nums">{row.original.clients?.length || 0}</span>,
      },
      {
        id: 'transport', size: 80, header: `${t.transport} / ${t.security}`,
        cell: ({ row }) => <span className="text-xs text-muted">{row.original.transport} / {row.original.security}</span>,
      },
      {
        id: 'traffic', size: 90, header: t.trafficUsed,
        cell: ({ row }) => (
          <span className="text-xs text-fg tabular-nums">
            {formatBytes(row.original.trafficUsed || 0)} / {Number(row.original.trafficLimit || 0) > 0 ? formatBytes(row.original.trafficLimit) : '∞'}
          </span>
        ),
      },
      {
        accessorKey: 'expiresAt', size: 80, header: t.expiresAt,
        cell: ({ row }) => row.original.expiresAt ? <span className="text-xs text-muted">{new Date(row.original.expiresAt).toLocaleDateString()}</span> : <span className="text-subtle">—</span>,
      },
      {
        accessorKey: 'enabled', size: 70, header: t.enabled,
        cell: ({ row }) => row.original.enabled ? <Badge tone="success" dot>{t.enabled}</Badge> : <Badge tone="neutral" dot>{t.disabled}</Badge>,
      },
      {
        id: 'actions', size: 190, header: t.actions, enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-nowrap items-center justify-end gap-0.5">
            <IconButton icon="list" label={t.clientList} className="!h-7 !w-7 shrink-0" onClick={() => openClients(row.original)} />
            <IconButton icon="plus" label={t.addClient} className="!h-7 !w-7 shrink-0" onClick={() => openClients(row.original, true)} />
            <IconButton icon="users" label={t.group} className="!h-7 !w-7 shrink-0" onClick={() => openGroup(row.original)} />
            <IconButton icon="edit" label={t.edit} className="!h-7 !w-7 shrink-0" onClick={() => startEdit(row.original)} />
            <IconButton icon="trash" label={t.delete} tone="danger" className="!h-7 !w-7 shrink-0" onClick={() => remove(row.original.id)} />
          </div>
        ),
      },
    ],
    [t, openClients, openGroup, remove],
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

      {notice && !open && !clientsOpen && !groupOpen && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs text-success" role="status">
          <Icon name="checkCircle" size={15} /> {notice}
        </div>
      )}
      {error && !open && !clientsOpen && !groupOpen && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      <DataTable data={inbounds} columns={columns} loading={loading} getRowId={(row) => row.id} />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t.editInbound : t.newInbound}
        subtitle={t.exposeProtocol}
        icon={<Icon name="plug" size={16} />}
        size="lg"
        footer={<><Button onClick={() => setOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="check" form="inbound-form" loading={busy}>{editing ? t.save : t.create}</Button></>}
      >
        <form id="inbound-form" onSubmit={submit} className="space-y-5">
          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              <Icon name="alert" size={14} /> {error}
            </div>
          )}

          <div className="rounded-lg border border-line bg-surface-2/40 p-3">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t.node} hint={!editing ? (lang === 'ru' ? 'Выберите ноду до рецепта: от неё зависят домен (SNI) и свободный порт. Пусто — подключение для всех нод.' : 'Pick the node before the recipe: it defines the domain (SNI) and the free port. Empty means all nodes.') : undefined}>
                <select value={form.nodeId} onChange={(e) => changeNode(e.target.value)} className="field" disabled={Boolean(editing) || busy}>
                  <option value="">{t.global}</option>
                  {nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
                </select>
              </Field>
              <Field label={t.inboundRecipe} hint={t.recipeAutoHint}>
                <select value={recipeId} onChange={(e) => chooseRecipe(e.target.value)} className="field" disabled={busy}>
                  <option value="">{t.noRecipe}</option>
                  {(['main', 'spare', 'test'] as const).map((purpose) => {
                    const list = recipes.filter((r) => (r.purpose || (r.source === 'plugin' ? 'spare' : 'main')) === purpose);
                    if (!list.length) return null;
                    const label = lang === 'ru'
                      ? { main: 'Для клиентов', spare: 'Запасные и плагины', test: 'Для проверки' }[purpose]
                      : { main: 'For clients', spare: 'Spare and plugins', test: 'Diagnostics' }[purpose];
                    return <optgroup key={purpose} label={label}>{list.map((r) => <option key={r.id} value={r.id}>{recipeLabel(r)}</option>)}</optgroup>;
                  })}
                </select>
              </Field>
              {selectedRecipe && (
                <div className="self-end space-y-0.5 text-[11px] text-subtle sm:col-span-2">
                  {(lang === 'ru' ? selectedRecipe.descriptionRu || selectedRecipe.description : selectedRecipe.description) && (
                    <p>{lang === 'ru' ? selectedRecipe.descriptionRu || selectedRecipe.description : selectedRecipe.description}</p>
                  )}
                  <p>{[selectedRecipe.source, selectedRecipe.pluginId].filter(Boolean).join(' · ')}</p>
                </div>
              )}
            </div>
          </div>

          {!editing && form.nodeId && (() => {
            const existing = inbounds.filter((i: any) => i.nodeId === form.nodeId || i.node?.id === form.nodeId);
            if (!existing.length) return null;
            return (
              <div className="rounded-lg border border-brand/25 bg-brand/5 px-3 py-2 text-xs text-muted">
                <p className="mb-1.5 text-fg">{lang === 'ru'
                  ? 'На этой ноде уже есть подключения. Чтобы дать доступ новым пользователям, новое подключение не нужно — привяжите их к существующему:'
                  : 'This node already has inbounds. To give new users access, bind them to an existing one instead of creating another:'}</p>
                <div className="flex flex-wrap gap-1.5">
                  {existing.map((i) => (
                    <Button key={i.id} size="sm" variant="ghost" icon="users" onClick={() => { setOpen(false); openClients(i, true); }}>
                      {i.tag} :{i.port}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })()}

          {portNote && (
            <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
              <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> {portNote}
            </div>
          )}

          <div>
            <p className="mb-3 text-xs font-semibold text-subtle">{t.name} / {t.protocol}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t.name}><input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} className="field" required /></Field>
              <Field label={t.protocol}>
                <select value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })} className="field">
                  {PROTOCOLS.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                </select>
              </Field>
              <Field label={t.port} hint={lang === 'ru' ? 'На ноде снаружи доступны только порты 443, 2053, 2054, 4436, 5050–5060, 10000–10010. Один порт — одно подключение на ноде.' : 'Only ports 443, 2053, 2054, 4436, 5050–5060, 10000–10010 are reachable on a node. One port per inbound per node.'}><input type="number" min={1} max={65535} value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value === '' ? '' : Number(e.target.value) })} className="field" required /></Field>
              <Field label={t.listen}><input value={form.listen} onChange={(e) => setForm({ ...form, listen: e.target.value })} className="field" /></Field>
            </div>
          </div>

          <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="flex w-full items-center gap-2 border-t border-line pt-4 text-left text-xs font-semibold text-subtle hover:text-fg" aria-expanded={showAdvanced}>
            <Icon name={showAdvanced ? 'chevronDown' : 'chevronRight'} size={14} />
            {lang === 'ru' ? 'Расширенные настройки' : 'Advanced settings'}
            <span className="font-normal text-subtle">— {lang === 'ru' ? 'транспорт, ключи, лимиты, fallback, JSON. Рецепт уже заполнил их.' : 'transport, keys, limits, fallbacks, JSON. The recipe has filled them.'}</span>
          </button>

          {showAdvanced && (<>
          <div className="pt-1">
            <p className="mb-3 text-xs font-semibold text-subtle">{t.transport} / {t.security}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.transport}>
                <select value={form.transport} onChange={(e) => setForm({ ...form, transport: e.target.value })} className="field">
                  {TRANSPORTS.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                </select>
              </Field>
              <Field label={t.security}>
                <select value={form.security} onChange={(e) => setForm({ ...form, security: e.target.value })} className="field">
                  {SECURITIES.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                </select>
              </Field>
              <Field label={t.flow}>
                <select value={form.flow} onChange={(e) => setForm({ ...form, flow: e.target.value })} className="field">
                  <option value="">{t.none}</option>
                  <option value="xtls-rprx-vision">xtls-rprx-vision</option>
                  <option value="xtls-rprx-vision-udp443">xtls-rprx-vision-udp443</option>
                </select>
              </Field>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label={t.path}><input value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} className="field" /></Field>
              <Field label={t.sni}><input value={form.sni} onChange={(e) => setForm({ ...form, sni: e.target.value })} className="field" /></Field>
              <Field label={t.serviceName}><input value={form.serviceName} onChange={(e) => setForm({ ...form, serviceName: e.target.value })} className="field" /></Field>
            </div>
          </div>

          <div className="border-t border-line pt-5">
            <p className="mb-3 text-xs font-semibold text-subtle">{t.trafficLimit} / {t.expiresAt}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t.trafficLimit} hint="GB"><input type="number" min={0} value={form.trafficLimitGb} onChange={(e) => setForm({ ...form, trafficLimitGb: e.target.value === '' ? '' : Number(e.target.value) })} className="field" /></Field>
              <Field label={t.expiresAt}><input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="field" /></Field>
              <Field label={t.resetSchedule}>
                <select value={form.resetSchedule} onChange={(e) => setForm({ ...form, resetSchedule: e.target.value })} className="field">
                  {RESETS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              {form.resetSchedule === 'monthly' && (
                <Field label={t.resetDay}><input type="number" min={1} max={31} value={form.resetDay} onChange={(e) => setForm({ ...form, resetDay: e.target.value === '' ? '' : Number(e.target.value) })} className="field" /></Field>
              )}
            </div>
          </div>

          <div className="border-t border-line pt-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-subtle">{t.fallbacks}</p>
                <p className="text-[11px] text-subtle">{t.fallbackHint}</p>
              </div>
              <Button size="sm" icon="plus" onClick={() => setForm({ ...form, fallbacks: [...form.fallbacks, { childId: '', path: '', alpn: '', dest: '', xver: 0 }] })}>{t.addFallback}</Button>
            </div>
            {form.fallbacks.map((f, index) => (
              <div key={index} className="mb-2 grid gap-2 rounded-lg border border-line bg-surface-2/40 p-3 sm:grid-cols-2 lg:grid-cols-5">
                <Field label={t.childInbound}>
                  <select value={f.childId} onChange={(e) => { const fallbacks = [...form.fallbacks]; fallbacks[index] = { ...f, childId: e.target.value }; setForm({ ...form, fallbacks }); }} className="field">
                    <option value="">—</option>
                    {inbounds.filter((i) => i.id !== editing).map((i) => <option key={i.id} value={i.id}>{i.tag}</option>)}
                  </select>
                </Field>
                <Field label={t.path}><input value={f.path} onChange={(e) => { const fallbacks = [...form.fallbacks]; fallbacks[index] = { ...f, path: e.target.value }; setForm({ ...form, fallbacks }); }} className="field" /></Field>
                <Field label="ALPN"><input value={f.alpn} onChange={(e) => { const fallbacks = [...form.fallbacks]; fallbacks[index] = { ...f, alpn: e.target.value }; setForm({ ...form, fallbacks }); }} className="field" /></Field>
                <Field label={t.address}><input value={f.dest} onChange={(e) => { const fallbacks = [...form.fallbacks]; fallbacks[index] = { ...f, dest: e.target.value }; setForm({ ...form, fallbacks }); }} className="field" /></Field>
                <div className="flex items-end"><IconButton icon="trash" label={t.delete} tone="danger" onClick={() => setForm({ ...form, fallbacks: form.fallbacks.filter((_, i) => i !== index) })} /></div>
              </div>
            ))}
          </div>

          <div className="border-t border-line pt-5">
            <div className="max-w-3xl">
            <Field label={t.advancedSettings}>
              <textarea rows={6} value={form.settingsText} onChange={(e) => setForm({ ...form, settingsText: e.target.value })} className="field mono text-[11px]" />
            </Field>
            </div>
          </div>
          </>)}

          <Toggle checked={form.enabled} onChange={(value) => setForm({ ...form, enabled: value })} label={t.enabled} />
        </form>
      </Modal>

      <Modal
        open={Boolean(created)}
        onClose={closeCreated}
        title={lang === 'ru' ? 'Подключение создано' : 'Inbound created'}
        subtitle={created?.tag}
        icon={<Icon name="checkCircle" size={16} />}
        size="lg"
        footer={<Button variant="primary" onClick={closeCreated}>{lang === 'ru' ? 'Готово' : 'Done'}</Button>}
      >
        {created && (
          <div className="space-y-4">
            <div className="rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-xs">
              <p className={created.applied ? 'text-success' : 'text-warning'}>
                {created.applied
                  ? (lang === 'ru' ? 'Конфигурация ноды применена — подключение готово к работе.' : 'Node configuration applied — the inbound is ready.')
                  : (lang === 'ru' ? 'Примените конфигурацию ноды в разделе «Ноды», чтобы подключение заработало.' : 'Apply the node configuration in the Nodes section to activate it.')}
              </p>
              {created.applyError && <p className="mt-1 break-all text-danger">{created.applyError}</p>}
              {!created.nodeId && <p className="mt-1 text-subtle">{lang === 'ru' ? 'Подключение создано для всех нод; примените конфигурацию на нужной ноде.' : 'Created for all nodes; apply the config on the node you need.'}</p>}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-subtle">
                {created.bound !== null
                  ? (lang === 'ru' ? `Привязано пользователей: ${created.bound}` : `Users bound: ${created.bound}`)
                  : (lang === 'ru' ? 'Привязать пользователей' : 'Bind users')}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="primary" icon="users" disabled={busy} onClick={() => bindCreated('all')}>
                  {lang === 'ru' ? 'Все пользователи' : 'All users'}
                </Button>
                <select className="field max-w-xs" value={qrUser} onChange={(e) => showQr(e.target.value)} aria-label={t.user}>
                  <option value="">{lang === 'ru' ? 'Выберите пользователя…' : 'Select a user…'}</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
                </select>
                <Button size="sm" icon="plus" disabled={busy || !qrUser} onClick={() => bindCreated('selected')}>
                  {lang === 'ru' ? 'Привязать и показать QR' : 'Bind and show QR'}
                </Button>
              </div>
            </div>
            {qrUrl && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-line p-4">
                <QRCodeSVG value={qrUrl} size={160} />
                <p className="text-[11px] break-all text-center text-subtle">{qrUrl}</p>
                <Button size="sm" icon="copy" onClick={() => void navigator.clipboard.writeText(qrUrl)}>{t.copyLink}</Button>
              </div>
            )}
            <p className="text-[11px] text-subtle">
              {lang === 'ru'
                ? 'QR — ссылка на подписку пользователя. Отсканируйте её в клиенте. Ссылка обновится автоматически, если к подключению добавится ещё пользователей.'
                : 'QR is the user subscription link. Scan it in the client. It updates automatically when users are added.'}
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={clientsOpen}
        onClose={closeClients}
        title={t.clientList}
        subtitle={clientsInbound?.tag}
        icon={<Icon name="users" size={16} />}
        size="xl"
        footer={<><Button onClick={closeClients}>{t.cancel}</Button><Button variant="primary" icon="check" form="clients-form" loading={busy}>{t.save}</Button></>}
      >
        <form id="clients-form" onSubmit={(event) => { event.preventDefault(); void saveClients(); }} className="space-y-3">
          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              <Icon name="alert" size={14} /> {error}
            </div>
          )}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-subtle">{t.clientLimits}</p>
            <Button size="sm" icon="plus" onClick={() => setForm({ ...form, clients: [...form.clients, emptyClient(form.clients.length)] })}>{t.addClient}</Button>
          </div>
          {form.clients.length === 0 && <p className="text-xs text-subtle">{t.noData}</p>}
          <div className="overflow-x-auto rounded-lg border border-line">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[minmax(170px,1.4fr)_80px_130px_60px_minmax(110px,1fr)_74px] gap-2 border-b border-line bg-surface-2 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-subtle">
                <span>{t.user}</span>
                <span>{t.trafficLimit}</span>
                <span>{t.expiresAt}</span>
                <span>{t.sortOrder}</span>
                <span>{t.comment}</span>
                <span>{t.actions}</span>
              </div>
              {form.clients.map((c, index) => (
                <div key={index} className="grid grid-cols-[minmax(170px,1.4fr)_80px_130px_60px_minmax(110px,1fr)_74px] items-center gap-2 border-b border-line/60 px-2 py-1 last:border-b-0">
                  <select className="field !h-8 !text-xs" value={c.userId} onChange={(e) => { const clients = [...form.clients]; clients[index] = { ...c, userId: e.target.value }; setForm({ ...form, clients }); }} aria-label={t.user}>
                    <option value="">—</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
                  </select>
                  <input className="field !h-8 !px-2 !text-xs" type="number" min={0} value={c.trafficLimitGb} onChange={(e) => { const clients = [...form.clients]; clients[index] = { ...c, trafficLimitGb: Number(e.target.value) }; setForm({ ...form, clients }); }} aria-label={t.trafficLimit} />
                  <input className="field !h-8 !px-2 !text-xs" type="date" value={c.expiresAt} onChange={(e) => { const clients = [...form.clients]; clients[index] = { ...c, expiresAt: e.target.value }; setForm({ ...form, clients }); }} aria-label={t.expiresAt} />
                  <input className="field !h-8 !px-2 !text-xs" type="number" value={c.sortIndex} onChange={(e) => { const clients = [...form.clients]; clients[index] = { ...c, sortIndex: Number(e.target.value) }; setForm({ ...form, clients }); }} aria-label={t.sortOrder} />
                  <input className="field !h-8 !px-2 !text-xs" value={c.comment} onChange={(e) => { const clients = [...form.clients]; clients[index] = { ...c, comment: e.target.value }; setForm({ ...form, clients }); }} aria-label={t.comment} />
                  <div className="flex items-center justify-end gap-1">
                    <Toggle label={t.enabled} checked={c.enabled} onChange={(v) => { const clients = [...form.clients]; clients[index] = { ...c, enabled: v }; setForm({ ...form, clients }); }} />
                    <IconButton icon="trash" label={t.delete} tone="danger" className="!h-7 !w-7" onClick={() => setForm({ ...form, clients: form.clients.filter((_, i) => i !== index) })} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={groupOpen}
        onClose={closeGroup}
        title={t.groupModalTitle}
        subtitle={groupInbound?.tag}
        icon={<Icon name="users" size={16} />}
        size="lg"
        footer={<Button onClick={closeGroup}>{t.close}</Button>}
      >
        <div className="space-y-3">
          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              <Icon name="alert" size={14} /> {error}
            </div>
          )}
          <p className="text-xs text-muted">{t.selectSquad}</p>
          <p className="text-[11px] text-subtle">{t.groupLiveHint}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {squads.map((squad) => {
              const bound = groupBindings.some((binding) => binding.squadId === squad.id);
              return (
                <div key={squad.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-xs text-fg">
                  <span className="min-w-0 flex-1 truncate">{squad.name}</span>
                  <span className="shrink-0 text-[11px] text-subtle">{squad._count?.users ?? squad.userCount ?? 0}</span>
                  {bound ? (
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => unbindGroup(squad.id)}>{t.unbind}</Button>
                  ) : (
                    <Button size="sm" variant="ghost" icon="plus" disabled={busy} onClick={() => bindGroup(squad.id)}>{t.bind}</Button>
                  )}
                </div>
              );
            })}
            {squads.length === 0 && <p className="text-xs text-subtle">{t.noSquads}</p>}
          </div>
        </div>
      </Modal>
    </>
  );
}
