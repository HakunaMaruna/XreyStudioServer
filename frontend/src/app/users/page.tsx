'use client';
import { useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';

export default function UsersPage() {
  const { t } = useLang();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [trafficLimit, setTrafficLimit] = useState(100);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/users');
      setUsers(data.data || data);
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
      await api.post('/api/users', { email, password, trafficLimit: trafficLimit * 1024 * 1024 * 1024 });
      setEmail('');
      setPassword('');
      setTrafficLimit(100);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete user?')) return;
    await api.delete(`/api/users/${id}`);
    load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.users}</h1>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <form onSubmit={create} className="flex flex-wrap gap-2 rounded border bg-white p-4 dark:bg-gray-900">
        <input
          placeholder={t.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border px-3 py-2 dark:bg-gray-800"
          required
        />
        <input
          type="password"
          placeholder={t.password}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border px-3 py-2 dark:bg-gray-800"
          required
        />
        <input
          type="number"
          placeholder={t.trafficLimit}
          value={trafficLimit}
          onChange={(e) => setTrafficLimit(Number(e.target.value))}
          className="w-28 rounded border px-3 py-2 dark:bg-gray-800"
        />
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">{t.create}</button>
      </form>

      <div className="overflow-x-auto rounded border bg-white dark:bg-gray-900">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="p-2 text-left">{t.email}</th>
              <th className="p-2 text-left">{t.role}</th>
              <th className="p-2 text-left">{t.status}</th>
              <th className="p-2 text-left">{t.trafficLimit}</th>
              <th className="p-2 text-left">{t.actions}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-4" colSpan={5}>{t.loading}</td></tr>
            ) : users.length === 0 ? (
              <tr><td className="p-4" colSpan={5}>{t.noData}</td></tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b">
                  <td className="p-2">{user.email}</td>
                  <td className="p-2">{user.role}</td>
                  <td className="p-2">{user.status}</td>
                  <td className="p-2">{Math.round(Number(user.trafficLimit) / 1024 / 1024 / 1024)} GB</td>
                  <td className="p-2">
                    <button onClick={() => remove(user.id)} className="text-red-500">{t.delete}</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
