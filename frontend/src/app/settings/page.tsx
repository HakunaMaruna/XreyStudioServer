'use client';
import { useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { getTheme, applyTheme, type Theme } from '../../lib/theme';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, CodeBlock, PageHeader, SectionTitle, Segmented } from '../../components/ui';

export default function SettingsPage() {
  const { t, lang, toggle } = useLang();
  const [theme, setTheme] = useState<Theme>('dark');
  const [metrics, setMetrics] = useState('');
  const [metricsLoading, setMetricsLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    setTheme(getTheme());
    api.get('/api/metrics', { headers: { 'X-Metrics-Token': process.env.NEXT_PUBLIC_METRICS_TOKEN || '' } })
      .then((value) => setMetrics(String(value)))
      .catch(() => setMetrics(''))
      .finally(() => setMetricsLoading(false));
  }, []);

  const switchTheme = (value: Theme) => {
    setTheme(value);
    applyTheme(value);
  };

  return (
    <>
      <PageHeader
        eyebrow="System"
        title={t.settings}
        subtitle={t.settingsSubtitle}
        icon="settings"
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle title={t.appearance} subtitle={t.chooseAppearance} />
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle">{t.theme}</p>
              <Segmented
                value={theme}
                onChange={switchTheme}
                options={[
                  { value: 'dark', label: 'Dark', icon: 'moon' },
                  { value: 'light', label: 'Light', icon: 'sun' },
                ]}
              />
            </div>
            <div className="border-t border-line pt-5">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle">{t.language}</p>
              <div className="flex items-center gap-3">
                <Button icon="globe" onClick={toggle}>{lang === 'ru' ? 'Русский' : 'English'}</Button>
                <Badge tone="neutral">{t.current}: {lang.toUpperCase()}</Badge>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle title={t.panel} subtitle={t.buildRuntime} />
          <div className="space-y-3">
            {[
              { label: t.product, value: 'XreyStudioServer' },
              { label: t.version, value: '1.3.0' },
              { label: 'API', value: '/api' },
              { label: t.docs, value: '/docs' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-lg border border-line bg-surface-2/50 px-3 py-2.5 text-xs">
                <span className="text-muted">{row.label}</span>
                <span className="mono font-medium text-fg">{row.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <SectionTitle title={t.prometheusMetrics} subtitle={t.rawMetrics} action={<Badge tone="brand">/api/metrics</Badge>} />
        {metricsLoading ? (
          <div className="flex items-center gap-2 py-8 text-xs text-muted"><Icon name="refresh" size={15} className="animate-spin text-brand" />{t.loading}</div>
        ) : metrics ? (
          <CodeBlock className="max-h-[420px]">{metrics}</CodeBlock>
        ) : (
          <div className="py-8 text-center text-xs text-subtle">{t.metricsUnavailable}</div>
        )}
      </Card>
    </>
  );
}
