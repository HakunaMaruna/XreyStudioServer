'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang, type Dict } from '../../lib/i18n';
import { getTheme, applyTheme, type Theme } from '../../lib/theme';
import { APP_VERSION } from '../../lib/version';
import { fetchUpdateStatus, type UpdateStatus } from '../../lib/updates';
import { UpdateDialog } from '../../components/update-dialog';
import { Icon } from '../../components/icons';
import {
  Badge,
  Button,
  Card,
  CodeBlock,
  Field,
  Modal,
  PageHeader,
  SectionTitle,
  Segmented,
  Toggle,
  formatBytes,
} from '../../components/ui';

type Snapshot = {
  id: string;
  label: string;
  kind: 'MANUAL' | 'PRE_UPDATE' | 'PRE_SETTINGS_CHANGE' | 'SCHEDULED' | 'PRE_RESTORE';
  scope: 'FULL' | 'SETTINGS';
  status: 'CREATING' | 'READY' | 'FAILED' | 'RESTORING' | 'RESTORED';
  reason?: string;
  appVersion: string;
  sizeBytes: number;
  checksum: string;
  createdAt: string;
  restoredAt?: string;
};

type SnapshotPolicy = {
  autoBeforeUpdates: boolean;
  autoBeforeSettings: boolean;
  retention: number;
  cooldownMinutes: number;
};

type RestorePlan = {
  components?: string[];
  [key: string]: unknown;
};

type SnapshotModal =
  | { kind: 'restore'; snapshot: Snapshot }
  | { kind: 'plan'; snapshot: Snapshot; plan: RestorePlan }
  | { kind: 'delete'; snapshot: Snapshot }
  | null;

