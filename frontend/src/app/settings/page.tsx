'use client';
import { useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';

export default function SettingsPage() {
  const { t, toggle } = useLang();
  const [theme, setTheme] = useState('light');
  const [metrics, setMetrics] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    const stored = localStorage.getItem('xss_theme') || 'light';
    setTheme(stored);
    api.get('/api/metrics', { headers: { 'X-Metrics-Token': process.env.NEXT_PUBLIC_METRICS_TOKEN || '' } })
      .then((value) => setMetrics(String(value)))
      .catch(() => setMetrics(''));
  }, []);

  const switchTheme = (value: string) => {
    setTheme(value);
    localStorage.setItem('xss_theme', value);
    document.documentElement.classList.toggle('dark', value === 'dark');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.settings}</h1>
      <div className="rounded border bg-white p-4 dark:bg-gray-900">
        <p className="mb-2 font-medium">{t.theme}</p>
        <div className="flex gap-2">
          <button
            onClick={() => switchTheme('light')}
            className={`rounded border px-3 py-1 ${theme === 'light' ? 'bg-blue-600 text-white' : ''}`}
          >
            Light
          </button>
          <button
            onClick={() => switchTheme('dark')}
            className={`rounded border px-3 py-1 ${theme === 'dark' ? 'bg-blue-600 text-white' : ''}`}
          >
            Dark
          </button>
        </div>
      </div>
      <div className="rounded border bg-white p-4 dark:bg-gray-900">
        <p className="mb-2 font-medium">{t.language}</p>
        <button onClick={toggle} className="rounded border px-3 py-1">{t.language}</button>
      </div>
      {metrics && (
        <div className="rounded border bg-white p-4 dark:bg-gray-900">
          <p className="mb-2 font-medium">Metrics</p>
          <pre className="overflow-auto text-xs">{metrics}</pre>
        </div>
      )}
    </div>
  );
}
