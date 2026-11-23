'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';

type SeriesPoint = { date: string; up: string; down: string; total: string };
type UserOption = { id: string; email: string };

function toGb(value: string | number) {
  return (Number(value) / 1024 ** 3).toFixed(2);
}

export default function TrafficPage() {
  const { t } = useLang();
  const [days, setDays] = useState(30);
  const [userId, setUserId] = useState('');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const params = () => {
    const query = new URLSearchParams({ days: String(days) });
    if (userId) query.set('userId', userId);
    return query.toString();
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/api/traffic/chart?${params()}`);
      setSeries(data.series || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [days, userId]);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    api.get('/api/users?limit=100')
      .then((data) => setUsers(data.data || []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async () => {
    try {
      await api.downloadCsv(`/api/traffic/export.csv?${params()}`, 'traffic.csv');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const total = series.reduce((sum, point) => sum + Number(point.total), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t.traffic}</h1>
        <button onClick={exportCsv} className="rounded bg-blue-600 px-4 py-2 text-white">
          {t.exportCsv}
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="rounded border px-3 py-2 dark:bg-gray-800"
        >
          <option value="">{t.allUsers}</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.email}</option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={90}
          value={days}
          onChange={(e) => setDays(Number(e.target.value) || 1)}
          className="w-20 rounded border px-3 py-2 dark:bg-gray-800"
          aria-label={t.periodDays}
        />
        <span className="text-gray-500">{t.total}: {toGb(total)} GB</span>
      </div>
      <div className="rounded border bg-white p-4 dark:bg-gray-900">
        <h2 className="mb-4 font-semibold">{t.chart}</h2>
        {loading ? (
          <p className="text-sm text-gray-500">{t.loading}</p>
        ) : series.length === 0 ? (
          <p className="text-sm text-gray-500">{t.noData}</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis tickFormatter={(value) => `${toGb(value)} GB`} />
              <Tooltip formatter={(value: any) => [`${toGb(value)} GB`, '']} />
              <Legend />
              <Line type="monotone" dataKey="up" name={t.upload} stroke="#3b82f6" dot={false} />
              <Line type="monotone" dataKey="down" name={t.downloadTraffic} stroke="#22c55e" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
