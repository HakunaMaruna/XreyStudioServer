// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, Field, IconButton, Modal, PageHeader } from '../../components/ui';

type Organization = {
  id: string;
  name: string;
  slug: string;
  branding: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  _count?: { users: number; nodes: number };
};

type Form = { name: string; slug: string; brandingText: string };
const emptyForm: Form = { name: '', slug: '', brandingText: '{}' };

export default function OrganizationsPage() {
  const { t } = useLang();
  const [items, setItems] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/organizations');
      setItems(Array.isArray(data) ? data : data.data || []);
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    let branding: Record<string, unknown>;
    try {
      branding = JSON.parse(form.brandingText || '{}');
      if (!branding || typeof branding !== 'object' || Array.isArray(branding)) throw new Error(t.invalidJson);
    } catch {
      setError(t.invalidJson);
      return;
    }
    setBusy(true);
    try {
      const body = { name: form.name, slug: form.slug, branding };
      if (editing) await api.patch(`/api/organizations/${editing}`, body);
      else await api.post('/api/organizations', body);
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

  const startEdit = (item: Organization) => {
    setEditing(item.id);
    setForm({ name: item.name, slug: item.slug, brandingText: JSON.stringify(item.branding || {}, null, 2) });
    setOpen(true);
  };

  const remove = async (id: string) => {
    if (!confirm(t.confirmDelete)) return;
    try {
      await api.delete(`/api/organizations/${id}`);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={t.access}
        title={t.organizations}
        subtitle={t.organizationsSubtitle}
        icon="shield"
        actions={
          <Button icon="plus" variant="primary" onClick={() => { setEditing(null); setForm(emptyForm); setOpen(true); }}>
            {t.createOrganization}
          </Button>
        }
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-xs text-muted">
          <Icon name="refresh" size={15} className="animate-spin text-brand" />{t.loading}
        </div>
      ) : items.length === 0 ? (
        <Card className="py-16 text-center">
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-lg border border-line bg-surface-2 text-subtle"><Icon name="box" size={20} /></div>
          <p className="text-sm font-medium text-fg">{t.noOrganizations}</p>
          <p className="mt-1 text-xs text-muted">{t.organizationsSubtitle}</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => (
            <Card key={item.id} delay={index * 50} className="group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-8 w-8 place-items-center rounded-lg border border-brand/25 bg-brand-soft text-brand">
                    <Icon name="shield" size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-fg">{item.name}</h3>
                    <p className="mono text-[10px] text-subtle">{item.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <IconButton icon="edit" label={t.edit} onClick={() => startEdit(item)} />
                  <IconButton icon="trash" label={t.delete} tone="danger" onClick={() => remove(item.id)} />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-line bg-surface-2/50 p-3">
                  <p className="text-[11px] text-subtle">{t.users}</p>
                  <p className="mt-1 text-lg font-semibold text-fg tabular-nums">{item._count?.users ?? '—'}</p>
                </div>
                <div className="rounded-lg border border-line bg-surface-2/50 p-3">
                  <p className="text-[11px] text-subtle">{t.nodes}</p>
                  <p className="mt-1 text-lg font-semibold text-fg tabular-nums">{item._count?.nodes ?? '—'}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                <span className="text-[10px] text-subtle">{new Date(item.createdAt).toLocaleDateString()}</span>
                <Badge tone="neutral">{item.branding && Object.keys(item.branding).length ? t.branding : '—'}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => { setOpen(false); setEditing(null); setForm(emptyForm); }}
        title={editing ? t.editOrganization : t.createOrganization}
        subtitle={t.organizationsSubtitle}
        icon={<Icon name="shield" size={16} />}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{t.cancel}</Button>
            <Button variant="primary" icon="check" onClick={submit} loading={busy}>{editing ? t.save : t.create}</Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.name}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" required /></Field>
            <Field label={t.slug}><input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="field" required /></Field>
          </div>
          <Field label={t.branding} hint="JSON">
            <textarea rows={6} value={form.brandingText} onChange={(e) => setForm({ ...form, brandingText: e.target.value })} className="field mono text-[11px]" />
          </Field>
        </form>
      </Modal>
    </>
  );
}
