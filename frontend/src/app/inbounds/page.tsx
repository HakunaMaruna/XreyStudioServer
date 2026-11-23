'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, Field, IconButton, Modal, PageHeader, Toggle, formatBytes } from '../../components/ui';

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
};

type InboundForm = {
  tag: string;
  protocol: string;
  port: number;
  nodeId: string;
  listen: string;
  transport: string;
  security: string;
  flow: string;
  path: string;
  sni: string;
  serviceName: string;
  trafficLimitGb: number;
  expiresAt: string;
  resetSchedule: string;
  resetDay: number;
  enabled: boolean;
  settingsText: string;
  fallbacks: Array<{ childId: string; path: string; alpn: string; dest: string; xver: number }>;
  clients: Array<{ userId: string; trafficLimitGb: number; expiresAt: string; enabled: boolean; comment: string; sortIndex: number }>;
};

const emptyForm: InboundForm = {
  tag: '', protocol: 'vless', port: 443, nodeId: '', listen: '0.0.0.0',
  transport: 'tcp', security: 'reality', flow: '', path: '/ws', sni: '', serviceName: 'xss',
  trafficLimitGb: 0, expiresAt: '', resetSchedule: 'never', resetDay: 1,
  enabled: true, settingsText: '{}', fallbacks: [], clients: [],
};

