'use client';
import { useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { getTheme, applyTheme, type Theme } from '../../lib/theme';
import { APP_VERSION } from '../../lib/version';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, CodeBlock, Field, PageHeader, SectionTitle, Segmented, Toggle } from '../../components/ui';

type PanelSettings = {
  language: 'ru' | 'en';
  theme: 'dark' | 'light';
  alertsEnabled: boolean;
  notifyOnNodeOffline: boolean;
  notifyOnBackup: boolean;
  metricsEnabled: boolean;
  rateLimit: number;
  corsOrigin: string;
  sessionMinutes: number;
};

const DEFAULT_SETTINGS: PanelSettings = {
  language: 'ru',
  theme: 'dark',
  alertsEnabled: true,
  notifyOnNodeOffline: true,
  notifyOnBackup: false,
  metricsEnabled: true,
  rateLimit: 120,
  corsOrigin: '*',
  sessionMinutes: 15,
};

export default function SettingsPage() {
  const { t, lang, toggle } = useLang();
  const [theme, setTheme] = useState<Theme>('dark');
  const [settings, setSettings] = useState<PanelSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [metrics, setMetrics] = useState('');
  const [metricsLoading, setMetricsLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    setTheme(getTheme());
    api.get('/api/settings')
      .then((value) => setSettings({ ...DEFAULT_SETTINGS, ...value }))
      .catch(() => undefined)
      .finally(() => setSettingsLoading(false));
    api.get('/api/metrics/view')
      .then((value) => setMetrics(String(value)))
      .catch(() => setMetrics(''))
      .finally(() => setMetricsLoading(false));
  }, []);

  const switchTheme = (value: Theme) => {
    setTheme(value);
    applyTheme(value);
    setSettings({ ...settings, theme: value });
  };

  const save = async () => {
    setSaving(true);
    setNotice('');
    try {
      const updated = await api.patch('/api/settings', settings);
      setSettings({ ...DEFAULT_SETTINGS, ...updated });
      if (updated.language !== lang) toggle();
      setNotice(t.save);
      setTimeout(() => setNotice(''), 2000);
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="System"
        title={t.settings}
        subtitle={t.settingsSubtitle}
        icon="settings"
        actions={<Button icon="check" variant="primary" onClick={save} loading={saving}>{t.save}</Button>}
      />

      {notice && (
        <div className="mb-5 rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-xs text-success">{notice}</div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle title={t.appearance} subtitle={t.chooseAppearance} />
          {settingsLoading ? (
            <p className="text-xs text-muted">{t.loading}</p>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle">{t.theme}</p>
                <Segmented
                  value={settings.theme}
                  onChange={(value) => switchTheme(value as Theme)}
                  options={[
                    { value: 'dark', label: 'Dark', icon: 'moon' },
                    { value: 'light', label: 'Light', icon: 'sun' },
                  ]}
                />
              </div>
              <div className="border-t border-line pt-5">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle">{t.language}</p>
                <Segmented
                  value={settings.language}
                  onChange={(value) => setSettings({ ...settings, language: value as 'ru' | 'en' })}
                  options={[
                    { value: 'ru', label: 'Русский' },
                    { value: 'en', label: 'English' },
                  ]}
                />
              </div>
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle title={t.notifications} subtitle={t.notificationsSubtitle ?? ''} />
          <div className="space-y-3">
            <Toggle checked={settings.alertsEnabled} onChange={(v) => setSettings({ ...settings, alertsEnabled: v })} label={t.alerts} />
            <Toggle checked={settings.notifyOnNodeOffline} onChange={(v) => setSettings({ ...settings, notifyOnNodeOffline: v })} label={t.offline} />
            <Toggle checked={settings.notifyOnBackup} onChange={(v) => setSettings({ ...settings, notifyOnBackup: v })} label={t.backups} />
            <Toggle checked={settings.metricsEnabled} onChange={(v) => setSettings({ ...settings, metricsEnabled: v })} label={t.prometheusMetrics} />
          </div>
        </Card>

        <Card>
          <SectionTitle title={t.panel} subtitle={t.buildRuntime} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t.rateLimit}><input type="number" min={1} value={settings.rateLimit} onChange={(e) => setSettings({ ...settings, rateLimit: Number(e.target.value) })} className="field" /></Field>
            <Field label={t.sessionMinutes}><input type="number" min={1} value={settings.sessionMinutes} onChange={(e) => setSettings({ ...settings, sessionMinutes: Number(e.target.value) })} className="field" /></Field>
            <Field label="CORS"><input value={settings.corsOrigin} onChange={(e) => setSettings({ ...settings, corsOrigin: e.target.value })} className="field" /></Field>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4 text-xs text-muted">
            <Badge tone="neutral">{t.version}: {APP_VERSION}</Badge>
            <Badge tone="neutral">API: /api</Badge>
            <Badge tone="neutral">Docs: /docs</Badge>
          </div>
        </Card>

        <Card>
          <SectionTitle title={t.prometheusMetrics} subtitle={t.rawMetrics} action={<Badge tone="brand">/api/metrics</Badge>} />
          {metricsLoading ? (
            <div className="flex items-center gap-2 py-8 text-xs text-muted"><Icon name="refresh" size={15} className="animate-spin text-brand" />{t.loading}</div>
          ) : metrics ? (
            <CodeBlock className="max-h-[320px]">{metrics}</CodeBlock>
          ) : (
            <div className="py-8 text-center text-xs text-subtle">{t.noData}</div>
          )}
        </Card>
      </div>
    </>
  );
}