type PanelSettings = {
  language: 'ru' | 'en';
  theme: 'dark' | 'light';
  alertsEnabled: boolean;
  notifyOnNodeOffline: boolean;
  notifyOnBackup: boolean;
  metricsEnabled: boolean;
  autoRefresh: boolean;
  compactMode: boolean;
  updateCheckEnabled: boolean;
  updateChannel: 'stable' | 'dev';
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
  updateCheckEnabled: true,
  updateChannel: 'stable',
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

const DEFAULT_SNAPSHOT_POLICY: SnapshotPolicy = {
  autoBeforeUpdates: false,
  autoBeforeSettings: false,
  retention: 10,
  cooldownMinutes: 30,
};

const SNAPSHOT_COMPONENTS = ['db', 'settings'] as const;

const snapshotKindLabel: Record<Snapshot['kind'], keyof Dict> = {
  MANUAL: 'snapshotKindManual',
  PRE_UPDATE: 'snapshotKindPreUpdate',
  PRE_SETTINGS_CHANGE: 'snapshotKindPreSettings',
  SCHEDULED: 'snapshotKindScheduled',
  PRE_RESTORE: 'snapshotKindPreRestore',
};

const snapshotStatusLabel: Record<Snapshot['status'], keyof Dict> = {
  CREATING: 'snapshotStatusCreating',
  READY: 'snapshotStatusReady',
  FAILED: 'snapshotStatusFailed',
  RESTORING: 'snapshotStatusRestoring',
  RESTORED: 'snapshotStatusRestored',
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
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotPolicy, setSnapshotPolicy] = useState<SnapshotPolicy>(DEFAULT_SNAPSHOT_POLICY);
  const [snapshotForm, setSnapshotForm] = useState({ label: '', reason: '', scope: 'FULL' as Snapshot['scope'] });
  const [snapshotModal, setSnapshotModal] = useState<SnapshotModal>(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [snapshotNotice, setSnapshotNotice] = useState('');
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [updateLoading, setUpdateLoading] = useState(true);
  const [updateOpen, setUpdateOpen] = useState(false);

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
    fetchUpdateStatus()
      .then(setUpdate)
      .catch(() => setUpdate(null))
      .finally(() => setUpdateLoading(false));
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

  const loadSnapshots = useCallback(async () => {
    const [list, policyData] = await Promise.all([
      api.get<{ items: Snapshot[] }>('/api/snapshots'),
      api.get<SnapshotPolicy>('/api/snapshots/policy'),
    ]);
    setSnapshots(Array.isArray(list.items) ? list.items : []);
    setSnapshotPolicy({ ...DEFAULT_SNAPSHOT_POLICY, ...policyData });
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    loadSnapshots()
      .then(() => {
        if (!cancelled) setHubError('');
      })
      .catch((err) => {
        if (!cancelled) setHubError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, loadSnapshots]);

  useEffect(() => {
    applyTheme(settings.theme);
    document.documentElement.lang = settings.language;
    document.documentElement.classList.toggle('compact', Boolean(settings.compactMode));
    localStorage.setItem('xss_settings', JSON.stringify(settings));
  }, [settings]);

  const checkUpdate = async () => {
    setUpdateLoading(true);
    try {
      setUpdate(await fetchUpdateStatus(true));
    } catch {
      setUpdate(null);
    } finally {
      setUpdateLoading(false);
    }
  };

  const saveSettings = useCallback(async () => {
    try {
      const updated = await api.patch('/api/settings', {
        updateCheckEnabled: settings.updateCheckEnabled,
        updateChannel: settings.updateChannel,
      });
      setSettings((prev) => ({
        ...prev,
        updateCheckEnabled: Boolean(updated.updateCheckEnabled ?? prev.updateCheckEnabled),
        updateChannel: updated.updateChannel === 'dev' ? 'dev' : 'stable',
      }));
      localStorage.setItem('xss_settings', JSON.stringify(settings));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      fetchUpdateStatus(true).then(setUpdate).catch(() => undefined);
      setHubError('');
    } catch (err) {
      setHubError(err instanceof Error ? err.message : String(err));
    }
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

  const saveSnapshotPolicy = useCallback(async () => {
    setSnapshotBusy(true);
    setHubSaved(false);
    try {
      const result = await api.patch<SnapshotPolicy>('/api/snapshots/policy', {
        autoBeforeUpdates: snapshotPolicy.autoBeforeUpdates,
        autoBeforeSettings: snapshotPolicy.autoBeforeSettings,
        retention: snapshotPolicy.retention,
        cooldownMinutes: snapshotPolicy.cooldownMinutes,
      });
      setSnapshotPolicy({ ...DEFAULT_SNAPSHOT_POLICY, ...result });
      setHubError('');
      setHubSaved(true);
      setSnapshotNotice(t.snapshotSavePolicy);
      window.setTimeout(() => setHubSaved(false), 2000);
    } catch (err) {
      setHubError(err instanceof Error ? err.message : String(err));
    } finally {
      setSnapshotBusy(false);
    }
  }, [snapshotPolicy, t.snapshotSavePolicy]);

  const createSnapshot = useCallback(async () => {
    setSnapshotBusy(true);
    try {
      const body: { label?: string; reason?: string; scope: Snapshot['scope'] } = {
        scope: snapshotForm.scope,
      };
      if (snapshotForm.label.trim()) body.label = snapshotForm.label.trim();
      if (snapshotForm.reason.trim()) body.reason = snapshotForm.reason.trim();
      await api.post<Snapshot>('/api/snapshots', body);
      setSnapshotForm({ label: '', reason: '', scope: 'FULL' });
      await loadSnapshots();
      setHubError('');
      setSnapshotNotice(t.snapshotCreatedOk);
    } catch (err) {
      setHubError(err instanceof Error ? err.message : String(err));
    } finally {
      setSnapshotBusy(false);
    }
  }, [snapshotForm, loadSnapshots, t.snapshotCreatedOk]);

  const openRestore = useCallback((snapshot: Snapshot) => {
    setHubError('');
    setSnapshotNotice('');
    setSnapshotModal({ kind: 'restore', snapshot });
  }, []);

  const startRestore = useCallback(async () => {
    if (!snapshotModal || (snapshotModal.kind !== 'restore' && snapshotModal.kind !== 'plan')) return;
    const snapshot = snapshotModal.snapshot;
    setSnapshotBusy(true);
    try {
      const result = await api.post<RestorePlan>(
        `/api/snapshots/${encodeURIComponent(snapshot.id)}/restore`,
        {
          confirm: true,
          components: [...SNAPSHOT_COMPONENTS],
          ...(snapshotModal.kind === 'restore' ? { dryRun: true } : {}),
        },
      );
      if (snapshotModal.kind === 'restore') {
        setSnapshotModal({ kind: 'plan', snapshot, plan: result || {} });
        setSnapshotNotice(t.snapshotDryRunOk);
      } else {
        setSnapshotModal(null);
        await loadSnapshots();
        setSnapshotNotice(t.snapshotRestoreDone);
      }
      setHubError('');
    } catch (err) {
      setHubError(err instanceof Error ? err.message : String(err));
    } finally {
      setSnapshotBusy(false);
    }
  }, [snapshotModal, loadSnapshots, t.snapshotDryRunOk, t.snapshotRestoreDone]);

  const deleteSnapshot = useCallback(async () => {
    if (!snapshotModal || snapshotModal.kind !== 'delete') return;
    const snapshot = snapshotModal.snapshot;
    setSnapshotBusy(true);
    try {
      await api.delete(`/api/snapshots/${encodeURIComponent(snapshot.id)}`);
      setSnapshotModal(null);
      await loadSnapshots();
      setHubError('');
      setSnapshotNotice(t.snapshotDeleted);
    } catch (err) {
      setHubError(err instanceof Error ? err.message : String(err));
    } finally {
      setSnapshotBusy(false);
    }
  }, [snapshotModal, loadSnapshots, t.snapshotDeleted]);

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
                  <label className="mb-1.5 block text-[11px] font-medium text-subtle">{t.channelsActive}</label>
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
                    className="field"
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
                    className="field"
                    type="time"
                    value={policy.quietHoursEnd ?? ''}
                    onChange={(event) =>
                      setPolicy((prev) => ({ ...prev, quietHoursEnd: event.target.value || null }))
                    }
                  />
                </Field>
                <Field label={t.cooldown}>
                  <input
                    className="field"
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
                    className="field"
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
                    className="field"
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
                <Button onClick={saveNotificationPolicy} disabled={savingHub} className="w-full sm:w-auto">
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
                    className="field"
                    value={backup.cron}
                    onChange={(event) => setBackup((prev) => ({ ...prev, cron: event.target.value }))}
                  />
                </Field>
                <Field label={t.backupRetentionDays}>
                  <input
                    className="field"
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
                <Button onClick={saveBackupSettings} disabled={savingHub} className="w-full sm:w-auto">
                  <Icon name="check" size={14} /> {t.saveSettings}
                </Button>
                <div className="border-t border-line pt-4" />
                <SectionTitle title={t.integrationsTitle} subtitle={t.integrationsSubtitle} />
                <div className="space-y-3">
                  {INTEGRATIONS.map((item) => {
                    const readyChannel = Boolean(channels[item.key]);
                    return (
                      <div className="flex min-w-0 items-center justify-between gap-3" key={item.key}>
                        <span className="min-w-0 truncate">{t[item.labelKey]}</span>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${readyChannel ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-line text-muted'}`}>
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
            <SectionTitle title={t.snapshotStateTitle} subtitle={t.snapshotStateSubtitle} />
            <div className="space-y-5">
              <div className="space-y-3">
                <p className="text-xs font-semibold text-subtle">{t.snapshotPolicyTitle}</p>
                <Toggle
                  checked={snapshotPolicy.autoBeforeUpdates}
                  onChange={(value) => setSnapshotPolicy((prev) => ({ ...prev, autoBeforeUpdates: value }))}
                  label={t.snapshotAutoUpdates}
                />
                <Toggle
                  checked={snapshotPolicy.autoBeforeSettings}
                  onChange={(value) => setSnapshotPolicy((prev) => ({ ...prev, autoBeforeSettings: value }))}
                  label={t.snapshotAutoSettings}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t.snapshotRetention}>
                    <input
                      className="field"
                      type="number"
                      min={1}
                      max={100}
                      value={snapshotPolicy.retention}
                      onChange={(event) =>
                        setSnapshotPolicy((prev) => ({
                          ...prev,
                          retention: Math.max(1, Math.min(100, Number(event.target.value) || 1)),
                        }))
                      }
                    />
                  </Field>
                  <Field label={t.snapshotCooldown}>
                    <input
                      className="field"
                      type="number"
                      min={0}
                      max={10080}
                      value={snapshotPolicy.cooldownMinutes}
                      onChange={(event) =>
                        setSnapshotPolicy((prev) => ({
                          ...prev,
                          cooldownMinutes: Math.max(0, Math.min(10080, Number(event.target.value) || 0)),
                        }))
                      }
                    />
                  </Field>
                </div>
                <Button onClick={saveSnapshotPolicy} disabled={snapshotBusy} className="w-full sm:w-auto">
                  <Icon name="check" size={14} /> {t.snapshotSavePolicy}
                </Button>
              </div>

              <div className="space-y-3 border-t border-line pt-5">
                <p className="text-xs font-semibold text-subtle">{t.snapshotCreateTitle}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={t.snapshotLabel}>
                    <input
                      className="field"
                      maxLength={120}
                      value={snapshotForm.label}
                      onChange={(event) => setSnapshotForm((prev) => ({ ...prev, label: event.target.value }))}
                    />
                  </Field>
                  <Field label={t.snapshotReason}>
                    <input
                      className="field"
                      maxLength={240}
                      value={snapshotForm.reason}
                      onChange={(event) => setSnapshotForm((prev) => ({ ...prev, reason: event.target.value }))}
                    />
                  </Field>
                  <Field label={t.snapshotScope}>
                    <select
                      className="field"
                      value={snapshotForm.scope}
                      onChange={(event) =>
                        setSnapshotForm((prev) => ({
                          ...prev,
                          scope: event.target.value === 'SETTINGS' ? 'SETTINGS' : 'FULL',
                        }))
                      }
                    >
                      <option value="FULL">{t.snapshotScopeFull}</option>
                      <option value="SETTINGS">{t.snapshotScopeSettings}</option>
                    </select>
                  </Field>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button icon="plus" onClick={createSnapshot} disabled={snapshotBusy}>
                    {t.snapshotCreate}
                  </Button>
                  <Button icon="refresh" onClick={() => loadSnapshots().catch((err) => setHubError(err instanceof Error ? err.message : String(err)))} disabled={snapshotBusy}>
                    {t.snapshotRefresh}
                  </Button>
                </div>
              </div>

              <div className="space-y-2 border-t border-line pt-5">
                <p className="text-xs font-semibold text-subtle">{t.snapshotStateTitle}</p>
                {snapshotNotice && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                    {snapshotNotice}
                  </div>
                )}
                {snapshots.length === 0 ? (
                  <p className="text-xs text-muted">{t.snapshotNoItems}</p>
                ) : (
                  <div className="space-y-2">
                    {snapshots.map((snapshot) => (
                      <div className="rounded-lg border border-line bg-surface-2 p-3" key={snapshot.id}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-fg">{snapshot.label || snapshot.id}</p>
                            <p className="text-[11px] text-subtle">
                              {new Date(snapshot.createdAt).toLocaleString()}
                              {snapshot.reason ? ` · ${snapshot.reason}` : ''}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone="neutral">{t[snapshotKindLabel[snapshot.kind]]}</Badge>
                            <Badge tone="info">{snapshot.scope}</Badge>
                            <Badge tone={snapshot.status === 'FAILED' ? 'danger' : snapshot.status === 'READY' ? 'success' : 'warning'}>
                              {t[snapshotStatusLabel[snapshot.status]]}
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                          <span>{t.snapshotSize}: {formatBytes(snapshot.sizeBytes)}</span>
                          <span>{t.snapshotVersion}: {snapshot.appVersion}</span>
                          <span className="mono min-w-0 truncate" title={String(snapshot.checksum || '')}>{t.snapshotChecksum}: {String(snapshot.checksum || '').slice(0, 12)}</span>
                          {snapshot.restoredAt && <span>{t.snapshotStatusRestored}: {new Date(snapshot.restoredAt).toLocaleString()}</span>}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            icon="history"
                            disabled={snapshotBusy || snapshot.status !== 'READY'}
                            onClick={() => openRestore(snapshot)}
                          >
                            {t.snapshotRestore}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            icon="trash"
                            disabled={snapshotBusy}
                            onClick={() => {
                              setHubError('');
                              setSnapshotModal({ kind: 'delete', snapshot });
                            }}
                          >
                            {t.snapshotDelete}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <SectionTitle title={t.quickLinks} subtitle={t.quickLinksSubtitle} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {QUICK_LINKS.map((link) => (
                <a className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-surface-2 p-3 transition hover:border-brand/40" href={link.href} key={link.href}>
                  <Icon name={link.icon} size={18} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{t[link.labelKey]}</span>
                  <Icon name="arrowUpRight" size={14} className="shrink-0" />
                </a>
              ))}
              {dnsMode === 'control' && (
                <a className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-surface-2 p-3 transition hover:border-brand/40" href="/dns">
                  <Icon name="network" size={18} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{t.dnsSection}</span>
                  <Icon name="arrowUpRight" size={14} className="shrink-0" />
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

      <SectionTitle
        title={t.updates}
        subtitle={t.updateCheckSubtitle}
        action={<Badge tone="neutral">{t.version}: {APP_VERSION}</Badge>}
      />
      <Card>
        <div className="space-y-5">
          <Toggle
            checked={settings.updateCheckEnabled}
            onChange={(updateCheckEnabled) => setSettings((prev) => ({ ...prev, updateCheckEnabled }))}
            label={t.updateCheck}
          />
          <div>
            <p className="mb-2 text-[11px] font-medium text-subtle">{t.updateChannel}</p>
            <Segmented
              value={settings.updateChannel}
              onChange={(value) => setSettings((prev) => ({ ...prev, updateChannel: value as 'stable' | 'dev' }))}
              options={[
                { value: 'stable', label: t.updateChannelStable },
                { value: 'dev', label: t.updateChannelDev },
              ]}
            />
          </div>

          {updateLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted">
              <Icon name="refresh" size={15} className="animate-spin text-brand" />{t.loading}
            </div>
          ) : !update ? (
            <p className="text-xs text-subtle">{t.updateSourceDisabled}</p>
          ) : (
            <div className="space-y-3 border-t border-line pt-4">
              <div className="flex flex-wrap items-center gap-2">
                {update.latestVersion && (
                  <Badge tone={update.updateAvailable ? 'warning' : 'success'} dot>
                    {update.updateAvailable ? `v${update.latestVersion}` : t.upToDate}
                  </Badge>
                )}
                {update.checkedAt && (
                  <span className="text-[11px] text-subtle">
                    {t.updateCheckedAt}: {new Date(update.checkedAt).toLocaleString()}
                  </span>
                )}
              </div>
              {update.updateAvailable && update.releaseUrl && (
                <a
                  href={update.releaseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                >
                  {t.updateNotes}
                  <Icon name="external" size={12} />
                </a>
              )}
              {update.error && <p className="text-[11px] text-warning">{update.error}</p>}
              {update.agents.outdated > 0 && (
                <p className="text-[11px] text-danger">{t.agentsOutdated.replace('{count}', String(update.agents.outdated))}</p>
              )}
              {update.apply.mode === 'manual' && <CodeBlock>{update.apply.command}</CodeBlock>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" icon="refresh" onClick={checkUpdate} loading={updateLoading}>
                  {t.checkNow}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon="download"
                  onClick={() => setUpdateOpen(true)}
                  disabled={!update.canApply || !update.updateAvailable}
                >
                  {t.updateNow}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

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

      <Modal
        open={snapshotModal !== null}
        onClose={() => setSnapshotModal(null)}
        title={
          snapshotModal?.kind === 'delete'
            ? t.snapshotDeleteConfirm
            : snapshotModal?.kind === 'plan'
              ? t.snapshotDryRunBadge
              : t.snapshotRestore
        }
        subtitle={snapshotModal ? snapshotModal.snapshot.label || snapshotModal.snapshot.id : undefined}
        icon={<Icon name={snapshotModal?.kind === 'delete' ? 'trash' : 'history'} size={16} />}
        footer={
          snapshotModal?.kind === 'plan' ? (
            <>
              <Button onClick={() => setSnapshotModal(null)} disabled={snapshotBusy}>{t.cancel}</Button>
              <Button variant="danger" icon="check" onClick={startRestore} loading={snapshotBusy}>
                {t.snapshotRestore}
              </Button>
            </>
          ) : snapshotModal?.kind === 'delete' ? (
            <>
              <Button onClick={() => setSnapshotModal(null)} disabled={snapshotBusy}>{t.cancel}</Button>
              <Button variant="danger" icon="trash" onClick={deleteSnapshot} loading={snapshotBusy}>
                {t.snapshotDelete}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setSnapshotModal(null)} disabled={snapshotBusy}>{t.cancel}</Button>
              <Button icon="check" onClick={startRestore} loading={snapshotBusy}>
                {t.snapshotDryRunBadge}
              </Button>
            </>
          )
        }
      >
        {snapshotModal?.kind === 'delete' && <p className="text-sm text-fg">{t.snapshotDeleteConfirm}</p>}
        {snapshotModal?.kind === 'restore' && (
          <div className="space-y-3 text-sm text-fg">
            <p>{t.snapshotRestoreConfirm}</p>
            {snapshotModal.snapshot.status === 'RESTORED' && (
              <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                {t.snapshotRestoredConfirm}
              </p>
            )}
            <p className="text-xs text-muted">{t.snapshotDryRunConfirm}</p>
          </div>
        )}
        {snapshotModal?.kind === 'plan' && (
          <div className="space-y-2 text-sm text-fg">
            <p>{t.snapshotRestoreConfirm}</p>
            <p className="text-xs text-muted">{t.snapshotComponents}: {SNAPSHOT_COMPONENTS.join(', ')}</p>
            <div className="mono max-h-48 overflow-auto rounded-lg border border-line bg-surface-2 p-3 text-xs text-muted">
              {JSON.stringify(snapshotModal.plan)}
            </div>
          </div>
        )}
      </Modal>

      {updateOpen && <UpdateDialog open onClose={() => setUpdateOpen(false)} status={update} />}
    </>
  );
}
