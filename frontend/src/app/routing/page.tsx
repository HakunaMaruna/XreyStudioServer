// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, Field, HelpButton, IconButton, Modal, PageHeader, Toggle } from '../../components/ui';

type Recipe = {
  id: string;
  title: string;
  description: string;
  payload: Record<string, unknown>;
};

type Profile = {
  id: string;
  name: string;
  description: string | null;
  payload: unknown;
  recipe?: string | null;
  enabled: boolean;
  createdAt: string;
  inboundId?: string | null;
  inbound?: { id: string; tag: string; port: number } | null;
};

const emptyForm = { name: '', description: '', payloadText: '{}', recipe: '', enabled: false, inboundId: '' };

export default function RoutingPage() {
  const { t, lang } = useLang();
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [inbounds, setInbounds] = useState<{ id: string; tag: string; port: number }[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/routing');
      setRows(Array.isArray(data) ? data : data.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn()) { window.location.href = '/login'; return; }
    api.get('/api/routing/recipes/list').then((d) => setRecipes(Array.isArray(d) ? d : d.data || [])).catch(() => undefined);
    api.get('/api/inbounds').then((d) => setInbounds(Array.isArray(d) ? d : d.data || [])).catch(() => undefined);
    load();
  }, []);

  const chooseRecipe = (id: string) => {
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe) return;
    setForm({
      name: recipe.title,
      description: recipe.description,
      payloadText: JSON.stringify(recipe.payload, null, 2),
      recipe: id,
      enabled: false,
      inboundId: form.inboundId,
    });
    setError('');
    setNotice('');
  };

  const validate = async () => {
    setError('');
    setNotice('');
    try {
      const payload = JSON.parse(form.payloadText);
      const result = await api.post('/api/routing/validate', { payload });
      if (result.valid) setNotice(t.routingValid);
      else setError(result.errors?.join('; ') || t.routingInvalid);
    } catch (e: any) {
      setError(e.message || t.invalidJson);
    }
  };

  const startCreate = () => { setEditing(null); setForm(emptyForm); setError(''); setNotice(''); setOpen(true); };
  const startEdit = (row: Profile) => {
    setEditing(row.id);
    setForm({
      name: row.name,
      description: row.description || '',
      payloadText: JSON.stringify(row.payload, null, 2),
      recipe: row.recipe || '',
      enabled: row.enabled,
      inboundId: row.inboundId || '',
    });
    setError('');
    setNotice('');
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let payload: unknown;
    try { payload = JSON.parse(form.payloadText); } catch { setError(t.invalidJson); return; }
    setBusy(true);
    try {
      const body = { name: form.name, description: form.description || undefined, payload, recipe: form.recipe || undefined, enabled: form.enabled, inboundId: form.inboundId || null };
      if (editing) await api.patch(`/api/routing/${editing}`, body);
      else await api.post('/api/routing', body);
      setOpen(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (row: Profile) => {
    try {
      await api.patch(`/api/routing/${row.id}`, { enabled: !row.enabled });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(t.confirmDelete)) return;
    try {
      await api.delete(`/api/routing/${id}`);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const columns = useMemo<ColumnDef<Profile>[]>(
    () => [
      {
        accessorKey: 'name', size: 230, header: t.name,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-brand"><Icon name="route" size={15} /></div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-fg">{row.original.name}</p>
              <p className="truncate text-[10px] text-subtle">{row.original.description || '—'}</p>
            </div>
            {row.original.recipe && <Badge tone="brand" className="shrink-0">{row.original.recipe}</Badge>}
          </div>
        ),
      },
      {
        accessorKey: 'inbound', size: 140, header: t.inbounds, enableSorting: false,
        cell: ({ row }) => row.original.inbound
          ? <Badge tone="brand">{row.original.inbound.tag} · {row.original.inbound.port}</Badge>
          : <Badge tone="neutral">{t.allInbounds}</Badge>,
      },
      { accessorKey: 'enabled', size: 80, header: t.enabled, cell: ({ row }) => row.original.enabled ? <Badge tone="success" dot>{t.enabled}</Badge> : <Badge tone="neutral" dot>{t.disabled}</Badge> },
      { accessorKey: 'createdAt', size: 90, header: t.createdAt, cell: ({ row }) => <span className="text-xs text-muted">{new Date(row.original.createdAt).toLocaleDateString()}</span> },
      {
        id: 'actions', size: 120, header: t.actions, enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <IconButton icon="power" label={t.enabled} onClick={() => toggle(row.original)} />
            <IconButton icon="edit" label={t.edit} onClick={() => startEdit(row.original)} />
            <IconButton icon="trash" label={t.delete} tone="danger" onClick={() => remove(row.original.id)} />
          </div>
        ),
      },
    ],
    [t, inbounds],
  );

  return (
    <>
      <PageHeader eyebrow={t.infrastructure} title={t.routing} subtitle={t.routingSubtitle} icon="route"
        actions={<><HelpButton title={t.help}><p>{lang === 'ru' ? 'Рецепты заполняют форму проверенными наборами правил. Включённые профили добавляются в dns.servers, outbounds и routing.rules генерируемого конфига Xray. Кнопка «Проверить» не сохраняет профиль, а показывает ошибки валидации.' : 'Recipes fill the form with verified presets. Enabled profiles are merged into dns.servers, outbounds and routing.rules of the generated Xray config. Validate shows errors without saving.'}</p></HelpButton><Button icon="plus" variant="primary" onClick={startCreate}>{t.create}</Button></>} />
      {error && <div className="mb-4 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
      {notice && <div className="mb-4 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs text-success">{notice}</div>}
      <DataTable data={rows} columns={columns} loading={loading} getRowId={(row) => row.id} />

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t.edit : t.create} subtitle={t.routingSubtitle} icon={<Icon name="route" size={16} />} size="lg"
        footer={<><Button onClick={() => setOpen(false)}>{t.cancel}</Button><Button icon="shield" onClick={validate}>{t.routingValidate}</Button><Button variant="primary" icon="check" onClick={submit} loading={busy}>{t.save}</Button></>}>
        <form id="routing-form" onSubmit={submit} className="space-y-4">
          <Field label={t.routingRecipe}>
            <select className="field" value={form.recipe} onChange={(e) => chooseRecipe(e.target.value)}>
              <option value="">—</option>
              {recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>{recipe.title}</option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.name}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" required /></Field>
            <Field label={t.comment}><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="field" /></Field>
          </div>
          <Field label={t.payload} hint="JSON"><textarea rows={10} value={form.payloadText} onChange={(e) => setForm({ ...form, payloadText: e.target.value })} className="field mono text-[11px]" /></Field>
          <Field label={t.applyToInbound} hint={lang === 'ru' ? 'Профиль будет добавлен только в конфиг ноды с этим подключением' : 'The profile will be injected only into the config of the node owning this connection'}>
            <select className="field" value={form.inboundId} onChange={(e) => setForm({ ...form, inboundId: e.target.value })}>
              <option value="">{t.allInbounds}</option>
              {inbounds.map((inbound) => <option key={inbound.id} value={inbound.id}>{inbound.tag} · {inbound.port}</option>)}
            </select>
          </Field>
          <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label={t.enabled} />
        </form>
      </Modal>
    </>
  );
}
