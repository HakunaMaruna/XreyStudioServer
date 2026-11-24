'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, Field, IconButton, Modal, PageHeader, StatCard, Toggle, cn } from '../../components/ui';

type Category = {
  id: string;
  type: 'geosite' | 'geoip';
  code: string;
  name: string;
  description: string | null;
  source: string;
  enabled: boolean;
};

const emptyForm = { type: 'geosite', code: '', name: '', description: '', enabled: true };

export default function GeodataPage() {
  const { t } = useLang();
  const [rows, setRows] = useState<Category[]>([]);
  const [filter, setFilter] = useState<'all' | 'geosite' | 'geoip'>('all');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter === 'all' ? '' : `?type=${filter}`;
      const data = await api.get(`/api/geodata${params}`);
      setRows(Array.isArray(data) ? data : data.data || []);
    } catch (e: any) { setNotice(e.message); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => {
    if (!isLoggedIn()) { window.location.href = '/login'; return; }
    load();
  }, [load]);

  const copyRule = async (type: string, code: string) => {
    try {
      await navigator.clipboard.writeText(`"${type}:${code}"`);
      setNotice(`"${type}:${code}"`);
    } catch { setNotice('Clipboard unavailable'); }
  };

  const resync = async () => {
    setBusy(true);
    try {
      const result = await api.post('/api/geodata/seed');
      setNotice(`${t.resync}: +${result.added}`);
      await load();
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/geodata', form);
      setOpen(false);
      setForm(emptyForm);
      await load();
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
  };

  const toggle = async (row: Category) => {
    try {
      await api.patch(`/api/geodata/${row.id}`, { enabled: !row.enabled });
      await load();
    } catch (e: any) { setNotice(e.message); }
  };

  const remove = async (row: Category) => {
    if (!confirm(t.confirmDelete)) return;
    try { await api.delete(`/api/geodata/${row.id}`); await load(); }
    catch (e: any) { setNotice(e.message); }
  };

  const columns = useMemo<ColumnDef<Category>[]>(
    () => [
      {
        accessorKey: 'type', header: t.type,
        cell: ({ row }) => <Badge tone={row.original.type === 'geosite' ? 'brand' : 'cyan'}>{row.original.type.toUpperCase()}</Badge>,
      },
      {
        accessorKey: 'code', header: t.code,
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-fg">{row.original.name}</p>
            <code className="mono text-[10px] text-subtle">{row.original.type}:{row.original.code}</code>
          </div>
        ),
      },
      { accessorKey: 'description', header: t.description, cell: ({ row }) => <span className="text-xs text-muted">{row.original.description || '—'}</span> },
      {
        accessorKey: 'source', header: t.source,
        cell: ({ row }) => <span className="text-[10px] uppercase tracking-wider text-subtle">{row.original.source}</span>,
      },
      { accessorKey: 'enabled', header: t.enabled, cell: ({ row }) => <Toggle checked={row.original.enabled} onChange={() => toggle(row.original)} label="" /> },
      {
        id: 'actions', header: t.actions, enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <IconButton icon="copy" label={t.copyRule} onClick={() => copyRule(row.original.type, row.original.code)} />
            {row.original.source === 'custom' && <IconButton icon="trash" label={t.delete} tone="danger" onClick={() => remove(row.original)} />}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );

  const geosite = rows.filter((r) => r.type === 'geosite').length;
  const geoip = rows.filter((r) => r.type === 'geoip').length;

  return (
    <>
      <PageHeader eyebrow={t.routing} title={t.geodata} subtitle={t.geodataSubtitle} icon="globe"
        actions={
          <div className="flex gap-2">
            <Button icon="refresh" onClick={resync} loading={busy}>{t.resync}</Button>
            <Button icon="plus" variant="primary" onClick={() => { setForm(emptyForm); setOpen(true); }}>{t.create}</Button>
          </div>
        } />
      {notice && <div className="mb-5 rounded-xl border border-brand/25 bg-brand-soft px-4 py-3 text-xs text-brand">{notice}</div>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label={t.total} value={rows.length} icon="box" tone="brand" />
        <StatCard label="geosite" value={geosite} icon="globe" tone="cyan" />
        <StatCard label="geoip" value={geoip} icon="server" tone="info" />
      </div>

      <Card className="mt-5 mb-5 flex flex-wrap gap-2 p-4">
        {(['all', 'geosite', 'geoip'] as const).map((item) => (
          <button key={item} onClick={() => setFilter(item)}
            className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              filter === item ? 'border-brand/40 bg-brand-soft text-brand' : 'border-line bg-surface-2 text-muted hover:text-fg')}>
            {item === 'all' ? t.all : item.toUpperCase()}
          </button>
        ))}
      </Card>

      <DataTable data={rows} columns={columns} loading={loading} getRowId={(row) => row.id} />

      <Modal open={open} onClose={() => setOpen(false)} title={t.custom} subtitle={t.geodataSubtitle} icon={<Icon name="globe" size={16} />}
        footer={<><Button onClick={() => setOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="check" onClick={create} loading={busy}>{t.save}</Button></>}>
        <form onSubmit={create} className="space-y-4">
          <Field label={t.type}>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="field">
              <option value="geosite">geosite</option>
              <option value="geoip">geoip</option>
            </select>
          </Field>
          <Field label={t.code}><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="field mono" placeholder="my-category" required /></Field>
          <Field label={t.name}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" required /></Field>
          <Field label={t.description}><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="field" /></Field>
          <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label={t.enabled} />
        </form>
      </Modal>
    </>
  );
}
