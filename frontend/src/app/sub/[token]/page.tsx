'use client';
import { useEffect, useState } from 'react';

export default function SubscriptionPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch(`/api/subscriptions/${params.token}`).then((r) => r.json()).then(setData).catch(() => setData(null));
  }, [params.token]);

  if (!data) return <div className="p-6">Loading...</div>;

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">XreyStudioServer Subscription</h1>
      <div className="rounded border p-4">
        <p>Status: {data.status}</p>
        <p>Expires: {data.expiresAt}</p>
        <p>Traffic: {data.trafficUsed} / {data.trafficLimit} GB</p>
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Connections</h2>
        {data.nodes?.map((n: any) => (
          <div key={n.id} className="rounded border p-3">
            <p>{n.name} ({n.address})</p>
            <p className="text-sm text-gray-500">{n.protocols?.join(', ')}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Links</h2>
        {Object.entries(data.links || {}).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <code className="text-xs break-all">{String(v)}</code>
          </div>
        ))}
      </div>
      <div className="text-sm text-gray-500">
        Formats: base64, Clash, sing-box, JSON, raw. User-Agent auto-detection enabled.
      </div>
    </main>
  );
}