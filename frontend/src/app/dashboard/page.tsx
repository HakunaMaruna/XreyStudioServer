'use client';
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';

type Stats = {
  total: number;
  active: number;
  expired: number;
  disabled: number;
  trafficUsed: string;
};
type NodeStats = { total: number; online: number; offline: number; error: number };
type NodeLoad = { name: string; cpu: number; ram: number };

const COLORS = ['#22c55e', '#f97316', '#ef4444'];

export default function DashboardPage() {
  const { t } = useLang();
  const [stats, setStats] = useState<Stats | null>(null);
  const [nodeStats, setNodeStats] = useState<NodeStats | null>(null);
  const [loads, setLoads] = useState<NodeLoad[]>([]);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    api.get<Stats>('/api/users/stats').then(setStats).catch(() => setStats(null));
    api.get<NodeStats>('/api/nodes/stats').then(setNodeStats).catch(() => setNodeStats(null));
    api
      .get<any>('/api/nodes')
      .then((nodes) =>
        setLoads(
          (Array.isArray(nodes) ? nodes : nodes.data || []).map((node: any) => ({
            name: node.name,
            cpu: Number(node.metrics?.[0]?.cpu || 0),
            ram: Number(node.metrics?.[0]?.ram || 0),
          })),
        ),
      )
      .catch(() => setLoads([]));
  }, []);

  const cards = [
    { label: t.totalUsers, value: stats?.total ?? '-' },
    { label: t.activeUsers, value: stats?.active ?? '-' },
    { label: t.totalNodes, value: nodeStats?.total ?? '-' },
    { label: t.onlineNodes, value: nodeStats?.online ?? '-' },
  ];

  const userStatus = [
    { name: t.activeUsers, value: stats?.active || 0 },
    { name: t.expired, value: stats?.expired || 0 },
    { name: t.disabledUsers, value: stats?.disabled || 0 },
  ];
  const nodeStatus = [
    { name: t.onlineNodes, value: nodeStats?.online || 0 },
    { name: t.offline, value: nodeStats?.offline || 0 },
    { name: 'Error', value: nodeStats?.error || 0 },
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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded border bg-white p-4 dark:bg-gray-900">
          <h2 className="mb-3 font-semibold">{t.usersByStatus}</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={userStatus} dataKey="value" nameKey="name" outerRadius={80} label>
                {userStatus.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded border bg-white p-4 dark:bg-gray-900">
          <h2 className="mb-3 font-semibold">{t.nodesByStatus}</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={nodeStatus}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded border bg-white p-4 dark:bg-gray-900">
        <h2 className="mb-3 font-semibold">{t.nodeLoad}</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={loads}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Legend />
            <Bar dataKey="cpu" name={t.cpu} fill="#22c55e" />
            <Bar dataKey="ram" name={t.ram} fill="#8b5cf6" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded border bg-white p-4 shadow-sm dark:bg-gray-900">
        <p className="text-sm text-gray-500">{t.trafficUsed}</p>
        <p className="mt-2 text-xl font-semibold">
          {stats?.trafficUsed ?? '0'} / {stats?.total ?? '-'}
        </p>
      </div>
    </div>
  );
}
