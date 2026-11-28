// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Alert, Badge, Button, Card, Field, IconButton, Modal, PageHeader, SectionTitle, Toggle } from '../../components/ui';

type Profile = {
  id: string;
  name: string;
  description: string | null;
  payload: unknown;
  enabled: boolean;
  createdAt: string;
  node?: { id: string; name: string } | null;
  _count?: { users: number };
};

type TrafficRow = { nodeId: string | null; nodeName: string; period: string; bytesUp: string; bytesDown: string };

const emptyForm = { name: '', description: '', payloadText: '{\n  "routingRules": []\n}', enabled: true, nodeId: '' };
const RECIPES: Record<string, string> = {
  base: JSON.stringify({ routingRules: [], dnsServers: ['1.1.1.1', '8.8.8.8'], outbounds: [] }, null, 2),
  mobile: JSON.stringify({ routingRules: [], dnsServers: ['https://cloudflare-dns.com/dns-query'], outbounds: [] }, null, 2),
  performance: JSON.stringify({ routingRules: [{ type: 'field', domain: ['geosite:category-ads-all'], outboundTag: 'blocked' }], dnsServers: ['1.1.1.1'], outbounds: [] }, null, 2),
  cdn: JSON.stringify({ routingRules: [{ type: 'field', domain: ['geosite:cloudflare', 'geosite:telegram'], outboundTag: 'direct' }], dnsServers: ['https://cloudflare-dns.com/dns-query'], outbounds: [] }, null, 2),
  privacy: JSON.stringify({ routingRules: [{ type: 'field', domain: ['geosite:category-ads-all', 'geosite:category-trackers'], outboundTag: 'blocked' }], dnsServers: ['https://dns.quad9.net/dns-query'], outbounds: [] }, null, 2),
  minimal: JSON.stringify({ routingRules: [], dnsServers: ['localhost'], outbounds: [] }, null, 2),
};

const mutatePayload = (text: string, patch: (value: Record<string, unknown>) => void) => {
  try {
    const value = JSON.parse(text || '{}');
    patch(value);
    return JSON.stringify(value, null, 2);
  } catch { return text; }
};


