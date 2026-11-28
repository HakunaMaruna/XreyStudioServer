// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { Icon } from '../../components/icons';
import {
  Alert, Badge, Button, Card, Field, HelpButton, IconButton, Modal, PageHeader, Toggle,
} from '../../components/ui';

type Tunnel = {
  id: string; name: string; enabled: boolean; publicPort: number;
  internalAddress: string; internalPort: number; reverseDomain: string;
  node?: { id: string; name: string } | null;
  portalInbound?: { id: string; tag: string; port: number } | null;
};
type NodeOption = { id: string; name: string; address: string };
type InboundOption = { id: string; tag: string; protocol: string; port: number; nodeId: string | null };

const emptyForm = () => ({
  name: '', nodeId: '', portalInboundId: '', publicPort: '2098',
  internalAddress: '127.0.0.1', internalPort: '443', enabled: false,
});

export default function ReversePage() {
  const { t, lang } = useLang();
  const [rows, setRows] = useState<Tunnel[]>([]);
  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [inbounds, setInbounds] = useState<InboundOption[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [tunnels, nodeData, inboundData] = await Promise.all([
        api.get<Tunnel[]>('/api/reverse'),
        api.get<NodeOption[]>('/api/nodes'),
        api.get<InboundOption[]>('/api/inbounds'),
      ]);
      setRows(Array.isArray(tunnels) ? tunnels : (tunnels as any).data || []);
      setNodes(Array.isArray(nodeData) ? nodeData : (nodeData as any).data || []);
      setInbounds((Array.isArray(inboundData) ? inboundData : (inboundData as any).data || [])
        .filter((item: InboundOption) => item.protocol === 'vless'));
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) { window.location.href = '/login'; return; }
    load();
  }, [load]);

  const startCreate = () => { setEditing(null); setForm(emptyForm()); setModalError(''); setOpen(true); };
  const startEdit = (row: Tunnel) => {
    setEditing(row.id);
    setForm({
      name: row.name,
      nodeId: row.node?.id || '',
      portalInboundId: row.portalInbound?.id || '',
      publicPort: String(row.publicPort),
      internalAddress: row.internalAddress,
      internalPort: String(row.internalPort),
      enabled: row.enabled,
    });
    setModalError(''); setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setModalError(''); setNotice('');
    try {
      const payload = {
        name: form.name,
        nodeId: form.nodeId,
        portalInboundId: form.portalInboundId,
        publicPort: Number(form.publicPort),
        internalAddress: form.internalAddress,
        internalPort: Number(form.internalPort),
        enabled: form.enabled,
      };
      if (editing) await api.patch(`/api/reverse/${editing}`, payload);
      else await api.post('/api/reverse', payload);
      setOpen(false);
      setNotice(t.saved);
      await load();
    } catch (e: any) { setModalError(e.message); } finally { setBusy(false); }
  };

  const toggle = async (row: Tunnel) => {
    try { await api.patch(`/api/reverse/${row.id}`, { enabled: !row.enabled }); await load(); }
    catch (e: any) { setError(e.message); }
  };

  const remove = async (row: Tunnel) => {
    if (!window.confirm(`${t.delete}? ${row.name}`)) return;
    try { await api.delete(`/api/reverse/${row.id}`); await load(); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <>
      <PageHeader
        eyebrow={t.infrastructure}
        title={t.reverse}
        subtitle={t.reverseSubtitle}
        icon="network"
        actions={
          <>
            <HelpButton title={t.help}>
              <p>{t.reverseHelp}</p>
              <p>{lang === 'ru' ? 'Документация: https://xtls.github.io/en/document/level-2/vless_reverse.html' : 'Docs: https://xtls.github.io/en/document/level-2/vless_reverse.html'}</p>
            </HelpButton>
            <Button icon="plus" variant="primary" onClick={startCreate}>{t.reverseNew}</Button>
          </>
        }
      />

      {error && <Alert className="mb-4">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-4">{notice}</Alert>}

      {!rows.length ? (
        <Card className="py-16 text-center text-xs text-subtle">{t.noData}</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => (
            <Card key={row.id} className="node-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-brand/30 bg-brand/10 text-brand"><Icon name="network" size={16} /></div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-fg">{row.name}</p>
                      <Badge tone={row.enabled ? 'success' : 'neutral'} dot>{row.enabled ? t.enabled : t.disabled}</Badge>
                    </div>
                    <p className="mono mt-0.5 break-all text-[10px] text-subtle">{row.node?.name || '—'} → :{row.publicPort} → {row.internalAddress}:{row.internalPort}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <IconButton icon="power" label={row.enabled ? t.disable : t.enable} onClick={() => toggle(row)} />
                  <IconButton icon="edit" label={t.edit} onClick={() => startEdit(row)} />
                  <IconButton icon="trash" label={t.delete} tone="danger" onClick={() => remove(row)} />
                </div>
              </div>
              <p className="mono mt-3 truncate text-[10px] text-subtle">{row.reverseDomain} · inbound {row.portalInbound?.tag || '—'}</p>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `${t.edit}: ${form.name}` : t.reverseNew}
        subtitle={t.reverseSubtitle}
        icon={<Icon name="network" size={16} />}
        footer={<><Button onClick={() => setOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="check" form="reverse-form" loading={busy}>{t.save}</Button></>}
      >
        <form id="reverse-form" onSubmit={save} className="space-y-4">
          <Alert>{modalError}</Alert>
          <Field label={t.name}><input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.reverseTargetNode}>
              <select className="field" value={form.nodeId} onChange={(e) => setForm({ ...form, nodeId: e.target.value })} required>
                <option value="">—</option>
                {nodes.map((node) => <option key={node.id} value={node.id}>{node.name} ({node.address})</option>)}
              </select>
            </Field>
            <Field label={t.reversePortalInbound}>
              <select className="field" value={form.portalInboundId} onChange={(e) => setForm({ ...form, portalInboundId: e.target.value })} required>
                <option value="">—</option>
                {inbounds.map((inbound) => <option key={inbound.id} value={inbound.id}>{inbound.tag} :{inbound.port}</option>)}
              </select>
            </Field>
            <Field label={t.reversePublicPort}><input className="field" type="number" min={1} max={65535} value={form.publicPort} onChange={(e) => setForm({ ...form, publicPort: e.target.value })} required /></Field>
            <Field label={t.reverseInternalAddress}><input className="field" value={form.internalAddress} onChange={(e) => setForm({ ...form, internalAddress: e.target.value })} required /></Field>
            <Field label={t.reverseInternalPort}><input className="field" type="number" min={1} max={65535} value={form.internalPort} onChange={(e) => setForm({ ...form, internalPort: e.target.value })} required /></Field>
            <Field label={t.enabled}><Toggle checked={form.enabled} onChange={(value) => setForm({ ...form, enabled: value })} ariaLabel={t.enabled} /></Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
