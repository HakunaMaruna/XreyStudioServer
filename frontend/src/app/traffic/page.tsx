// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useCallback, useEffect, useState } from 'react';
import { lazyChart } from '../../components/lazy-chart';
import { api, isLoggedIn } from '../../lib/api';

const CartesianGrid = lazyChart('CartesianGrid');
const Legend = lazyChart('Legend');
const Line = lazyChart('Line');
const LineChart = lazyChart('LineChart');
const ResponsiveContainer = lazyChart('ResponsiveContainer');
const Tooltip = lazyChart('Tooltip');
const XAxis = lazyChart('XAxis');
const YAxis = lazyChart('YAxis');
import { useLang } from '../../lib/i18n';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, Field, PageHeader, SectionTitle, formatBytes } from '../../components/ui';

type SeriesPoint = { date: string; up: string; down: string; total: string };
type UserOption = { id: string; email: string };

const tooltipStyle = {
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  fontSize: 11,
  color: 'var(--fg)',
};

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

  useEffect(() => { load(); }, [load]);

  const exportCsv = async () => {
    try {
      await api.downloadCsv(`/api/traffic/export.csv?${params()}`, 'traffic.csv');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const total = series.reduce((sum, point) => sum + Number(point.total), 0);

  return (
    <>
      <PageHeader
        eyebrow={t.billing}
        title={t.traffic}
        subtitle={t.aggregatedUsage}
        icon="activity"
        actions={<Button icon="download" onClick={exportCsv}>{t.exportCsv}</Button>}
      />

      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="field w-auto min-w-[220px]">
            <option value="">{t.allUsers}</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
          </select>
          <Field label={t.periodDays}>
            <input type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value) || 1)} className="field w-24" />
          </Field>
          <Badge tone="brand">{t.total}: {formatBytes(total)}</Badge>
        </div>
      </Card>

      <Card>
        <SectionTitle title={t.chart} subtitle={t.trafficOverview} />
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-xs text-muted">
            <Icon name="refresh" size={15} className="animate-spin text-brand" />{t.loading}
          </div>
        ) : series.length === 0 ? (
          <div className="py-24 text-center text-xs text-subtle">{t.noData}</div>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={series}>
              <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'var(--subtle)', fontSize: 11 }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--subtle)', fontSize: 11 }} tickFormatter={(value: number) => formatBytes(value)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: any) => [formatBytes(value), '']} />
              <Legend />
              <Line type="monotone" dataKey="up" name={t.upload} stroke="var(--brand)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="down" name={t.downloadTraffic} stroke="var(--success)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
    </>
  );
}
