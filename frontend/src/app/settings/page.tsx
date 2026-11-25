'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { getTheme, applyTheme, type Theme } from '../../lib/theme';
import { APP_VERSION } from '../../lib/version';
import { Icon } from '../../components/icons';
import {
  Button,
  Card,
  Field,
  PageHeader,
  SectionTitle,
  Segmented,
  Toggle,
} from '../../components/ui';

type PanelSettings = {
  language: 'ru' | 'en';
  theme: 'dark' | 'light';
  alertsEnabled: boolean;
  notifyOnNodeOffline: boolean;
  notifyOnBackup: boolean;
  metricsEnabled: boolean;
  autoRefresh: boolean;
  compactMode: boolean;
};

type NotificationPolicy = {
  enabled: boolean;
  channels: string[];
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  cooldownMinutes: number;
  minSeverity: 'info' | 'warning' | 'critical';
  escalationChannel: string | null;
};

type BackupSettings = {
  enabled: boolean;
  cron: string;
  retentionDays: number;
  lastRun: string | null;
  lastStatus: string | null;
};

type ChannelStatus = Record<string, boolean>;

const DEFAULT_SETTINGS: PanelSettings = {
  language: 'ru',
  theme: 'dark',
  alertsEnabled: true,
  notifyOnNodeOffline: true,
  notifyOnBackup: true,
  metricsEnabled: true,
  autoRefresh: true,
  compactMode: false,
};

const DEFAULT_POLICY: NotificationPolicy = {
  enabled: false,
  channels: [],
  quietHoursStart: null,
  quietHoursEnd: null,
  cooldownMinutes: 15,
  minSeverity: 'warning',
  escalationChannel: null,
};

const DEFAULT_BACKUP: BackupSettings = {
  enabled: false,
  cron: '0 3 * * *',
  retentionDays: 14,
  lastRun: null,
  lastStatus: null,
};

const INTEGRATIONS = [
  { key: 'telegram', labelKey: 'integrationTelegram', href: '/alerts' },
  { key: 'webhook', labelKey: 'integrationWebhook', href: '/alerts' },
  { key: 'email', labelKey: 'integrationEmail', href: '/alerts' },
  { key: 'signal', labelKey: 'integrationSignal', href: '/alerts' },
] as const;

const QUICK_LINKS = [
  { href: '/alerts', icon: 'bell' as const, labelKey: 'openAlertsSettings' },
  { href: '/routing', icon: 'route' as const, labelKey: 'linkRouting' },
  { href: '/subscription-templates', icon: 'globe' as const, labelKey: 'linkTemplates' },
  { href: '/api-tokens', icon: 'key' as const, labelKey: 'linkTokens' },
  { href: '/backups', icon: 'database' as const, labelKey: 'openBackups' },
  { href: '/doctor', icon: 'activity' as const, labelKey: 'linkDoctor' },
] as const;

