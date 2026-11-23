'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';

type PaymentRow = {
  id: string;
  userId: string;
  amount: string | number;
  currency: string;
  status: string;
  provider: string;
  plan?: { name: string } | null;
  createdAt: string;
};

type PlanRow = { id: string; name: string; price: string | number; trafficGb: number; durationDays: number };

export default function PaymentsPage() {
  const { t } = useLang();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState(10);
  const [planId, setPlanId] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [payments, availablePlans] = await Promise.all([
        api.get('/api/payments'),
        api.get('/api/payments/plans'),
      ]);
      setRows(Array.isArray(payments) ? payments : payments.data || []);
      setPlans(Array.isArray(availablePlans) ? availablePlans : availablePlans.data || []);
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
    setError('');
    try {
      await api.post('/api/payments', { userId, amount, planId: planId || undefined });
      setUserId('');
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const markPaid = async (id: string) => {
    try {
      await api.post(`/api/payments/${id}/paid`);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const columns = useMemo<ColumnDef<PaymentRow>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: t.createdAt,
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
      },
      { accessorKey: 'userId', header: t.user },
      { accessorKey: 'plan', header: t.plan, cell: ({ row }) => row.original.plan?.name || '-' },
      { accessorKey: 'amount', header: t.amount, cell: ({ row }) => `${row.original.amount} ${row.original.currency}` },
      { accessorKey: 'provider', header: t.provider },
      {
        accessorKey: 'status',
        header: t.status,
        cell: ({ row }) => (
          <span className={row.original.status === 'paid' ? 'text-green-500' : 'text-yellow-500'}>
            {row.original.status}
          </span>
        ),
      },
      {
        id: 'actions',
        header: t.actions,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.status !== 'paid' ? (
            <button onClick={() => markPaid(row.original.id)} className="text-blue-500">{t.markPaid}</button>
          ) : null,
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t.payments}</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => api.downloadCsv('/api/payments/export.csv', 'payments.csv').catch((e: any) => setError(e.message))}
            className="rounded bg-blue-600 px-4 py-2 text-white"
          >
            {t.exportCsv}
          </button>
          <Link href="/plans" className="text-sm text-blue-500">{t.plans}</Link>
        </div>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <form onSubmit={create} className="flex flex-wrap gap-2 rounded border bg-white p-4 dark:bg-gray-900">
        <input
          placeholder={t.user}
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="rounded border px-3 py-2 dark:bg-gray-800"
          required
        />
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-24 rounded border px-3 py-2 dark:bg-gray-800"
        />
        <select
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          className="rounded border px-3 py-2 dark:bg-gray-800"
        >
          <option value="">{t.noPlan}</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>{plan.name}</option>
          ))}
        </select>
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">{t.create}</button>
      </form>
      <DataTable data={rows} columns={columns} loading={loading} getRowId={(row) => row.id} />
    </div>
  );
}
