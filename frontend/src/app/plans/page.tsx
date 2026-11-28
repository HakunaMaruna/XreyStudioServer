// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, Field, Modal, PageHeader } from '../../components/ui';

type PlanRow = {
  id: string;
  name: string;
  price: string | number;
  trafficGb: number;
  durationDays: number;
  enabled: boolean;
  createdAt: string;
};

type NumInput = number | '';
const toNum = (value: string): NumInput => (value === '' ? '' : Number(value));
const emptyForm: { name: string; price: NumInput; trafficGb: NumInput; durationDays: NumInput } = { name: '', price: 10, trafficGb: 100, durationDays: 30 };

export default function PlansPage() {
  const { t } = useLang();
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/payments/plans');
      setRows(Array.isArray(data) ? data : data.data || []);
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

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setModalError('');
    try {
      await api.post('/api/payments/plans', form);
      setForm(emptyForm);
      setOpen(false);
      setNotice(t.saved);
      setTimeout(() => setNotice(''), 3000);
      await load();
    } catch (e: any) {
      setModalError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (row: PlanRow) => {
    try {
      await api.patch(`/api/payments/plans/${row.id}`, { enabled: !row.enabled });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const columns = useMemo<ColumnDef<PlanRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t.name,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-2 text-cyan"><Icon name="list" size={15} /></div>
            <p className="font-medium text-fg">{row.original.name}</p>
          </div>
        ),
      },
      { accessorKey: 'price', header: t.price, cell: ({ row }) => <span className="font-medium text-fg tabular-nums">{Number(row.original.price).toFixed(2)}</span> },
      { accessorKey: 'trafficGb', header: t.trafficGb, cell: ({ row }) => <span className="text-xs text-muted tabular-nums">{row.original.trafficGb} GB</span> },
      { accessorKey: 'durationDays', header: t.durationDays, cell: ({ row }) => <span className="text-xs text-muted tabular-nums">{row.original.durationDays}</span> },
      {
        accessorKey: 'enabled',
        header: t.enabled,
        cell: ({ row }) => row.original.enabled ? <Badge tone="success" dot>{t.enabled}</Badge> : <Badge tone="neutral" dot>{t.disabled}</Badge>,
      },
      {
        id: 'actions',
        header: t.actions,
        enableSorting: false,
        cell: ({ row }) => (
          <Button size="sm" variant={row.original.enabled ? 'ghost' : 'secondary'} icon={row.original.enabled ? 'power' : 'play'} onClick={() => toggle(row.original)}>
            {row.original.enabled ? t.disable : t.enable}
          </Button>
        ),
      },
    ],
    [t],
  );

  return (
    <>
      <PageHeader
        eyebrow={t.billing}
        title={t.plans}
        subtitle={t.paymentPlans}
        icon="list"
        actions={<Button icon="plus" variant="primary" onClick={() => { setForm(emptyForm); setModalError(''); setOpen(true); }}>{t.createPlan}</Button>}
      />

      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      {notice && (
        <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs text-success">
          <Icon name="checkCircle" size={15} /> {notice}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Card delay={0} className="flex items-center gap-3 p-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface-2 text-brand"><Icon name="list" size={17} /></div>
          <div><p className="text-[11px] text-subtle">{t.plans}</p><p className="text-lg font-semibold text-fg tabular-nums">{rows.length}</p></div>
        </Card>
        <Card delay={60} className="flex items-center gap-3 p-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-success/25 bg-success/10 text-success"><Icon name="checkCircle" size={17} /></div>
          <div><p className="text-[11px] text-subtle">{t.enabled}</p><p className="text-lg font-semibold text-fg tabular-nums">{rows.filter((row) => row.enabled).length}</p></div>
        </Card>
        <Card delay={120} className="flex items-center gap-3 p-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-cyan/25 bg-cyan/10 text-cyan"><Icon name="activity" size={17} /></div>
          <div><p className="text-[11px] text-subtle">{t.disabled}</p><p className="text-lg font-semibold text-fg tabular-nums">{rows.filter((row) => !row.enabled).length}</p></div>
        </Card>
      </div>

      <DataTable data={rows} columns={columns} loading={loading} getRowId={(row) => row.id} />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t.createPlan}
        subtitle={t.paymentPlans}
        icon={<Icon name="list" size={16} />}
        footer={<><Button onClick={() => setOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="plus" form="plan-form" loading={busy}>{t.create}</Button></>}
      >
        <form id="plan-form" onSubmit={create} className="space-y-4">
          {modalError && <div role="alert" className="flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger"><Icon name="alert" size={15} /> {modalError}</div>}
          <Field label={t.name}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" required /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t.price}><input type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: toNum(e.target.value) })} className="field" required /></Field>
            <Field label={t.trafficGb}><input type="number" min={1} value={form.trafficGb} onChange={(e) => setForm({ ...form, trafficGb: toNum(e.target.value) })} className="field" required /></Field>
            <Field label={t.durationDays}><input type="number" min={1} value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: toNum(e.target.value) })} className="field" required /></Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