export default function SettingsPage() {
  const { t } = useLang();
  const [settings, setSettings] = useState<PanelSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [policy, setPolicy] = useState<NotificationPolicy>(DEFAULT_POLICY);
  const [backup, setBackup] = useState<BackupSettings>(DEFAULT_BACKUP);
  const [channels, setChannels] = useState<ChannelStatus>({});
  const [hubError, setHubError] = useState('');
  const [savingHub, setSavingHub] = useState(false);
  const [hubSaved, setHubSaved] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [dnsMode, setDnsMode] = useState('tenant');

  useEffect(() => {
    const stored = localStorage.getItem('xss_settings');
    if (stored) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      } catch {
        localStorage.removeItem('xss_settings');
      }
    }
    setIsAdmin(isLoggedIn());
    api
      .get<Record<string, string>>('/api/config')
      .then(setConfig)
      .catch(() => setConfig({}));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    Promise.all([
      api.get<{ policy?: Partial<NotificationPolicy> }>('/api/notifications/settings'),
      api.get<Partial<BackupSettings>>('/api/backups/settings'),
      api.get<ChannelStatus>('/api/notifications/channels'),
      api.get<{ mode?: string }>('/api/dns/status').catch(() => ({ mode: 'tenant' })),
    ])
      .then(([notificationData, backupData, channelData, dnsData]) => {
        if (cancelled) return;
        if (notificationData.policy) {
          setPolicy({ ...DEFAULT_POLICY, ...notificationData.policy });
        }
        if (backupData.cron !== undefined) {
          setBackup({ ...DEFAULT_BACKUP, ...backupData });
        }
        setChannels(channelData || {});
        setDnsMode(dnsData?.mode || 'tenant');
        setHubError('');
      })
      .catch((err) => {
        if (!cancelled) setHubError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    applyTheme(settings.theme);
    document.documentElement.lang = settings.language;
    localStorage.setItem('xss_settings', JSON.stringify(settings));
  }, [settings]);

  const saveSettings = useCallback(() => {
    localStorage.setItem('xss_settings', JSON.stringify(settings));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }, [settings]);

  const saveNotificationPolicy = useCallback(async () => {
    setSavingHub(true);
    setHubSaved(false);
    try {
      const result = await api.patch<{ policy?: Partial<NotificationPolicy> }>(
        '/api/notifications/settings',
        { policy },
      );
      if (result.policy) setPolicy((prev) => ({ ...prev, ...result.policy }));
      setHubError('');
      setHubSaved(true);
      window.setTimeout(() => setHubSaved(false), 2000);
    } catch (err) {
      setHubError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingHub(false);
    }
  }, [policy]);

  const saveBackupSettings = useCallback(async () => {
    setSavingHub(true);
    setHubSaved(false);
    try {
      const result = await api.patch<Partial<BackupSettings>>('/api/backups/settings', {
        enabled: backup.enabled,
        cron: backup.cron,
        retentionDays: backup.retentionDays,
      });
      if (result.cron !== undefined) setBackup((prev) => ({ ...prev, ...result }));
      setHubError('');
      setHubSaved(true);
      window.setTimeout(() => setHubSaved(false), 2000);
    } catch (err) {
      setHubError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingHub(false);
    }
  }, [backup]);

  const toggleChannel = useCallback((channel: string) => {
    setPolicy((prev) => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter((item) => item !== channel)
        : [...prev.channels, channel],
    }));
  }, []);

  const configRows = useMemo(
    () =>
      Object.entries(config)
        .filter(([key]) => !/TOKEN|SECRET|PASSWORD|KEY|WEBHOOK/i.test(key))
        .slice(0, 8),
    [config],
  );

  if (!ready) return null;

  return (
    <>
      <PageHeader
        title={t.settingsTitle}
        subtitle={t.settingsSubtitle}
        actions={<span className="tag">v{APP_VERSION}</span>}
      />

      {isAdmin && (
        <>
          <SectionTitle title={t.settingsHub} subtitle={t.settingsHubSubtitle} />
          {hubError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{hubError}</div>}
          {hubSaved && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{t.settingsSaved}</div>}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <SectionTitle title={t.notificationPolicyTitle} subtitle={t.notificationPolicySubtitle} />
              <div className="space-y-3">
                <Toggle
                  checked={policy.enabled}
                  onChange={(value) => setPolicy((prev) => ({ ...prev, enabled: value }))}
                  label={t.enabled}
                />
                <div>
                  <label className="label">{t.channelsActive}</label>
                  <div className="flex flex-wrap gap-2">
                    {INTEGRATIONS.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={`rounded-full border px-3 py-1 text-xs ${policy.channels.includes(item.key) ? 'border-brand/50 bg-brand/15 text-fg' : 'border-line bg-surface-2 text-muted'}`}
                        onClick={() => toggleChannel(item.key)}
                      >
                        {t[item.labelKey]}
                      </button>
                    ))}
                  </div>
                </div>
                <Field label={t.quietFrom}>
                  <input
                    className="input"
                    type="time"
                    value={policy.quietHoursStart ?? ''}
                    onChange={(event) =>
                      setPolicy((prev) => ({
                        ...prev,
                        quietHoursStart: event.target.value || null,
                      }))
                    }
                  />
                </Field>
                <Field label={t.quietTo}>
                  <input
                    className="input"
                    type="time"
                    value={policy.quietHoursEnd ?? ''}
                    onChange={(event) =>
                      setPolicy((prev) => ({ ...prev, quietHoursEnd: event.target.value || null }))
                    }
                  />
                </Field>
                <Field label={t.cooldown}>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={1440}
                    value={policy.cooldownMinutes}
                    onChange={(event) =>
                      setPolicy((prev) => ({
                        ...prev,
                        cooldownMinutes: Math.max(0, Math.min(1440, Number(event.target.value) || 0)),
                      }))
                    }
                  />
                </Field>
                <Field label={t.minSeverity}>
                  <select
                    className="input"
                    value={policy.minSeverity}
                    onChange={(event) =>
                      setPolicy((prev) => ({
                        ...prev,
                        minSeverity: event.target.value as NotificationPolicy['minSeverity'],
                      }))
                    }
                  >
                    <option value="info">info</option>
                    <option value="warning">warning</option>
                    <option value="critical">critical</option>
                  </select>
                </Field>
                <Field label={t.escalation}>
                  <select
                    className="input"
                    value={policy.escalationChannel ?? ''}
                    onChange={(event) =>
                      setPolicy((prev) => ({
                        ...prev,
                        escalationChannel: event.target.value || null,
                      }))
                    }
                  >
                    <option value="">—</option>
                    {INTEGRATIONS.map((item) => (
                      <option key={item.key} value={item.key}>
                        {t[item.labelKey]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button onClick={saveNotificationPolicy} disabled={savingHub}>
                  <Icon name="check" size={14} /> {t.saveSettings}
                </Button>
              </div>
            </Card>

            <Card>
              <SectionTitle title={t.backupScheduleTitle} subtitle={t.backupScheduleSubtitle} />
              <div className="space-y-3">
                <Toggle
                  checked={backup.enabled}
                  onChange={(value) => setBackup((prev) => ({ ...prev, enabled: value }))}
                  label={t.backupEnabled}
                />
                <Field label={t.backupCron} hint="0 3 * * *">
                  <input
                    className="input"
                    value={backup.cron}
                    onChange={(event) => setBackup((prev) => ({ ...prev, cron: event.target.value }))}
                  />
                </Field>
                <Field label={t.backupRetentionDays}>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={365}
                    value={backup.retentionDays}
                    onChange={(event) =>
                      setBackup((prev) => ({
                        ...prev,
                        retentionDays: Math.max(1, Math.min(365, Number(event.target.value) || 1)),
                      }))
                    }
                  />
                </Field>
                <div className="flex items-center gap-2 text-xs text-muted">
                  {t.lastBackup}: {backup.lastRun ? new Date(backup.lastRun).toLocaleString() : t.never}
                  {backup.lastStatus ? ` · ${backup.lastStatus}` : ''}
                </div>
                <Button onClick={saveBackupSettings} disabled={savingHub}>
                  <Icon name="check" size={14} /> {t.saveSettings}
                </Button>
                <div className="border-t border-line pt-4" />
                <SectionTitle title={t.integrationsTitle} subtitle={t.integrationsSubtitle} />
                <div className="space-y-3">
                  {INTEGRATIONS.map((item) => {
                    const readyChannel = Boolean(channels[item.key]);
                    return (
                      <div className="flex items-center justify-between" key={item.key}>
                        <span>{t[item.labelKey]}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${readyChannel ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-line text-muted'}`}>
                          {readyChannel ? t.configured : t.notConfigured}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>

          <Card>
            <SectionTitle title={t.quickLinks} subtitle={t.quickLinksSubtitle} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {QUICK_LINKS.map((link) => (
                <a className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-3 transition hover:border-brand/40" href={link.href} key={link.href}>
                  <Icon name={link.icon} size={18} />
                  <span>{t[link.labelKey]}</span>
                  <Icon name="arrowUpRight" size={14} />
                </a>
              ))}
              {dnsMode === 'control' && (
                <a className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-3 transition hover:border-brand/40" href="/dns">
                  <Icon name="network" size={18} />
                  <span>{t.dnsSection}</span>
                  <Icon name="arrowUpRight" size={14} />
                </a>
              )}
            </div>
          </Card>
        </>
      )}

      <SectionTitle title={t.settingsTitle} subtitle={t.settingsSubtitle} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle title={t.appearance} />
          <div className="space-y-3">
            <Field label={t.theme}>
              <Segmented<'dark' | 'light'>
                value={settings.theme}
                onChange={(theme) => setSettings((prev) => ({ ...prev, theme }))}
                options={[
                  { value: 'dark', label: t.themeDark },
                  { value: 'light', label: t.themeLight },
                ]}
              />
            </Field>
            <Field label={t.language}>
              <Segmented<'ru' | 'en'>
                value={settings.language}
                onChange={(language) => setSettings((prev) => ({ ...prev, language }))}
                options={[
                  { value: 'ru', label: 'RU' },
                  { value: 'en', label: 'EN' },
                ]}
              />
            </Field>
            <Toggle
              checked={settings.compactMode}
              onChange={(compactMode) => setSettings((prev) => ({ ...prev, compactMode }))}
              label={t.compactMode}
            />
          </div>
        </Card>

        <Card>
          <SectionTitle title={t.behavior} />
          <div className="space-y-3">
            <Toggle
              checked={settings.alertsEnabled}
              onChange={(alertsEnabled) => setSettings((prev) => ({ ...prev, alertsEnabled }))}
              label={t.alertsEnabled}
            />
            <Toggle
              checked={settings.notifyOnNodeOffline}
              onChange={(notifyOnNodeOffline) =>
                setSettings((prev) => ({ ...prev, notifyOnNodeOffline }))
              }
              label={t.notifyOnNodeOffline}
            />
            <Toggle
              checked={settings.notifyOnBackup}
              onChange={(notifyOnBackup) => setSettings((prev) => ({ ...prev, notifyOnBackup }))}
              label={t.notifyOnBackup}
            />
            <Toggle
              checked={settings.metricsEnabled}
              onChange={(metricsEnabled) => setSettings((prev) => ({ ...prev, metricsEnabled }))}
              label={t.metricsEnabled}
            />
            <Toggle
              checked={settings.autoRefresh}
              onChange={(autoRefresh) => setSettings((prev) => ({ ...prev, autoRefresh }))}
              label={t.autoRefresh}
            />
          </div>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={saveSettings}>
          <Icon name="check" size={14} /> {t.saveSettings}
        </Button>
        {saved && <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">{t.settingsSaved}</span>}
      </div>

      <SectionTitle title={t.environment} subtitle={t.environmentSubtitle} />
      <Card>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t.parameter}</th>
                <th>{t.value}</th>
              </tr>
            </thead>
            <tbody>
              {configRows.map(([key, value]) => (
                <tr key={key}>
                  <td className="mono">{key}</td>
                  <td className="mono">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
