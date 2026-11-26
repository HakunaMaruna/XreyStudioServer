'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useLang } from '../../../lib/i18n';
import { APP_VERSION } from '../../../lib/version';
import { getBrowserHwid } from '../../../lib/hwid';
import { applyTheme, getTheme, type Theme } from '../../../lib/theme';
import { Icon } from '../../../components/icons';
import { Badge, Card, CodeBlock, IconButton, SectionTitle, cn, formatBytes } from '../../../components/ui';

type SubNode = { id: string; name: string; address: string };
type SubLink = { id: string; tag: string; protocol: string; link: string };
type PageSettings = {
  brand: string; title: string; description: string; logoUrl: string; faviconUrl: string;
  accent: string; background: string; defaultTheme: 'auto' | 'dark' | 'light'; customCss: string;
  blocks: Record<string, boolean>;
  support: { telegram: string; website: string; email: string };
  announcement: string; defaultLanguage: 'ru' | 'en';
};
type VpnApp = {
  id: string; name: string; platform: string; iconUrl: string | null; downloadUrl: string | null;
  deepLinkTemplate: string | null; instructions: Record<string, string> | null; sortOrder: number;
};
type SubTemplate = {
  title: string; description: string | null; accent: string;
  instructions: Record<string, string> | null; footer: string | null; pageSettings?: Record<string, unknown> | null;
};
type SubData = {
  status: string; expiresAt: string | null; trafficUsed: number; trafficLimit: number;
  nodes?: SubNode[]; links?: SubLink[]; template?: SubTemplate | null;
  page?: { settings: PageSettings; apps: VpnApp[] };
};

const formats = ['raw', 'base64', 'clash', 'singbox', 'json'];
const PLATFORM_LABELS: Record<string, { ru: string; en: string }> = {
  android: { ru: 'Android', en: 'Android' },
  ios: { ru: 'iOS', en: 'iOS' },
  windows: { ru: 'Windows', en: 'Windows' },
  macos: { ru: 'macOS', en: 'macOS' },
  linux: { ru: 'Linux', en: 'Linux' },
  'android-tv': { ru: 'Android TV', en: 'Android TV' },
  all: { ru: 'Все', en: 'All' },
};

function detectPlatform(): string {
  if (typeof navigator === 'undefined') return 'all';
  const ua = navigator.userAgent;
  if (/Android/i.test(ua) && /TV|SmartTV|Android TV/i.test(ua)) return 'android-tv';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
  if (/Linux/i.test(ua)) return 'linux';
  return 'all';
}