const formatBytes = (value: string) => {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes)) return value;
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let index = 0;
  let size = bytes;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${size.toFixed(1)} ${units[index]}`;
};

export default function ConfigProfilesPage() {
  const { t, lang } = useLang();
  const [rows, setRows] = useState<Profile[]>([]);
  const [nodes, setNodes] = useState<{ id: string; name: string }[]>([]);
  const [traffic, setTraffic] = useState<TrafficRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [compareWith, setCompareWith] = useState<string>('');
  const [validated, setValidated] = useState(false);
  const [modalError, setModalError] = useState('');
  const [notice, setNotice] = useState('');

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
    api.get('/api/nodes').then((data) => setNodes(Array.isArray(data) ? data : [])).catch(() => setNodes([]));
    api.get('/api/metrics/traffic/nodes').then((data) => setTraffic(Array.isArray(data) ? data : [])).catch(() => setTraffic([]));
  }, []);

  const startCreate = () => { setEditing(null); setForm(emptyForm); setModalError(''); setValidated(false); setOpen(true); };
  const startEdit = (row: Profile) => {
    setEditing(row.id);
    setForm({ name: row.name, description: row.description || '', payloadText: JSON.stringify(row.payload, null, 2), enabled: row.enabled, nodeId: row.node?.id || '' });
    setModalError('');
    setValidated(false);
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let payload: unknown;
    setModalError('');
    try { payload = JSON.parse(form.payloadText); } catch { setModalError(t.invalidJson); return; }
    setBusy(true);
    try {
      const body = { name: form.name, description: form.description || undefined, payload, enabled: form.enabled, nodeId: form.nodeId || null };
      if (editing) await api.patch(`/api/config-profiles/${editing}`, body);
      else await api.post('/api/config-profiles', body);
      setOpen(false);
      setNotice(t.saved);
      await load();
    } catch (e: any) {
      setModalError(e.message);
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
    try { await api.delete(`/api/config-profiles/${id}`); await load(); }
    catch (e: any) { setError(e.message); }
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
      { id: 'node', header: t.assignedNode, cell: ({ row }) => <span className="text-xs text-fg">{row.original.node?.name || t.noNode}</span> },
      { id: 'users', header: t.users, cell: ({ row }) => <span className="text-xs text-fg">{row.original._count?.users ?? 0}</span> },
      { accessorKey: 'enabled', header: t.enabled, cell: ({ row }) => row.original.enabled ? <Badge tone="success" dot>{t.enabled}</Badge> : <Badge tone="neutral" dot>{t.disabled}</Badge> },
      { accessorKey: 'createdAt', header: t.createdAt, cell: ({ row }) => <span className="text-xs text-muted">{new Date(row.original.createdAt).toLocaleDateString()}</span> },
      {
        id: 'actions', header: t.actions, enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <IconButton icon="power" label={row.original.enabled ? t.disable : t.enable} onClick={() => toggle(row.original)} />
            <IconButton icon="edit" label={t.edit} onClick={() => startEdit(row.original)} />
            <IconButton icon="copy" label={lang === 'ru' ? 'Сравнить' : 'Compare'} onClick={() => { setCompareId(row.original.id); setCompareWith(''); }} />
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
      {error && <Alert className="mb-4">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-4">{notice}</Alert>}

      {traffic.length > 0 && (
        <Card className="mb-5">
          <SectionTitle title={t.nodeTraffic} subtitle={t.nodes} />
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {traffic.map((row) => (
              <div key={`${row.nodeId || 'none'}-${row.period}`} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-fg">
                <span className="font-medium">{row.nodeName}</span>
                <span className="ml-2 text-muted">{row.period}</span>
                <span className="ml-2 text-muted">↑ {formatBytes(row.bytesUp)} · ↓ {formatBytes(row.bytesDown)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <DataTable data={rows} columns={columns} loading={loading} getRowId={(row) => row.id} />

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t.edit : t.create} subtitle={t.configProfilesSubtitle} icon={<Icon name="sliders" size={16} />} size="lg"
        footer={<><Button onClick={() => setOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="check" form="config-profile-form" loading={busy}>{t.save}</Button></>}>
        <form id="config-profile-form" onSubmit={submit} className="space-y-4">
          <Alert>{modalError}</Alert>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.name}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" required /></Field>
            <Field label={t.comment}><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="field" /></Field>
          </div>
          <Field label={t.assignedNode} hint={t.noNode}>
            <select value={form.nodeId} onChange={(e) => setForm({ ...form, nodeId: e.target.value })} className="field">
              <option value="">{t.noNode}</option>
              {nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
            </select>
          </Field>
          <Field label={lang === 'ru' ? 'Рецепт' : 'Recipe'}>
            <select className="field" value="" onChange={(e) => { if (e.target.value) setForm({ ...form, payloadText: RECIPES[e.target.value] }); }}>
              <option value="">—</option>
              <option value="base">{lang === 'ru' ? 'Базовый' : 'Basic'}</option>
              <option value="mobile">{lang === 'ru' ? 'Для мобильных' : 'Mobile'}</option>
              <option value="performance">{lang === 'ru' ? 'Максимальная производительность' : 'Max performance'}</option>
              <option value="cdn">{lang === 'ru' ? 'Для CDN и мессенджеров' : 'CDN & messaging'}</option>
              <option value="privacy">{lang === 'ru' ? 'Строгая приватность' : 'Strict privacy'}</option>
              <option value="minimal">{lang === 'ru' ? 'Минимальный' : 'Minimal'}</option>
            </select>
          </Field>
          <div className="flex flex-wrap gap-4 rounded-lg border border-line p-3">
            <Toggle checked={form.payloadText.includes('geosite:category-ads-all')}
              onChange={(value) => setForm({ ...form, payloadText: mutatePayload(form.payloadText, (v) => {
                const rules = Array.isArray(v.routingRules) ? v.routingRules.filter((r: any) => r.outboundTag !== 'blocked') : [];
                if (value) rules.push({ type: 'field', domain: ['geosite:category-ads-all'], outboundTag: 'blocked' });
                v.routingRules = rules;
              }) })} label={lang === 'ru' ? 'Блокировать рекламу' : 'Block ads'} />
            <Toggle checked={form.payloadText.includes('cloudflare-dns.com')}
              onChange={(value) => setForm({ ...form, payloadText: mutatePayload(form.payloadText, (v) => {
                v.dnsServers = value ? ['https://cloudflare-dns.com/dns-query'] : ['1.1.1.1', '8.8.8.8'];
              }) })} label={lang === 'ru' ? 'DoH для мобильных' : 'Mobile DoH'} />
          </div>
          <Field label={t.payload} hint="routingRules / dnsServers / outbounds">
            <textarea rows={12} value={form.payloadText} onChange={(e) => { setForm({ ...form, payloadText: e.target.value }); setValidated(false); }} className="field mono text-[11px]" />
          </Field>
          {validated && <p role="status" className="text-xs text-success">{lang === 'ru' ? 'JSON корректен' : 'Valid JSON'}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="subtle" icon="check" onClick={() => { try { JSON.parse(form.payloadText); setValidated(true); setModalError(''); } catch { setValidated(false); setModalError(t.invalidJson); } }}>{lang === 'ru' ? 'Проверить JSON' : 'Validate JSON'}</Button>
            <Button size="sm" variant="subtle" icon="download" onClick={() => {
              const blob = new Blob([form.payloadText], { type: 'application/json' });
              const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'config-profile.json'; a.click(); URL.revokeObjectURL(url);
            }}>{lang === 'ru' ? 'Экспорт' : 'Export'}</Button>
            <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs text-muted">
              <Icon name="upload" size={13} /> {lang === 'ru' ? 'Импорт' : 'Import'}
              <input type="file" accept=".json,application/json" className="hidden" onChange={async (e) => {
                const input = e.target;
                const file = input.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  setForm((prev) => ({ ...prev, payloadText: JSON.stringify(JSON.parse(text), null, 2) }));
                  setModalError('');
                  setValidated(false);
                } catch { setModalError(t.invalidJson); }
                finally { input.value = ''; }
              }} />
            </label>
          </div>
          <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label={t.enabled} />
        </form>
      </Modal>
      <Modal open={Boolean(compareId)} onClose={() => setCompareId(null)} title={lang === 'ru' ? 'Сравнение профилей' : 'Compare profiles'} size="lg"
        footer={<Button onClick={() => setCompareId(null)}>{t.close}</Button>}>
        <div className="space-y-3">
          <Field label={lang === 'ru' ? 'Сравнить с' : 'Compare with'}>
            <select className="field" value={compareWith} onChange={(e) => setCompareWith(e.target.value)}>
              <option value="">—</option>
              {rows.filter((row) => row.id !== compareId).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><p className="mb-1 text-[11px] font-semibold text-subtle">{rows.find((row) => row.id === compareId)?.name || '—'}</p><pre className="mono max-h-72 overflow-auto rounded-lg border border-line bg-surface-2/40 p-2 text-[10px]">{JSON.stringify(rows.find((row) => row.id === compareId)?.payload || {}, null, 2)}</pre></div>
            <div><p className="mb-1 text-[11px] font-semibold text-subtle">{rows.find((row) => row.id === compareWith)?.name || '—'}</p><pre className="mono max-h-72 overflow-auto rounded-lg border border-line bg-surface-2/40 p-2 text-[10px]">{compareWith ? JSON.stringify(rows.find((row) => row.id === compareWith)?.payload || {}, null, 2) : '—'}</pre></div>
          </div>
        </div>
      </Modal>
    </>
  );
}
