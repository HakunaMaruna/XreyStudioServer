'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, CodeBlock, Field, IconButton, Modal, PageHeader, Toggle } from '../../components/ui';

type Recipe = { id: string; title: string; description: string; type: string; payload: Record<string, unknown> };
type RuleRow = { id: string; name: string; type: string; payload: Record<string, unknown>; recipe?: string | null; note?: string | null; enabled: boolean };
type RuleForm = { name: string; type: string; payloadText: string; recipe: string; note: string; enabled: boolean };

const emptyForm: RuleForm = { name: '', type: 'field', payloadText: '{}', recipe: '', note: '', enabled: true };

export default function RulesPage() {
  const { t } = useLang();
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RuleForm>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [notice, setNotice] = useState('');

  const chooseRecipe = (id: string) => {
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe) return;
    setForm({ ...form, recipe: id, type: recipe.type, payloadText: JSON.stringify(recipe.payload, null, 2), note: recipe.description });
  };

  const validate = async () => {
    try {
      const payload = JSON.parse(form.payloadText);
      const result = await api.post('/api/rules/validate', { payload });
      if (result.valid) setNotice(t.ruleValid);
      else setError(result.errors?.join('; ') || t.ruleInvalid);
    } catch (e: any) {
      setError(e.message || t.invalidJson);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/rules');
      setRules(Array.isArray(data) ? data : data.data || []);
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
    api.get('/api/rules/recipes/list').then((d) => setRecipes(Array.isArray(d) ? d : d.data || [])).catch(() => undefined);
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(form.payloadText);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error(t.invalidJson);
    } catch {
      setError(t.invalidJson);
      return;
    }
    setBusy(true);
    try {
      const body = { name: form.name, type: form.type, payload, recipe: form.recipe || undefined, note: form.note || undefined, enabled: form.enabled };
      if (editing) await api.patch(`/api/rules/${editing}`, body);
      else await api.post('/api/rules', body);
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

  const startEdit = (rule: RuleRow) => {
    setEditing(rule.id);
    setForm({ name: rule.name, type: rule.type, payloadText: JSON.stringify(rule.payload, null, 2), recipe: rule.recipe || '', note: rule.note || '', enabled: rule.enabled });
    setOpen(true);
  };

  const remove = async (id: string) => {
    if (!confirm(t.confirmDelete)) return;
    try {
      await api.delete(`/api/rules/${id}`);
      if (editing === id) { setEditing(null); setForm(emptyForm); }
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const columns = useMemo<ColumnDef<RuleRow>[]>(
    () => [
      {
        accessorKey: 'name', header: t.name,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-2 text-warning"><Icon name="route" size={15} /></div>
            <p className="font-medium text-fg">{row.original.name}</p>
          </div>
        ),
      },
      { accessorKey: 'type', header: t.type, cell: ({ row }) => <Badge tone="cyan">{row.original.type}</Badge> },
      { accessorKey: 'recipe', header: t.recipe, cell: ({ row }) => row.original.recipe ? <Badge tone="brand">{recipes.find((r) => r.id === row.original.recipe)?.title || row.original.recipe}</Badge> : <span className="text-subtle">—</span> },
      {
        id: 'payload', header: t.payload, enableSorting: false,
        cell: ({ row }) => <code className="mono text-[11px] text-muted">{JSON.stringify(row.original.payload)}</code>,
      },
      { accessorKey: 'enabled', header: t.enabled, cell: ({ row }) => row.original.enabled ? <Badge tone="success" dot>{t.enabled}</Badge> : <Badge tone="neutral" dot>{t.disabled}</Badge> },
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
        eyebrow="Infrastructure"
        title={t.rules}
        subtitle={t.rulesSubtitle}
        icon="route"
        actions={<Button icon="plus" variant="primary" onClick={() => { setEditing(null); setForm(emptyForm); setOpen(true); }}>{t.newRule}</Button>}
      />

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}
      {notice && <div className="mb-5 rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-xs text-success">{notice}</div>}

      <DataTable data={rules} columns={columns} loading={loading} getRowId={(row) => row.id} />

      <Modal open={open} onClose={() => { setOpen(false); setEditing(null); setForm(emptyForm); }} title={editing ? t.editRule : t.newRule} subtitle={t.routingRuleJson} size="lg" icon={<Icon name="route" size={16} />}
        footer={<><Button onClick={() => setOpen(false)}>{t.cancel}</Button><Button icon="shield" onClick={validate}>{t.validateRule}</Button><Button variant="primary" icon="check" onClick={submit} loading={busy}>{editing ? t.save : t.create}</Button></>}>
        <form onSubmit={submit} className="space-y-4">
          <Field label={t.recipe} hint={t.recipeHint}>
            <select value={form.recipe} onChange={(e) => chooseRecipe(e.target.value)} className="field">
              <option value="">{t.customRule}</option>
              {recipes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </Field>
          {recipes.find((r) => r.id === form.recipe) && (
            <p className="rounded-lg border border-brand/25 bg-brand-soft px-3 py-2 text-[11px] text-muted">{recipes.find((r) => r.id === form.recipe)?.description}</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.name}><input placeholder="block-ads" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" required /></Field>
            <Field label={t.type}><input placeholder="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="field" required /></Field>
          </div>
          <Field label={t.payload}>
            <textarea rows={8} value={form.payloadText} onChange={(e) => setForm({ ...form, payloadText: e.target.value })} className="field mono text-[11px] leading-relaxed" required />
          </Field>
          <Field label={t.note}><textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="field" /></Field>
          <Toggle checked={form.enabled} onChange={(value) => setForm({ ...form, enabled: value })} label={t.enabled} />
          {form.payloadText.trim() && (
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-wider text-subtle">{t.preview}</p>
              <CodeBlock>{JSON.stringify((() => { try { return JSON.parse(form.payloadText); } catch { return { error: t.invalidJson }; } })(), null, 2)}</CodeBlock>
            </div>
          )}
        </form>
      </Modal>
    </>
  );
}
