'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon, type IconName } from '../../components/icons';
import { Badge, Button, Card, Field, HelpButton, PageHeader, SectionTitle, Segmented, cn } from '../../components/ui';

type AlertRow = {
  id: string; status: string; title: string; message: string | null;
  severity: string | null; source: string; createdAt: string;
};
type Channels = Record<'telegram' | 'webhook' | 'email' | 'signal', boolean>;
type SettingsResponse = {
  configured: Record<string, boolean>;
  policy: {
    enabled: boolean;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
    cooldownMinutes: number;
    minSeverity: string;
    escalationChannel: string | null;
  };
};
type RouteRow = { id: string; event: string; channel: string; enabled: boolean };
type DeliveryRow = { id: string; event: string; channel: string; status: string; error: string | null; createdAt: string };

const CREDENTIAL_FIELDS = [
  { key: 'TELEGRAM_BOT_TOKEN', label: 'Telegram Bot Token', secret: true },
  { key: 'TELEGRAM_CHAT_ID', label: 'Telegram Chat ID', secret: false },
  { key: 'WEBHOOK_URL', label: 'Webhook URL', secret: false },
  { key: 'WEBHOOK_SECRET', label: 'Webhook HMAC secret', secret: true },
  { key: 'SMTP_HOST', label: 'SMTP Host', secret: false },
  { key: 'SMTP_PORT', label: 'SMTP Port', secret: false },
  { key: 'SMTP_USER', label: 'SMTP User', secret: false },
  { key: 'SMTP_PASSWORD', label: 'SMTP Password', secret: true },
  { key: 'EMAIL_FROM', label: 'Email From', secret: false },
  { key: 'ALERT_EMAIL_TO', label: 'Alert Email To', secret: false },
  { key: 'SIGNAL_API_URL', label: 'Signal API URL', secret: false },
  { key: 'SIGNAL_PHONE_NUMBER', label: 'Signal phone', secret: false },
  { key: 'SIGNAL_RECIPIENT', label: 'Signal recipient', secret: false },
  { key: 'CHEBURCHECK_API_TOKEN', label: 'Cheburcheck API token', secret: true,
    hint: 'Заявка на токен: https://forms.gle/LSPcAV5n3CrdQLMP6 · Документация: https://cheburcheck.ru/kb/api' },
  { key: 'CHEBURCHECK_BASE_URL', label: 'Cheburcheck API URL', secret: false,
    hint: 'Пусто = https://cheburcheck.ru/api/v1. Свой API: https://cheburcheck.ru/kb/api' },
];

const EVENTS = ['NODE_OFFLINE', 'NODE_ONLINE', 'TRAFFIC_ALERT', 'USER_EXPIRED', 'BACKUP_FAILED', 'CONFIG_APPLIED', 'PAYMENT_RECEIVED', 'CHEBURCHECK_BLOCKED'];
const MATRIX_CHANNELS = ['TELEGRAM', 'WEBHOOK', 'EMAIL', 'SIGNAL'];

const channelIcons: Record<keyof Channels, IconName> = {
  telegram: 'zap', webhook: 'link', email: 'box', signal: 'pulse',
};