const PROTOCOLS = ['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'tuic', 'wireguard'];
const TRANSPORTS = ['tcp', 'ws', 'grpc', 'httpupgrade', 'xhttp'];
const SECURITIES = ['none', 'tls', 'reality'];
const RESETS = ['never', 'hourly', 'daily', 'weekly', 'monthly'];

export default function InboundsPage() {
  const { t } = useLang();
  const [inbounds, setInbounds] = useState<InboundRow[]>([]);
  const [nodes, setNodes] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<InboundForm>(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [ib, nd, us] = await Promise.all([
        api.get('/api/inbounds'),
        api.get('/api/nodes'),
        api.get('/api/users?limit=100').catch(() => ({ data: [] })),
      ]);
      setInbounds(Array.isArray(ib) ? ib : ib.data || []);
      setNodes(Array.isArray(nd) ? nd : nd.data || []);
      setUsers(us.data || []);
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

  const startCreate = () => { setEditing(null); setForm(emptyForm); setError(''); setOpen(true); };

  const startEdit = (row: InboundRow) => {
    setEditing(row.id);
    setForm({
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
      fallbacks: (row as any).fallbacks?.map((f: any) => ({ childId: f.childId, path: f.path || '', alpn: f.alpn || '', dest: f.dest || '', xver: f.xver || 0 })) || [],
      clients: (row as any).clients?.map((c: any) => ({
        userId: c.userId,
        trafficLimitGb: Number(c.trafficLimit || 0) / 1024 ** 3,
        expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : '',
        enabled: c.enabled,
        comment: c.comment || '',
        sortIndex: c.sortIndex || 0,
      })) || [],
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
      nodeId: form.nodeId || undefined,
      listen: form.listen,
      transport: form.transport,
      security: form.security,
      flow: form.flow || undefined,
      path: form.path || undefined,
      sni: form.sni || undefined,
      serviceName: form.serviceName || undefined,
      trafficLimit: Math.round(form.trafficLimitGb * 1024 ** 3),
      expiresAt: form.expiresAt || undefined,
      resetSchedule: form.resetSchedule,
      resetDay: form.resetSchedule === 'monthly' ? form.resetDay : undefined,
      enabled: form.enabled,
      settings,
      fallbacks: form.fallbacks.filter((f) => f.childId),
      clients: form.clients.filter((c) => c.userId).map((c) => ({
        userId: c.userId,
        trafficLimit: Math.round(c.trafficLimitGb * 1024 ** 3),
        expiresAt: c.expiresAt || undefined,
        enabled: c.enabled,
        comment: c.comment || undefined,
        sortIndex: c.sortIndex,
      })),
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
              <p className="text-[10px] text-subtle">{row.original.listen || '0.0.0.0'}:{row.original.port}</p>
            </div>
          </div>
        ),
      },
      { accessorKey: 'protocol', header: t.protocol, cell: ({ row }) => <Badge tone="brand">{row.original.protocol.toUpperCase()}</Badge> },
      {
        id: 'transport', header: `${t.transport} / ${t.security}`,
        cell: ({ row }) => <span className="text-xs text-muted">{row.original.transport} / {row.original.security}</span>,
      },
      {
        id: 'traffic', header: t.trafficUsed,
        cell: ({ row }) => (
          <span className="text-xs text-fg tabular-nums">
            {formatBytes(row.original.trafficUsed || 0)} / {Number(row.original.trafficLimit || 0) > 0 ? formatBytes(row.original.trafficLimit) : '∞'}
          </span>
        ),
      },
      {
        accessorKey: 'expiresAt', header: t.expiresAt,
        cell: ({ row }) => row.original.expiresAt ? <span className="text-xs text-muted">{new Date(row.original.expiresAt).toLocaleDateString()}</span> : <span className="text-subtle">—</span>,
      },
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
        onClose={() => setOpen(false)}
        title={editing ? t.editInbound : t.newInbound}
        subtitle={t.exposeProtocol}
        icon={<Icon name="plug" size={16} />}
        size="xl"
        footer={<><Button onClick={() => setOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="check" onClick={submit} loading={busy}>{editing ? t.save : t.create}</Button></>}
      >
        <form onSubmit={submit} className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              <Icon name="alert" size={14} /> {error}
            </div>
          )}

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">{t.name} / {t.protocol}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t.name}><input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} className="field" required /></Field>
              <Field label={t.protocol}>
                <select value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })} className="field">
                  {PROTOCOLS.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                </select>
              </Field>
              <Field label={t.port}><input type="number" min={1} max={65535} value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} className="field" required /></Field>
              <Field label={t.listen}><input value={form.listen} onChange={(e) => setForm({ ...form, listen: e.target.value })} className="field" /></Field>
            </div>
            <div className="mt-4">
              <Field label={t.node} hint={!editing ? t.leaveEmptyGlobal : undefined}>
                <select value={form.nodeId} onChange={(e) => setForm({ ...form, nodeId: e.target.value })} className="field" disabled={Boolean(editing)}>
                  <option value="">{t.global}</option>
                  {nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <div className="border-t border-line pt-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">{t.transport} / {t.security}</p>
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
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">{t.trafficLimit} / {t.expiresAt}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t.trafficLimit} hint="GB"><input type="number" min={0} value={form.trafficLimitGb} onChange={(e) => setForm({ ...form, trafficLimitGb: Number(e.target.value) })} className="field" /></Field>
              <Field label={t.expiresAt}><input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="field" /></Field>
              <Field label={t.resetSchedule}>
                <select value={form.resetSchedule} onChange={(e) => setForm({ ...form, resetSchedule: e.target.value })} className="field">
                  {RESETS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              {form.resetSchedule === 'monthly' && (
                <Field label={t.resetDay}><input type="number" min={1} max={31} value={form.resetDay} onChange={(e) => setForm({ ...form, resetDay: Number(e.target.value) })} className="field" /></Field>
              )}
            </div>
          </div>

          <div className="border-t border-line pt-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-subtle">{t.fallbacks}</p>
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
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-subtle">{t.clientLimits}</p>
              <Button size="sm" icon="plus" onClick={() => setForm({ ...form, clients: [...form.clients, { userId: '', trafficLimitGb: 0, expiresAt: '', enabled: true, comment: '', sortIndex: 0 }] })}>{t.addClient}</Button>
            </div>
            {form.clients.map((c, index) => (
              <div key={index} className="mb-2 grid gap-2 rounded-lg border border-line bg-surface-2/40 p-3 sm:grid-cols-2 lg:grid-cols-6">
                <Field label={t.user}>
                  <select value={c.userId} onChange={(e) => { const clients = [...form.clients]; clients[index] = { ...c, userId: e.target.value }; setForm({ ...form, clients }); }} className="field">
                    <option value="">—</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
                  </select>
                </Field>
                <Field label={t.trafficLimit} hint="GB"><input type="number" min={0} value={c.trafficLimitGb} onChange={(e) => { const clients = [...form.clients]; clients[index] = { ...c, trafficLimitGb: Number(e.target.value) }; setForm({ ...form, clients }); }} className="field" /></Field>
                <Field label={t.expiresAt}><input type="date" value={c.expiresAt} onChange={(e) => { const clients = [...form.clients]; clients[index] = { ...c, expiresAt: e.target.value }; setForm({ ...form, clients }); }} className="field" /></Field>
                <Field label={t.sortOrder}><input type="number" value={c.sortIndex} onChange={(e) => { const clients = [...form.clients]; clients[index] = { ...c, sortIndex: Number(e.target.value) }; setForm({ ...form, clients }); }} className="field" /></Field>
                <Field label={t.comment}><input value={c.comment} onChange={(e) => { const clients = [...form.clients]; clients[index] = { ...c, comment: e.target.value }; setForm({ ...form, clients }); }} className="field" /></Field>
                <div className="flex items-end gap-2">
                  <Toggle checked={c.enabled} onChange={(v) => { const clients = [...form.clients]; clients[index] = { ...c, enabled: v }; setForm({ ...form, clients }); }} />
                  <IconButton icon="trash" label={t.delete} tone="danger" onClick={() => setForm({ ...form, clients: form.clients.filter((_, i) => i !== index) })} />
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-line pt-5">
            <Field label={t.advancedSettings}>
              <textarea rows={6} value={form.settingsText} onChange={(e) => setForm({ ...form, settingsText: e.target.value })} className="field mono text-[11px]" />
            </Field>
            <div className="mt-4"><Toggle checked={form.enabled} onChange={(value) => setForm({ ...form, enabled: value })} label={t.enabled} /></div>
          </div>
        </form>
      </Modal>
    </>
  );
}
