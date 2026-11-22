'use client';
import { useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';

export default function DashboardPage() {
  const { t } = useLang();
  const [stats, setStats] = useState<any>(null);
  const [nodeStats, setNodeStats] = useState<any>(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    api.get('/api/users/stats').then(setStats).catch(() => setStats(null));
    api.get('/api/nodes/stats').then(setNodeStats).catch(() => setNodeStats(null));
  }, []);

  const cards = [
    { label: t.totalUsers, value: stats?.total ?? '-' },
    { label: t.activeUsers, value: stats?.active ?? '-' },
    { label: t.totalNodes, value: nodeStats?.total ?? '-' },
    { label: t.onlineNodes, value: nodeStats?.online ?? '-' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.dashboard}</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded border bg-white p-4 shadow-sm dark:bg-gray-900">
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="mt-2 text-3xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded border bg-white p-4 shadow-sm dark:bg-gray-900">
        <p className="text-sm text-gray-500">{t.trafficUsed}</p>
        <p className="mt-2 text-xl font-semibold">{stats?.trafficUsed ?? '0'} / {stats?.trafficLimit ?? '-'}</p>
      </div>
    </div>
  );
}
