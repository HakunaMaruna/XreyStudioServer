'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { Icon } from '../../components/icons';
import {
  Badge, Button, Card, Field, HelpButton, IconButton, Modal, PageHeader,
  SectionTitle, Segmented, Toggle,
} from '../../components/ui';

type Settings = {
  brand: string; title: string; description: string; logoUrl: string; faviconUrl: string;
  accent: string; background: string; defaultTheme: string; customCss: string;
  blocks: Record<string, boolean>;
  support: { telegram: string; website: string; email: string };
  announcement: string; defaultLanguage: string;
};
type AppRow = {
  id: string; name: string; platform: string; iconUrl: string | null; downloadUrl: string | null;
  deepLinkTemplate: string | null; instructions: Record<string, string> | null;
  sortOrder: number; enabled: boolean;
};
type Tab = 'general' | 'apps' | 'preview';

const PLATFORMS = ['android', 'ios', 'windows', 'macos', 'linux', 'android-tv', 'all'];
const BLOCKS: Array<[keyof Settings['blocks'], string]> = [
  ['qr', 'QR'], ['traffic', 'traffic'], ['expiry', 'expiry'], ['apps', 'apps'],
  ['instructions', 'instructions'], ['support', 'support'],
];

const emptyApp = (): Partial<AppRow> => ({
  name: '', platform: 'android', iconUrl: '', downloadUrl: '',
  deepLinkTemplate: '', instructions: { ru: '', en: '' }, sortOrder: 100, enabled: true,
});

