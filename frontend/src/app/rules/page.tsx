'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';

type RuleRow = {
  id: string;
  name: string;
  type: string;
  payload: Record<string, unknown>;
  enabled: boolean;
};

type RuleForm = {
  name: string;
  type: string;
  payloadText: string;
  enabled: boolean;
};

const emptyForm: RuleForm = { name: '', type: 'field', payloadText: '{}', enabled: true };

export default function RulesPage() {
  const { t } = useLang();
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<RuleForm>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');

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
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(form.payloadText);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error(t.invalidJson);
      }
    } catch {
      setError(t.invalidJson);
      return;
    }
    const body = { name: form.name, type: form.type, payload, enabled: form.enabled };
    try {
      if (editing) await api.patch(`/api/rules/${editing}`, body);
      else await api.post('/api/rules', body);
      setForm(emptyForm);
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const startEdit = (rule: RuleRow) => {
    setEditing(rule.id);
    setForm({
      name: rule.name,
      type: rule.type,
      payloadText: JSON.stringify(rule.payload, null, 2),
      enabled: rule.enabled,
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm(emptyForm);
  };

  const remove = async (id: string) => {
    if (!confirm(t.confirmDelete)) return;
    try {
      await api.delete(`/api/rules/${id}`);
      if (editing === id) cancelEdit();
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const columns = useMemo<ColumnDef<RuleRow>[]>(
    () => [
      { accessorKey: 'name', header: t.name },
      { accessorKey: 'type', header: t.type },
      {
        id: 'payload',
        header: t.payload,
        enableSorting: false,
        cell: ({ row }) => (
          <code className="text-xs">{JSON.stringify(row.original.payload)}</code>
        ),
      },
      {
        accessorKey: 'enabled',
        header: t.enabled,
        cell: ({ row }) => (row.original.enabled ? '✓' : '—'),
      },
      {
        id: 'actions',
        header: t.actions,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="space-x-3">
            <button onClick={() => startEdit(row.original)} className="text-blue-500">
              {t.edit}
            </button>
            <button onClick={() => remove(row.original.id)} className="text-red-500">
              {t.delete}
            </button>
          </div>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.rules}</h1>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <form onSubmit={submit} className="space-y-2 rounded border bg-white p-4 dark:bg-gray-900">
        <div className="flex flex-wrap gap-2">
          <input
            placeholder={t.name}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded border px-3 py-2 dark:bg-gray-800"
            required
          />
          <input
            placeholder={t.type}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="rounded border px-3 py-2 dark:bg-gray-800"
            required
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            {t.enabled}
          </label>
        </div>
        <textarea
          value={form.payloadText}
          onChange={(e) => setForm({ ...form, payloadText: e.target.value })}
          rows={5}
          className="w-full rounded border px-3 py-2 font-mono text-xs dark:bg-gray-800"
          required
        />
        <div className="flex gap-2">
          <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
            {editing ? t.save : t.create}
          </button>
          {editing && (
            <button type="button" onClick={cancelEdit} className="rounded border px-4 py-2">
              {t.cancel}
            </button>
          )}
        </div>
      </form>

      <DataTable data={rules} columns={columns} loading={loading} getRowId={(row) => row.id} />
    </div>
  );
}
