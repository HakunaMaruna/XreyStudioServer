'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLang } from '../../../lib/i18n';

type SubNode = { id: string; name: string; address: string };
type SubLink = { id: string; tag: string; protocol: string; link: string };
type SubData = {
  status: string;
  expiresAt: string | null;
  trafficUsed: number;
  trafficLimit: number;
  nodes?: SubNode[];
  links?: SubLink[];
};

export default function SubscriptionPage() {
  const { t } = useLang();
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SubData | null>(null);
  const [format, setFormat] = useState('json');
  const [output, setOutput] = useState('');

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
    fetch(`${apiBase}/api/subscriptions/${token}?format=json`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [token]);

  const loadFormat = async (value: string) => {
    setFormat(value);
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
    const res = await fetch(`${apiBase}/api/subscriptions/${token}?format=${value}`);
    setOutput(await res.text());
  };

  if (!data) return <div className="p-6">{t.loading}</div>;

  const statusColor = data.status === 'active' ? 'text-green-500' : 'text-red-500';

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">{t.subscriptionPage}</h1>
      <div className="rounded border bg-white p-4 shadow-sm dark:bg-gray-900">
        <p className={`font-semibold ${statusColor}`}>{t.status}: {data.status}</p>
        <p>{t.expiry}: {data.expiresAt ? new Date(data.expiresAt).toLocaleString() : '-'}</p>
        <p>{t.traffic}: {data.trafficUsed} / {data.trafficLimit} GB</p>
      </div>

      <div className="rounded border bg-white p-4 shadow-sm dark:bg-gray-900">
        <h2 className="mb-2 text-lg font-semibold">{t.connections}</h2>
        {data.nodes?.map((node) => (
          <div key={node.id} className="rounded border p-3">
            <p className="font-medium">{node.name}</p>
            <p className="text-sm text-gray-500">{node.address}</p>
          </div>
        ))}
      </div>

      <div className="rounded border bg-white p-4 shadow-sm dark:bg-gray-900">
        <h2 className="mb-2 text-lg font-semibold">{t.availableFormats}</h2>
        <div className="flex flex-wrap gap-2">
          {['raw', 'base64', 'clash', 'singbox', 'json'].map((item) => (
            <button
              key={item}
              onClick={() => loadFormat(item)}
              className={`rounded border px-3 py-1 ${format === item ? 'bg-blue-600 text-white' : ''}`}
            >
              {item}
            </button>
          ))}
        </div>
        {output && (
          <pre className="mt-3 max-h-64 overflow-auto rounded bg-gray-100 p-3 text-xs dark:bg-gray-800">{output}</pre>
        )}
      </div>

      <div className="rounded border bg-white p-4 shadow-sm dark:bg-gray-900">
        <h2 className="mb-2 text-lg font-semibold">{t.links}</h2>
        <div className="space-y-2">
          {data.links?.map((link) => (
            <div key={link.id} className="rounded border p-2">
              <p className="text-xs font-medium">{link.tag} ({link.protocol})</p>
              <code className="break-all text-xs">{link.link}</code>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