export default function AlertsPage() {
  const { t, lang } = useLang();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [channels, setChannels] = useState<Channels | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'history' | 'settings'>('history');
  const [settingsData, setSettingsData] = useState<SettingsResponse | null>(null);
  const [credentialDraft, setCredentialDraft] = useState<Record<string, string>>({});
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      const [data, routeData, deliveryData] = await Promise.all([
        api.get<SettingsResponse>('/api/notifications/settings'),
        api.get<RouteRow[]>('/api/notification-routes'),
        api.get<DeliveryRow[]>('/api/notifications/deliveries?limit=50'),
      ]);
      setSettingsData(data);
      setCredentialDraft({});
      setRoutes(Array.isArray(routeData) ? routeData : (routeData as any).data || []);
      setDeliveries(Array.isArray(deliveryData) ? deliveryData : (deliveryData as any).data || []);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const saveSettings = async () => {
    if (!settingsData) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload: Record<string, unknown> = { credentials: credentialDraft, policy: settingsData.policy };
      const data = await api.patch<SettingsResponse>('/api/notifications/settings', payload);
      setSettingsData(data);
      setCredentialDraft({});
      setNotice(t.settingsSaved);
      await loadSettings();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleRoute = async (event: string, channel: string) => {
    try {
      const result = await api.post<RouteRow>('/api/notification-routes', { event, channel, enabled: true });
      setRoutes((current) => {
        const index = current.findIndex((row) => row.event === event && row.channel === channel);
        const next = [...current];
        const enabled = index >= 0 ? !current[index].enabled : true;
        if (index >= 0) next[index] = { ...next[index], enabled };
        else next.push({ ...result, enabled });
        return next;
      });
    } catch (e: any) {
      setError(e.message);
    }
  };

  const testChannel = async (channel: string) => {
    try {
      const result = await api.post<Record<string, { sent: boolean; reason?: string; error?: string }>>('/api/notifications/test', { channel });
      const entry = Object.entries(result)[0];
      setNotice(`${channel}: ${entry?.[1]?.sent ? 'OK' : entry?.[1]?.reason || entry?.[1]?.error || 'failed'}`);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pageIndex + 1), limit: String(pageSize) });
    if (status) params.set('status', status);
    try {
      const data = await api.get(`/api/notifications/alerts?${params.toString()}`);
      setAlerts(data.data || []);
      setTotal(Number(data.total || 0));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [status, pageIndex, pageSize]);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    load();
    api.get<Channels>('/api/notifications/channels').then(setChannels).catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (tab === 'settings') loadSettings();
  }, [tab, loadSettings]);

  useEffect(() => { setPageIndex(0); }, [status]);

  const columns = useMemo<ColumnDef<AlertRow>[]>(
    () => [
      {
        accessorKey: 'status', header: t.status,
        cell: ({ row }) => row.original.status === 'resolved'
          ? <Badge tone="success" dot>{t.resolved}</Badge>
          : <Badge tone="danger" dot>{t.firing}</Badge>,
      },
      { accessorKey: 'title', header: t.title, cell: ({ row }) => <p className="font-medium text-fg">{row.original.title}</p> },
      { accessorKey: 'severity', header: t.severity, cell: ({ row }) => <Badge tone={row.original.severity === 'critical' ? 'danger' : 'warning'}>{row.original.severity || '—'}</Badge> },
      { accessorKey: 'source', header: t.source, cell: ({ row }) => <span className="mono text-[11px] text-muted">{row.original.source}</span> },
      { accessorKey: 'message', header: t.message, cell: ({ row }) => <span className="text-xs text-muted">{row.original.message || '—'}</span> },
      { accessorKey: 'createdAt', header: t.createdAt, cell: ({ row }) => <span className="text-xs text-muted">{new Date(row.original.createdAt).toLocaleString()}</span> },
    ],
    [t],
  );

  const enabledCount = channels ? Object.values(channels).filter(Boolean).length : 0;

  return (
    <>
      <PageHeader
        eyebrow={t.overview}
        title={t.alerts}
        subtitle={t.alertsSubtitle}
        icon="bell"
        actions={
          <>
            <HelpButton title={t.help}><p>{lang === 'ru' ? 'В Настройках реквизиты каналов шифруются и не показываются; пустое поле сохраняет прежнее значение. Матрица событий определяет, куда уходит уведомление. Тихие часы и cooldown могут задержать отправку.' : 'In Settings, channel credentials are encrypted and never shown; an empty field keeps the current value. The event matrix decides where a notification goes. Quiet hours and cooldown can delay delivery.'}</p></HelpButton>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'history', label: t.history, icon: 'history' },
                { value: 'settings', label: t.settings, icon: 'settings' },
              ]}
            />
            <Badge tone={total > 0 ? 'warning' : 'success'} dot>{total} {t.events}</Badge>
          </>
        }
      />

      {tab === 'history' && (
        <>
      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {channels ? (Object.keys(channels) as (keyof Channels)[]).map((key) => (
          <Card key={key} className="flex items-center gap-3 p-4">
            <div className={cn('grid h-9 w-9 place-items-center rounded-lg border', channels[key] ? 'border-success/25 bg-success/10 text-success' : 'border-line bg-surface-2 text-subtle')}>
              <Icon name={channelIcons[key]} size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium capitalize text-fg">{key}</p>
              <p className="text-[10px] text-subtle">{channels[key] ? t.connected : t.notConfigured}</p>
            </div>
            <span className={cn('h-2 w-2 rounded-full', channels[key] ? 'bg-success shadow-[0_0_8px_var(--success)]' : 'bg-line-2')} />
          </Card>
        )) : (
          <div className="col-span-full py-4 text-center text-xs text-subtle">{t.loadingChannels}</div>
        )}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="field w-auto min-w-[180px]">
          <option value="">{t.all} {t.status}</option>
          <option value="firing">{t.firing}</option>
          <option value="resolved">{t.resolved}</option>
        </select>
        <Badge tone="neutral">{t.total}: {total}</Badge>
        <Badge tone="brand">{enabledCount}/4 {t.channelsActive}</Badge>
      </div>

      <DataTable
        data={alerts}
        columns={columns}
        loading={loading}
        getRowId={(row) => row.id}
        hideSearch
        serverPagination={{
          pageIndex, pageSize,
          pageCount: Math.max(1, Math.ceil(total / pageSize)),
          onPageChange: setPageIndex,
          onPageSizeChange: (size) => { setPageSize(size); setPageIndex(0); },
        }}
      />
        </>
      )}

      {tab === 'settings' && (
        <div className="space-y-4">
          {notice && <div className="rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-xs text-success">{notice}</div>}
          {error && <div className="mb-2 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger"><Icon name="alert" size={15} /> {error}</div>}

          <Card>
            <SectionTitle title={t.notificationChannels} subtitle={t.leaveEmptyToKeep} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CREDENTIAL_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Field label={field.label} hint={settingsData?.configured[field.key] ? t.connected : undefined}>
                    <input
                      className="field"
                      type={field.secret ? 'password' : 'text'}
                      autoComplete="off"
                      placeholder={field.secret ? '••••••••' : ''}
                      value={credentialDraft[field.key] ?? ''}
                      onChange={(e) => setCredentialDraft({ ...credentialDraft, [field.key]: e.target.value })}
                    />
                  </Field>
                  {field.hint && <p className="break-all text-[10px] leading-relaxed text-subtle">
                    {field.hint.split(' · ').map((part) => {
                      const [label, url] = part.split(': ');
                      return url?.startsWith('http') ? <a key={url} href={url} target="_blank" rel="noreferrer" className="mr-2 text-brand underline">{label || url}</a> : <span key={part}>{part}</span>;
                    })}
                  </p>}
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(['telegram', 'webhook', 'email', 'signal'] as const).map((channel) => (
                <Button key={channel} size="sm" icon="zap" onClick={() => testChannel(channel)}>{t.testChannel}: {channel}</Button>
              ))}
            </div>
          </Card>

          <Card>
            <SectionTitle title={t.notificationPolicy} />
            {settingsData ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t.enabled}>
                  <input type="checkbox" className="mt-2 h-4 w-4 accent-current" checked={settingsData.policy.enabled}
                    onChange={(e) => setSettingsData({ ...settingsData, policy: { ...settingsData.policy, enabled: e.target.checked } })} />
                </Field>
                <Field label={t.quietFrom}><input className="field" placeholder="23:00" value={settingsData.policy.quietHoursStart || ''}
                  onChange={(e) => setSettingsData({ ...settingsData, policy: { ...settingsData.policy, quietHoursStart: e.target.value || null } })} /></Field>
                <Field label={t.quietTo}><input className="field" placeholder="06:00" value={settingsData.policy.quietHoursEnd || ''}
                  onChange={(e) => setSettingsData({ ...settingsData, policy: { ...settingsData.policy, quietHoursEnd: e.target.value || null } })} /></Field>
                <Field label={t.cooldown}><input type="number" min={0} max={1440} className="field" value={settingsData.policy.cooldownMinutes}
                  onChange={(e) => setSettingsData({ ...settingsData, policy: { ...settingsData.policy, cooldownMinutes: Number(e.target.value) } })} /></Field>
                <Field label={t.minSeverity}>
                  <select className="field" value={settingsData.policy.minSeverity}
                    onChange={(e) => setSettingsData({ ...settingsData, policy: { ...settingsData.policy, minSeverity: e.target.value } })}>
                    <option value="info">info</option><option value="warning">warning</option><option value="critical">critical</option>
                  </select>
                </Field>
                <Field label={t.escalation}>
                  <select className="field" value={settingsData.policy.escalationChannel || ''}
                    onChange={(e) => setSettingsData({ ...settingsData, policy: { ...settingsData.policy, escalationChannel: e.target.value || null } })}>
                    <option value="">—</option>
                    {MATRIX_CHANNELS.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                  </select>
                </Field>
              </div>
            ) : <div className="py-6 text-center text-xs text-subtle">{t.loading}</div>}
            <div className="mt-4 flex justify-end">
              <Button variant="primary" icon="check" loading={saving} onClick={saveSettings}>{t.saveSettings}</Button>
            </div>
          </Card>

          <Card>
            <SectionTitle title={t.notificationMatrix} />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-subtle">
                    <th className="py-2 pr-3 font-medium">{t.type}</th>
                    {MATRIX_CHANNELS.map((channel) => <th key={channel} className="px-2 py-2 text-center font-medium">{channel}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {EVENTS.map((event) => (
                    <tr key={event} className="border-b border-line/60">
                      <td className="py-2 pr-3 mono text-fg">{event}</td>
                      {MATRIX_CHANNELS.map((channel) => {
                        const route = routes.find((row) => row.event === event && row.channel === channel);
                        const active = route?.enabled ?? false;
                        return (
                          <td key={channel} className="px-2 py-2 text-center">
                            <button type="button" aria-label={`${event} ${channel}`}
                              onClick={() => toggleRoute(event, channel)}
                              className={`h-6 w-6 rounded-md border transition ${active ? 'border-success/40 bg-success/20 text-success' : 'border-line bg-surface-2 text-subtle hover:text-fg'}`}>
                              {active ? '✓' : '—'}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <SectionTitle title={t.deliveries} />
            {deliveries.length === 0 ? <div className="py-6 text-center text-xs text-subtle">{t.noData}</div> : (
              <div className="space-y-2">
                {deliveries.map((row) => (
                  <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Badge tone={row.status === 'sent' ? 'success' : 'danger'} dot>{row.status}</Badge>
                      <span className="mono text-fg">{row.event}</span>
                      <span className="text-muted">{row.channel}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {row.error && <span className="max-w-[240px] truncate text-danger">{row.error}</span>}
                      <span className="text-subtle">{new Date(row.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

    </>
  );
}