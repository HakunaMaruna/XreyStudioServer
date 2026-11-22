'use client';
import { useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';

type PlanRow = {
  id: string;
  name: string;
  price: string | number;
  trafficGb: number;
  durationDays: number;
  enabled: boolean;
  createdAt: string;
};

export default function PlansPage() {
  const { t } = useLang();
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState(10);
  const [trafficGb, setTrafficGb] = useState(100);
  const [durationDays, setDurationDays] = useState(30);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const data = await api.get('/api/payments/plans');
      setRows(Array.isArray(data) ? data : data.data || []);
    } catch (e: any) {
      setError(e.message);
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
    try {
      await api.post('/api/payments/plans', { name, price, trafficGb, durationDays });
      setName('');
      await load();
    } catch (e: any) {
      setError(e.message);
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.plans}</h1>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <form onSubmit={create} className="flex flex-wrap gap-2 rounded border bg-white p-4 dark:bg-gray-900">
        <input
          placeholder={t.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border px-3 py-2 dark:bg-gray-800"
          required
        />
        <input
          type="number"
          min={0}
          placeholder={t.price}
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
          className="w-24 rounded border px-3 py-2 dark:bg-gray-800"
        />
        <input
          type="number"
          min={1}
          placeholder={t.trafficLimit}
          value={trafficGb}
          onChange={(e) => setTrafficGb(Number(e.target.value))}
          className="w-28 rounded border px-3 py-2 dark:bg-gray-800"
        />
        <input
          type="number"
          min={1}
          placeholder={t.durationDays}
          value={durationDays}
          onChange={(e) => setDurationDays(Number(e.target.value))}
          className="w-28 rounded border px-3 py-2 dark:bg-gray-800"
        />
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">{t.create}</button>
      </form>
      <div className="overflow-x-auto rounded border bg-white dark:bg-gray-900">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="p-2 text-left">{t.name}</th>
              <th className="p-2 text-left">{t.price}</th>
              <th className="p-2 text-left">{t.trafficLimit}</th>
              <th className="p-2 text-left">{t.durationDays}</th>
              <th className="p-2 text-left">{t.enabled}</th>
              <th className="p-2 text-left">{t.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="p-2">{row.name}</td>
                <td className="p-2">{row.price}</td>
                <td className="p-2">{row.trafficGb} GB</td>
                <td className="p-2">{row.durationDays}</td>
                <td className="p-2">{row.enabled ? '✓' : '—'}</td>
                <td className="p-2">
                  <button onClick={() => toggle(row)} className="text-blue-500">
                    {row.enabled ? t.disable : t.enable}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="p-4" colSpan={6}>{t.noData}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
