// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { Badge, Button, Card, HelpButton, PageHeader, SectionTitle, Toggle } from '../../components/ui';

type Status = {
  accepted: boolean; enabled: boolean; installId: string; licenseUrl: string;
  configured: boolean; mode: string; lastSentAt: string | null;
};
type Preview = { counts: Record<string, number>; events: Array<{ action: string; count: number }> };
type Installation = {
  installId: string; mode: string; version: string | null; firstSeen: string; lastSeen: string;
  latest: { counts?: Record<string, number>; version?: string; capturedAt?: string } | null;
};
type LogRow = { id: string; level: string; source: string; message: string; createdAt: string; installation: { installId: string } };

const COUNT_KEYS = ['users', 'nodes', 'inbounds', 'enabledInbounds', 'rules', 'hosts', 'routingProfiles', 'organizations', 'plans', 'payments', 'balancers', 'dnsProfiles', 'plugins', 'snapshots'];

export default function TelemetryPage() {
  const { t, lang } = useLang();
  const [status, setStatus] = useState<Status | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [s, p, i, l] = await Promise.all([
        api.get<Status>('/api/telemetry/status'),
        api.get<Preview>('/api/telemetry/preview').catch(() => null),
        api.get<Installation[]>('/api/telemetry/installations').catch(() => []),
        api.get<LogRow[]>('/api/telemetry/logs?limit=50').catch(() => []),
      ]);
      setStatus(s); setPreview(p); setInstallations(i); setLogs(l);
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) { window.location.href = '/login'; return; }
    load();
  }, [load]);

  const setEnabled = async (enabled: boolean) => {
    setBusy(true); setError('');
    try {
      await api.post('/api/telemetry/consent', { accepted: true, enabled });
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const sendNow = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.post<any>('/api/telemetry/send', {});
      setNotice(JSON.stringify(result));
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader eyebrow={t.system} title={t.telemetry} subtitle={t.telemetrySubtitle} icon="activity"
        actions={<><HelpButton title={t.help}>
          <p>{lang === 'ru'
            ? 'Отправляются только агрегированные счётчики и обезличенные события. Данные можно отключить в любой момент. Сбор включён только после принятия лицензионного соглашения.'
            : 'Only aggregated counters and anonymized events are sent. You can disable it at any time. Collection starts only after the license agreement is accepted.'}</p>
        </HelpButton><Button icon="refresh" size="sm" onClick={load}>{t.refresh}</Button></>} />
      {error && <div className="mb-4 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
      {notice && <div className="mb-4 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs text-success">{notice}</div>}

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <SectionTitle title={t.telemetry} subtitle={status?.mode} />
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted">{t.telemetryInstallId}</span><span className="mono text-fg">{status?.installId || '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted">{t.telemetryEnabled}</span><Toggle checked={Boolean(status?.enabled)} onChange={setEnabled} /></div>
            <div className="flex justify-between"><span className="text-muted">{t.telemetryConfigured}</span><Badge tone={status?.configured ? 'success' : 'warning'} dot>{status?.configured ? (lang === 'ru' ? 'да' : 'yes') : (lang === 'ru' ? 'нет' : 'no')}</Badge></div>
            <div className="flex justify-between"><span className="text-muted">{t.telemetryLastSeen}</span><span className="text-fg">{status?.lastSentAt ? new Date(status.lastSentAt).toLocaleString() : '—'}</span></div>
            {status?.licenseUrl && <a className="text-brand underline" href={status.licenseUrl} target="_blank" rel="noopener noreferrer">{t.telemetryLicense}</a>}
          </div>
          <Button variant="primary" icon="upload" size="sm" className="mt-4" loading={busy} disabled={!status?.configured || !status?.accepted} onClick={sendNow}>{t.telemetrySendNow}</Button>
          {!status?.configured && <p className="mt-2 text-xs text-warning">{t.telemetryNoConfig}</p>}
        </Card>

        <Card className="p-4">
          <SectionTitle title={t.telemetryOverview} subtitle={lang === 'ru' ? 'Что отправляется' : 'What is sent'} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {COUNT_KEYS.map((key) => (
              <div key={key} className="rounded-lg border border-line bg-surface-2/40 p-2.5">
                <p className="text-[10px] uppercase text-subtle">{key}</p>
                <p className="text-lg font-semibold text-fg">{preview?.counts?.[key] ?? 0}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <SectionTitle title={t.telemetryInstallations} subtitle={`${t.telemetryTotal}: ${installations.length}`} />
        {!installations.length ? <Card className="py-12 text-center text-xs text-subtle">{t.telemetryNoData}</Card> : (
          <div className="grid gap-3 md:grid-cols-2">
            {installations.map((row) => (
              <Card key={row.installId} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="mono text-[11px] text-fg">{row.installId}</p>
                  <Badge tone="brand">{row.mode} · {row.version || '—'}</Badge>
                </div>
                <p className="mt-1 text-[10px] text-subtle">{t.telemetryLastSeen}: {new Date(row.lastSeen).toLocaleString()}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  {['nodes', 'users', 'rules'].map((key) => (
                    <div key={key} className="rounded-lg border border-line bg-surface-2/40 py-1.5">
                      <p className="text-[9px] uppercase text-subtle">{key}</p>
                      <p className="text-sm font-semibold text-fg">{row.latest?.counts?.[key] ?? 0}</p>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {logs.length > 0 && <div className="mt-4">
        <SectionTitle title={t.telemetryLogs} />
        <Card className="divide-y divide-line/40 p-0">
          {logs.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-[11px]">
              <span className="mono text-subtle">{new Date(row.createdAt).toLocaleString()}</span>
              <Badge tone="neutral">{row.installation.installId.slice(0, 8)}</Badge>
              <span className="text-muted">{row.message}</span>
            </div>
          ))}
        </Card>
      </div>}
    </>
  );
}
