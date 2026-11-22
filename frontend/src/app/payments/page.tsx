'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, Field, Modal, PageHeader, Segmented } from '../../components/ui';

type Payment = {
  id: string;
  userId: string;
  amount: string;
  currency: string;
  status: string;
  provider: string;
  externalId: string | null;
  createdAt: string;
  checkoutUrl?: string | null;
};

type Plan = {
  id: string;
  name: string;
  price: string;
  trafficGb: number;
  durationDays: number;
  enabled: boolean;
  createdAt: string;
};

type Tab = 'payments' | 'plans';

const emptyPayment = { userId: '', amount: 10, currency: 'USD', provider: 'manual' };
const emptyPlan = { name: '', price: 9.99, trafficGb: 100, durationDays: 30 };

export default function PaymentsPage() {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>('payments');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState(emptyPayment);
  const [planForm, setPlanForm] = useState(emptyPlan);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [paymentData, planData] = await Promise.all([
        api.get('/api/payments'),
        api.get('/api/payments/plans'),
      ]);
      setPayments(Array.isArray(paymentData) ? paymentData : paymentData.data || []);
      setPlans(Array.isArray(planData) ? planData : planData.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    load();
  }, [load]);

  const markPaid = async (id: string) => {
    setBusy(true);
    try {
      await api.post(`/api/payments/${id}/paid`, {});
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const createPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/api/payments', paymentForm);
      setPaymentForm(emptyPayment);
      setPaymentOpen(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const createPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/api/payments/plans', planForm);
      setPlanForm(emptyPlan);
      setPlanOpen(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const paymentColumns = useMemo<ColumnDef<Payment>[]>(
    () => [
      {
        accessorKey: 'amount',
        header: t.amount,
        cell: ({ row }) => <span className="font-medium text-fg tabular-nums">{Number(row.original.amount).toFixed(2)} {row.original.currency}</span>,
      },
      {
        accessorKey: 'status',
        header: t.status,
        cell: ({ row }) => row.original.status === 'paid'
          ? <Badge tone="success" dot>{row.original.status}</Badge>
          : <Badge tone="warning" dot>{row.original.status}</Badge>,
      },
      { accessorKey: 'provider', header: t.provider, cell: ({ row }) => <Badge tone="neutral">{row.original.provider}</Badge> },
      {
        accessorKey: 'userId',
        header: t.user,
        cell: ({ row }) => <code className="mono text-[11px] text-muted" title={row.original.userId}>{row.original.userId.slice(0, 8)}…</code>,
      },
      {
        accessorKey: 'externalId',
        header: t.externalId,
        cell: ({ row }) => row.original.externalId
          ? <code className="mono text-[10px] text-subtle">{row.original.externalId.slice(0, 12)}…</code>
          : <span className="text-subtle">—</span>,
      },
      {
        accessorKey: 'createdAt',
        header: t.createdAt,
        cell: ({ row }) => <span className="text-xs text-muted">{new Date(row.original.createdAt).toLocaleDateString()}</span>,
      },
      {
        id: 'actions',
        header: t.actions,
        enableSorting: false,
        cell: ({ row }) => row.original.status === 'paid' ? (
          <span className="text-[11px] text-subtle">—</span>
        ) : (
          <Button size="sm" icon="check" onClick={() => markPaid(row.original.id)} loading={busy}>{t.markPaid}</Button>
        ),
      },
    ],
    [t, busy],
  );

  const planColumns = useMemo<ColumnDef<Plan>[]>(
    () => [
      { accessorKey: 'name', header: t.name, cell: ({ row }) => <p className="font-medium text-fg">{row.original.name}</p> },
      { accessorKey: 'price', header: t.price, cell: ({ row }) => <span className="font-medium text-fg tabular-nums">{Number(row.original.price).toFixed(2)}</span> },
      { accessorKey: 'trafficGb', header: t.trafficGb, cell: ({ row }) => <span className="text-xs text-muted tabular-nums">{row.original.trafficGb} GB</span> },
      { accessorKey: 'durationDays', header: t.durationDays, cell: ({ row }) => <span className="text-xs text-muted tabular-nums">{row.original.durationDays}</span> },
      {
        accessorKey: 'enabled',
        header: t.enabled,
        cell: ({ row }) => row.original.enabled ? <Badge tone="success" dot>{t.enabled}</Badge> : <Badge tone="neutral" dot>{t.disabled}</Badge>,
      },
      {
        accessorKey: 'createdAt',
        header: t.createdAt,
        cell: ({ row }) => <span className="text-xs text-muted">{new Date(row.original.createdAt).toLocaleDateString()}</span>,
      },
    ],
    [t],
  );

  return (
    <>
      <PageHeader
        eyebrow={t.billing}
        title={t.payments}
        subtitle={t.paymentsSubtitle}
        icon="download"
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'payments', label: t.payments, icon: 'download' },
              { value: 'plans', label: t.plans, icon: 'list' },
            ]}
          />
        }
      />

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card delay={0} className="flex items-center gap-3 p-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface-2 text-brand"><Icon name="download" size={17} /></div>
          <div><p className="text-[10px] uppercase tracking-wider text-subtle">{t.payments}</p><p className="text-lg font-semibold text-fg tabular-nums">{payments.length}</p></div>
        </Card>
        <Card delay={60} className="flex items-center gap-3 p-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-success/25 bg-success/10 text-success"><Icon name="checkCircle" size={17} /></div>
          <div><p className="text-[10px] uppercase tracking-wider text-subtle">{t.resolved}</p><p className="text-lg font-semibold text-fg tabular-nums">{payments.filter((p) => p.status === 'paid').length}</p></div>
        </Card>
        <Card delay={120} className="flex items-center gap-3 p-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-cyan/25 bg-cyan/10 text-cyan"><Icon name="list" size={17} /></div>
          <div><p className="text-[10px] uppercase tracking-wider text-subtle">{t.plans}</p><p className="text-lg font-semibold text-fg tabular-nums">{plans.length}</p></div>
        </Card>
      </div>

      {tab === 'payments' ? (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs text-muted">{payments.length} {t.payments}</p>
            <Button icon="plus" variant="primary" onClick={() => setPaymentOpen(true)}>{t.createPayment}</Button>
          </div>
          {loading ? (
            <Card className="py-16 text-center text-xs text-muted">{t.loading}</Card>
          ) : payments.length === 0 ? (
            <Card className="py-16 text-center text-sm text-muted">{t.noPayments}</Card>
          ) : (
            <DataTable data={payments} columns={paymentColumns} loading={loading} getRowId={(row) => row.id} />
          )}
        </>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs text-muted">{plans.length} {t.plans}</p>
            <Button icon="plus" variant="primary" onClick={() => setPlanOpen(true)}>{t.createPlan}</Button>
          </div>
          {loading ? (
            <Card className="py-16 text-center text-xs text-muted">{t.loading}</Card>
          ) : plans.length === 0 ? (
            <Card className="py-16 text-center text-sm text-muted">{t.noPlans}</Card>
          ) : (
            <DataTable data={plans} columns={planColumns} loading={loading} getRowId={(row) => row.id} />
          )}
        </>
      )}

      <Modal
        open={paymentOpen}
        onClose={() => { setPaymentOpen(false); setPaymentForm(emptyPayment); }}
        title={t.createPayment}
        subtitle={t.paymentsSubtitle}
        icon={<Icon name="download" size={16} />}
        footer={<><Button onClick={() => setPaymentOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="plus" onClick={createPayment} loading={busy}>{t.create}</Button></>}
      >
        <form onSubmit={createPayment} className="space-y-4">
          <Field label={`${t.user} ID`}><input value={paymentForm.userId} onChange={(e) => setPaymentForm({ ...paymentForm, userId: e.target.value })} className="field" required /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t.amount}><input type="number" min={0} step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })} className="field" required /></Field>
            <Field label={t.currency}><input value={paymentForm.currency} onChange={(e) => setPaymentForm({ ...paymentForm, currency: e.target.value.toUpperCase() })} className="field" required /></Field>
            <Field label={t.provider}><input value={paymentForm.provider} onChange={(e) => setPaymentForm({ ...paymentForm, provider: e.target.value })} className="field" required /></Field>
          </div>
        </form>
      </Modal>

      <Modal
        open={planOpen}
        onClose={() => { setPlanOpen(false); setPlanForm(emptyPlan); }}
        title={t.createPlan}
        subtitle={t.paymentPlans}
        icon={<Icon name="list" size={16} />}
        footer={<><Button onClick={() => setPlanOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="plus" onClick={createPlan} loading={busy}>{t.create}</Button></>}
      >
        <form onSubmit={createPlan} className="space-y-4">
          <Field label={t.name}><input value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} className="field" required /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t.price}><input type="number" min={0} step="0.01" value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: Number(e.target.value) })} className="field" required /></Field>
            <Field label={t.trafficGb}><input type="number" min={1} value={planForm.trafficGb} onChange={(e) => setPlanForm({ ...planForm, trafficGb: Number(e.target.value) })} className="field" required /></Field>
            <Field label={t.durationDays}><input type="number" min={1} value={planForm.durationDays} onChange={(e) => setPlanForm({ ...planForm, durationDays: Number(e.target.value) })} className="field" required /></Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