export default function SubscriptionPage() {
  const { t, lang, toggle: toggleLang } = useLang();
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SubData | null>(null);
  const [error, setError] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [format, setFormat] = useState('json');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [theme, setTheme] = useState<Theme>('dark');
  const [platform, setPlatform] = useState<string>('all');
  const [appFilter, setAppFilter] = useState<string>('featured');
  const [now, setNow] = useState(0);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  const isPreview = token === 'preview';

  useEffect(() => {
    setNow(Date.now());
    // countdown показывается с точностью до минуты — обновлять чаще не нужно
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('xss_theme') : null;
    const initial: Theme = stored === 'light' || stored === 'dark'
      ? stored
      : (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    setTheme(initial);
    applyTheme(initial);
    setPlatform(detectPlatform());
  }, []);

  useEffect(() => {
    const hwid = isPreview ? '' : getBrowserHwid();
    const query = hwid ? `&hwid=${encodeURIComponent(hwid)}` : '';
    const load = () => fetch(`${apiBase}/api/subscriptions/${token}?format=json${query}`)
      .then((r) => { if (!r.ok) throw new Error('failed'); return r.json(); })
      .then(setData);

    if (!hwid) {
      load().catch(() => setError(true));
      return;
    }
    fetch(`${apiBase}/api/devices/bind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, hwid, name: 'Browser' }),
    })
      .then((r) => {
        if (r.status === 429 || r.status === 403) {
          setLimitReached(true);
          throw new Error('limit');
        }
        return r;
      })
      .then(load)
      .catch(() => setError(true));
  }, [token, apiBase, isPreview]);

  const loadFormat = async (value: string) => {
    setFormat(value);
    if (isPreview) return;
    const hwid = getBrowserHwid();
    const query = hwid ? `&hwid=${encodeURIComponent(hwid)}` : '';
    const res = await fetch(`${apiBase}/api/subscriptions/${token}?format=${value}${query}`);
    setOutput(await res.text());
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyError(true);
      setTimeout(() => setCopyError(false), 2500);
    }
  };

  const switchTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  const settings = data?.page?.settings;
  const apps = data?.page?.apps || [];
  const blocks = settings?.blocks || {};
  const accent = settings?.accent || data?.template?.accent || 'var(--brand)';
  const style = {
    '--brand': accent,
    ...(settings?.background ? { '--app': settings.background } : {}),
  } as React.CSSProperties;

  const subscriptionUrl = useMemo(() => {
    const hwid = isPreview ? '' : getBrowserHwid();
    return `${apiBase}/api/subscriptions/${token}?format=base64${hwid ? `&hwid=${encodeURIComponent(hwid)}` : ''}`;
  }, [token, apiBase, isPreview]);

  const deepLink = (app: VpnApp) => app.deepLinkTemplate
    ? app.deepLinkTemplate.replace('{subscription_url}', encodeURIComponent(subscriptionUrl))
    : null;

  const visibleApps = useMemo(() => {
    if (appFilter === 'featured') {
      const matched = apps.filter((app) => app.platform === platform || app.platform === 'all');
      return matched.length ? matched : apps.filter((app) => app.platform === 'android' || app.platform === 'ios');
    }
    if (appFilter === 'all') return apps;
    return apps.filter((app) => app.platform === appFilter);
  }, [apps, appFilter, platform]);

  const platformTabs = useMemo(() => {
    const keys = Array.from(new Set(apps.map((app) => app.platform))).sort();
    return ['featured', 'all', ...keys];
  }, [apps]);

  if (error && !data) {
    return (
      <main className="grid min-h-screen place-items-center p-6" style={style}>
        <Card className="max-w-sm text-center">
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-lg border border-danger/25 bg-danger/10 text-danger">
            <Icon name="alert" size={20} />
          </div>
          <p className="text-sm font-medium text-fg">{limitReached ? t.deviceLimitReached : t.subscriptionUnavailable}</p>
          <p className="mt-1 text-xs text-muted">{t.linkInvalid}</p>
        </Card>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="grid min-h-screen place-items-center p-6" style={style}>
        <Card className="flex max-w-sm flex-col items-center gap-3 p-8 text-center">
          <Icon name="refresh" size={24} className="animate-spin text-brand" />
          <p className="text-sm text-muted">{t.subLoading}</p>
        </Card>
      </main>
    );
  }

  const active = data.status.toLowerCase() === 'active';
  const statusText = data.status === 'expired' ? t.subExpired
    : data.status === 'disabled' ? t.subDisabled
      : data.status === 'exceeded' ? t.subExceeded
        : data.status.toUpperCase();
  const used = Number(data.trafficUsed || 0);
  const limit = Number(data.trafficLimit || 0);
  const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const remaining = Math.max(0, limit - used);
  const expiryMs = data.expiresAt && now ? new Date(data.expiresAt).getTime() - now : 0;
  const countdown = expiryMs <= 0 ? '—' : expiryMs > 86_400_000
    ? `${Math.floor(expiryMs / 86_400_000)} ${t.subDaysLeft}`
    : expiryMs > 3_600_000
      ? `${Math.floor(expiryMs / 3_600_000)} ${t.subHoursLeft}`
      : `${Math.max(1, Math.floor(expiryMs / 60_000))} ${t.subMinutesLeft}`;
  const instructions = data.template?.instructions
    ? Object.entries(data.template.instructions).filter(([, text]) => typeof text === 'string' && text.trim())
    : [];

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {settings?.logoUrl ? (
          <img src={settings.logoUrl} alt={settings.brand || t.subscriptionPage} loading="lazy" decoding="async" className="h-11 w-11 rounded-lg object-contain" />
        ) : (
          <div className="grid h-11 w-11 place-items-center rounded-lg text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }}>
            <Icon name="zap" size={20} />
          </div>
        )}
        <div>
          <p className="text-base font-semibold text-fg">{settings?.title || data.template?.title || settings?.brand || 'XreyStudio'}</p>
          <p className="text-[11px] text-subtle">{settings?.description || data.template?.description || t.subscriptionPage}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => toggleLang()} aria-label={t.subLanguage}
          className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-muted transition hover:text-fg">
          {lang.toUpperCase()}
        </button>
        <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={t.subTheme} onClick={switchTheme} />
        <Badge tone={active ? 'success' : 'danger'} dot>{statusText}</Badge>
      </div>
    </div>
  );

  const supportBlock = blocks.support && (settings?.support?.telegram || settings?.support?.website || settings?.support?.email) ? (
    <Card>
      <SectionTitle title={t.subSupport} />
      <div className="flex flex-wrap gap-2">
        {settings.support.telegram && <a href={settings.support.telegram} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-fg hover:border-brand/40">Telegram</a>}
        {settings.support.website && <a href={settings.support.website} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-fg hover:border-brand/40">Website</a>}
        {settings.support.email && <a href={`mailto:${settings.support.email}`} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-fg hover:border-brand/40">{settings.support.email}</a>}
      </div>
    </Card>
  ) : null;

  if (!active) {
    return (
      <main className="relative mx-auto max-w-lg space-y-5 px-4 py-10 sm:px-6" style={style}>
        {settings?.customCss && <style>{settings.customCss}</style>}
        {header}
        <Card className="text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg border border-danger/25 bg-danger/10 text-danger">
            <Icon name="alert" size={22} />
          </div>
          <p className="text-base font-semibold text-fg">{statusText}</p>
          <p className="mt-2 text-xs text-muted">{t.linkInvalid}</p>
          {data.expiresAt && <p className="mt-3 text-xs text-subtle">{t.expiry}: {new Date(data.expiresAt).toLocaleDateString()}</p>}
        </Card>
        {supportBlock}
        <p className="pb-6 text-center text-[10px] text-subtle">{t.poweredBy} · v{APP_VERSION}</p>
      </main>
    );
  }

  return (
    <main className="relative mx-auto max-w-4xl space-y-5 px-4 py-8 sm:px-6" style={style}>
      {settings?.customCss && <style>{settings.customCss}</style>}
      {settings?.faviconUrl && <link rel="icon" href={settings.faviconUrl} />}
      {header}

      {settings?.announcement && (
        <div className="rounded-lg border border-brand/30 bg-brand/10 px-4 py-3 text-xs text-fg">{settings.announcement}</div>
      )}

      <Card className="overflow-hidden">
        <div className="grid gap-5 p-5 sm:grid-cols-3">
          <div>
            <p className="text-[11px] text-subtle">{t.status}</p>
            <p className={cn('mt-2 text-base font-semibold', active ? 'text-success' : 'text-danger')}>{statusText}</p>
          </div>
          {blocks.expiry !== false && (
            <div>
              <p className="text-[11px] text-subtle">{t.expiry}</p>
              <p className="mt-2 text-sm font-medium text-fg">{data.expiresAt ? new Date(data.expiresAt).toLocaleDateString() : '—'}</p>
              <p className="mt-1 text-[10px] text-brand">{countdown}</p>
            </div>
          )}
          {blocks.traffic !== false && (
            <div>
              <p className="text-[11px] text-subtle">{t.traffic}</p>
              <p className="mt-2 text-sm font-medium text-fg tabular-nums">{formatBytes(used)} <span className="text-subtle">/ {limit ? formatBytes(limit) : '∞'}</span></p>
              <p className="mt-1 text-[10px] text-subtle">{t.subRemaining}: {limit ? formatBytes(remaining) : '∞'}</p>
              {limit > 0 && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className={cn('h-full rounded-full transition-all', percent > 85 ? 'bg-danger' : 'bg-brand')} style={{ width: `${percent}%` }} />
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {blocks.qr !== false && (
        <Card>
          <SectionTitle title={t.qrCode} subtitle={t.scanClient} />
          <div className="flex flex-wrap items-center gap-5">
            <div className="rounded-lg border border-line bg-white p-3">
              <QRCodeSVG value={subscriptionUrl} size={136} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-2 text-[11px] text-subtle">{t.subscriptionUrl}</p>
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-2">
                <code className="mono min-w-0 flex-1 truncate text-[11px] text-muted">{subscriptionUrl}</code>
                <IconButton icon={copied ? 'check' : 'copy'} label={t.copy} tone={copied ? 'brand' : 'default'} onClick={() => copy(subscriptionUrl)} />
                {copyError && <span className="text-xs text-danger">{t.copyFailed}</span>}
              </div>
              <p className="mt-2 text-[11px] text-subtle">{t.keepPrivate}</p>
            </div>
          </div>
        </Card>
      )}

      {blocks.apps !== false && apps.length > 0 && (
        <Card>
          <SectionTitle title={t.subApps} subtitle={lang === 'ru' ? 'Подберите приложение под ваше устройство' : 'Pick an app for your device'} />
          <div className="mb-4 flex flex-wrap gap-2">
            {platformTabs.map((key) => (
              <button key={key} type="button" onClick={() => setAppFilter(key)}
                className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  appFilter === key ? 'border-brand/40 bg-brand-soft text-brand' : 'border-line bg-surface-2 text-muted hover:text-fg')}>
                {key === 'featured' ? t.subFeatured : key === 'all' ? t.subAllApps : (PLATFORM_LABELS[key]?.[lang] || key)}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {visibleApps.map((app) => {
              const link = deepLink(app);
              const instruction = app.instructions?.[lang] || app.instructions?.en || app.instructions?.ru;
              return (
                <div key={app.id} className="rounded-lg border border-line bg-surface-2/50 p-3">
                  <div className="flex items-center gap-3">
                    {app.iconUrl ? (
                      <img src={app.iconUrl} alt="" loading="lazy" decoding="async" className="h-9 w-9 rounded-lg object-contain" />
                    ) : (
                      <div className="grid h-9 w-9 place-items-center rounded-lg border border-brand/30 bg-brand/10 text-brand"><Icon name="download" size={17} /></div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-fg">{app.name}</p>
                      <p className="text-[10px] text-subtle">{PLATFORM_LABELS[app.platform]?.[lang] || app.platform}</p>
                    </div>
                    {app.downloadUrl && (
                      <a href={app.downloadUrl} target="_blank" rel="noreferrer" aria-label={t.subDownload}
                        className="text-muted transition hover:text-brand"><Icon name="external" size={16} /></a>
                    )}
                  </div>
                  {instruction && <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-muted">{instruction}</p>}
                  {link && (
                    <a href={link} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-brand/40 bg-brand-soft px-3 py-2 text-xs font-medium text-brand transition hover:brightness-110">
                      <Icon name="zap" size={14} /> {t.subAddInOneClick}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {blocks.instructions !== false && instructions.length > 0 && (
        <Card>
          <SectionTitle title={t.instructions} subtitle={data.template?.description || undefined} />
          <div className="grid gap-3 sm:grid-cols-2">
            {instructions.map(([name, text]) => (
              <div key={name} className="rounded-lg border border-line bg-surface-2/50 p-3">
                <p className="mb-1 text-xs font-semibold" style={{ color: accent }}>{name}</p>
                <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted">{text}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle title={t.availableFormats} subtitle={lang === 'ru' ? 'Выберите формат для вашего клиента' : 'Choose a config format for your client'} />
          <div className="flex flex-wrap gap-2">
            {formats.map((item) => (
              <button key={item} type="button" onClick={() => loadFormat(item)}
                className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  format === item ? 'border-brand/40 bg-brand-soft text-brand' : 'border-line bg-surface-2 text-muted hover:text-fg')}>
                {item.toUpperCase()}
              </button>
            ))}
          </div>
          {output && <CodeBlock className="mt-4">{output}</CodeBlock>}
        </Card>

        <Card>
          <SectionTitle title={t.connections} subtitle={t.locationsSubtitle} />
          {data.nodes?.length ? (
            <div className="space-y-2">
              {data.nodes.map((node) => (
                <div key={node.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2/50 p-3">
                  <div className="grid h-8 w-8 place-items-center rounded-lg border border-cyan/25 bg-cyan/10 text-cyan"><Icon name="server" size={15} /></div>
                  <div><p className="text-xs font-medium text-fg">{node.name}</p><p className="mono text-[10px] text-subtle">{node.address}</p></div>
                </div>
              ))}
            </div>
          ) : <p className="py-8 text-center text-xs text-subtle">{t.noNodesAssigned}</p>}
        </Card>
      </div>

      {data.links?.length ? (
        <Card>
          <SectionTitle title={t.links} subtitle={t.individualLinks} />
          <div className="space-y-2">
            {data.links.map((link) => (
              <div key={link.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2/50 p-3">
                <Badge tone="brand">{link.protocol.toUpperCase()}</Badge>
                <span className="text-xs font-medium text-fg">{link.tag}</span>
                <code className="mono ml-auto min-w-0 max-w-[60%] truncate text-[10px] text-subtle">{link.link}</code>
                <IconButton icon="copy" label={t.copy} onClick={() => copy(link.link)} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {supportBlock}
      {data.template?.footer && <p className="text-center text-xs text-muted">{data.template.footer}</p>}
      <p className="pb-6 text-center text-[10px] text-subtle">{t.poweredBy} · v{APP_VERSION}</p>
    </main>
  );
}