export default function SubscriptionPageAdmin() {
  const { t, lang } = useLang();
  const [tab, setTab] = useState<Tab>('general');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [appForm, setAppForm] = useState<Partial<AppRow>>(emptyApp());
  const [appOpen, setAppOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [settingsData, appsData] = await Promise.all([
        api.get<Settings>('/api/subscription-page/settings'),
        api.get<AppRow[]>('/api/subscription-page/apps'),
      ]);
      setSettings(settingsData);
      setApps(Array.isArray(appsData) ? appsData : (appsData as any).data || []);
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) { window.location.href = '/login'; return; }
    load();
  }, [load]);

  const saveSettings = async () => {
    if (!settings) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.patch<Settings>('/api/subscription-page/settings', settings);
      setSettings(result);
      setNotice(t.settingsSaved);
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const saveApp = async () => {
    setBusy(true); setError('');
    try {
      const payload = {
        ...appForm,
        instructions: {
          ru: String(appForm.instructions?.ru || ''),
          en: String(appForm.instructions?.en || ''),
        },
      };
      if (editing) await api.patch(`/api/subscription-page/apps/${editing}`, payload);
      else await api.post('/api/subscription-page/apps', payload);
      setAppOpen(false);
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const toggleApp = async (row: AppRow) => {
    try { await api.patch(`/api/subscription-page/apps/${row.id}`, { enabled: !row.enabled }); await load(); }
    catch (e: any) { setError(e.message); }
  };

  const removeApp = async (row: AppRow) => {
    if (!window.confirm(`${t.delete}? ${row.name}`)) return;
    try { await api.delete(`/api/subscription-page/apps/${row.id}`); await load(); }
    catch (e: any) { setError(e.message); }
  };

  const patch = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((current) => current ? { ...current, [key]: value } : current);

  return (
    <>
      <PageHeader
        eyebrow={t.billing}
        title={t.subAdmin}
        subtitle={t.subAdminSubtitle}
        icon="eye"
        actions={
          <>
            <HelpButton title={t.help}>
              <p>{lang === 'ru' ? 'Все настройки хранятся на сервере. Пользовательский текст экранируется, а свой CSS очищается от внешних импортов и URL.' : 'All settings are stored server-side. User text is escaped and custom CSS is sanitized against imports and URLs.'}</p>
            </HelpButton>
            <Button icon="check" variant="primary" onClick={saveSettings} loading={busy}>{t.save}</Button>
          </>
        }
      />

      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
          <Icon name="alert" size={15} />{error}
        </div>
      )}
      {notice && (
        <div role="status" aria-live="polite" className="mb-4 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs text-success">
          {notice}
        </div>
      )}

      <div className="mb-4">
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'general', label: t.subAdminGeneral, icon: 'settings' },
          { value: 'apps', label: t.subAdminApps, icon: 'list' },
          { value: 'preview', label: t.subAdminPreview, icon: 'eye' },
        ]} />
      </div>

      {tab === 'general' && settings && (
        <div className="space-y-4">
          <Card>
            <SectionTitle title={t.subAdmin} subtitle={t.subAdminSubtitle} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.name}><input className="field" value={settings.brand} onChange={(e) => patch('brand', e.target.value)} /></Field>
              <Field label={t.title}><input className="field" value={settings.title} onChange={(e) => patch('title', e.target.value)} /></Field>
              <Field label={t.description}><input className="field" value={settings.description} onChange={(e) => patch('description', e.target.value)} /></Field>
              <Field label="Logo URL"><input className="field" value={settings.logoUrl} onChange={(e) => patch('logoUrl', e.target.value)} /></Field>
              <Field label="Favicon URL"><input className="field" value={settings.faviconUrl} onChange={(e) => patch('faviconUrl', e.target.value)} /></Field>
              <Field label="Announcement"><input className="field" value={settings.announcement} onChange={(e) => patch('announcement', e.target.value)} /></Field>
              <Field label="Accent"><input type="color" className="field h-8 p-1" value={settings.accent} onChange={(e) => patch('accent', e.target.value)} /></Field>
              <Field label="Background"><input type="color" className="field h-8 p-1" value={settings.background || '#0d1117'} onChange={(e) => patch('background', e.target.value)} /></Field>
              <Field label={t.subAdminDefaultTheme}>
                <select className="field" value={settings.defaultTheme} onChange={(e) => patch('defaultTheme', e.target.value)}>
                  <option value="auto">auto</option><option value="dark">dark</option><option value="light">light</option>
                </select>
              </Field>
              <Field label={t.subAdminDefaultLanguage}>
                <select className="field" value={settings.defaultLanguage} onChange={(e) => patch('defaultLanguage', e.target.value)}>
                  <option value="ru">ru</option><option value="en">en</option>
                </select>
              </Field>
            </div>
            <Field label={t.subAdminCss}><textarea className="field mono mt-4 min-h-28 text-[11px]" value={settings.customCss} onChange={(e) => patch('customCss', e.target.value)} /></Field>
          </Card>

          <Card>
            <SectionTitle title={t.subAdminBlocks} />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {BLOCKS.map(([key, label]) => (
                <div
                  key={key}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/40 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-xs font-medium text-fg" title={label}>{label}</span>
                  <span className="shrink-0">
                    <Toggle checked={Boolean(settings.blocks[key])} onChange={(value) => patch('blocks', { ...settings.blocks, [key]: value })} />
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionTitle title={t.subAdminSupport} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Telegram"><input className="field" value={settings.support.telegram} onChange={(e) => patch('support', { ...settings.support, telegram: e.target.value })} /></Field>
              <Field label="Website"><input className="field" value={settings.support.website} onChange={(e) => patch('support', { ...settings.support, website: e.target.value })} /></Field>
              <Field label="Email"><input className="field" value={settings.support.email} onChange={(e) => patch('support', { ...settings.support, email: e.target.value })} /></Field>
            </div>
          </Card>
        </div>
      )}

      {tab === 'apps' && (
        <Card>
          <SectionTitle title={t.subAdminApps} action={<Button size="sm" icon="plus" variant="primary" onClick={() => { setEditing(null); setAppForm(emptyApp()); setAppOpen(true); }}>{t.subAdminAppNew}</Button>} />
          <div className="space-y-2">
            {apps.map((app) => (
              <div key={app.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-xs">
                <Badge tone="brand">{app.sortOrder}</Badge>
                <span className="font-medium text-fg">{app.name}</span>
                <Badge tone="neutral">{app.platform}</Badge>
                <span className="mono text-[10px] text-subtle">{app.deepLinkTemplate || '—'}</span>
                <div className="ml-auto flex gap-1">
                  <IconButton icon="power" label={t.enabled} onClick={() => toggleApp(app)} />
                  <IconButton icon="edit" label={t.edit} onClick={() => { setEditing(app.id); setAppForm({ ...app }); setAppOpen(true); }} />
                  <IconButton icon="trash" label={t.delete} tone="danger" onClick={() => removeApp(app)} />
                </div>
              </div>
            ))}
            {!apps.length && <p className="py-8 text-center text-xs text-subtle">{t.noData}</p>}
          </div>
        </Card>
      )}

      {tab === 'preview' && (
        <Card className="p-0">
          <iframe title={t.subAdminPreview} src="/sub/preview" className="h-[720px] w-full rounded-lg border-0" />
        </Card>
      )}

      <Modal open={appOpen} onClose={() => setAppOpen(false)} title={editing ? t.edit : t.subAdminAppNew} icon={<Icon name="list" size={16} />} size="lg"
        footer={<><Button onClick={() => setAppOpen(false)}>{t.cancel}</Button><Button variant="primary" icon="check" loading={busy} onClick={saveApp}>{t.save}</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.name}><input className="field" value={appForm.name || ''} onChange={(e) => setAppForm({ ...appForm, name: e.target.value })} /></Field>
          <Field label={t.subAdminPlatform}>
            <select className="field" value={appForm.platform} onChange={(e) => setAppForm({ ...appForm, platform: e.target.value })}>
              {PLATFORMS.map((platform) => <option key={platform}>{platform}</option>)}
            </select>
          </Field>
          <Field label={t.subAdminIconUrl}><input className="field" value={appForm.iconUrl || ''} onChange={(e) => setAppForm({ ...appForm, iconUrl: e.target.value })} /></Field>
          <Field label={t.subAdminDownloadUrl}><input className="field" value={appForm.downloadUrl || ''} onChange={(e) => setAppForm({ ...appForm, downloadUrl: e.target.value })} /></Field>
          <Field label={t.subAdminDeepLink}><input className="field mono text-[11px]" value={appForm.deepLinkTemplate || ''} onChange={(e) => setAppForm({ ...appForm, deepLinkTemplate: e.target.value })} /></Field>
          <Field label={t.subAdminSortOrder}><input className="field" type="number" value={appForm.sortOrder ?? 100} onChange={(e) => setAppForm({ ...appForm, sortOrder: Number(e.target.value) })} /></Field>
          <Field label={t.subAdminInstructionRu}><textarea className="field min-h-20" value={appForm.instructions?.ru || ''} onChange={(e) => setAppForm({ ...appForm, instructions: { ...(appForm.instructions || {}), ru: e.target.value } })} /></Field>
          <Field label={t.subAdminInstructionEn}><textarea className="field min-h-20" value={appForm.instructions?.en || ''} onChange={(e) => setAppForm({ ...appForm, instructions: { ...(appForm.instructions || {}), en: e.target.value } })} /></Field>
        </div>
      </Modal>
    </>
  );
}
