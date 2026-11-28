// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { Icon } from '../../components/icons';
import {
  Badge, Button, Card, Field, HelpButton, IconButton, Modal, PageHeader, SectionTitle, Segmented, Toggle, cn,
} from '../../components/ui';

type Installed = {
  id: string; pluginId: string; version: string; status: string;
  manifest: { name?: string; description?: string; permissions?: string[]; settingsSchema?: { properties?: Record<string, any> } };
  settings: Record<string, unknown> | null; lastError: string | null; lastHealthAt: string | null;
};
type CatalogPlugin = {
  id: string; name: string; author: string; description: string; category: string;
  latestVersion: string | null; versionId?: string | null; manifest?: { permissions?: string[] }; iconUrl?: string | null;
  revoked?: boolean; tags?: string[]; authorUrl?: string | null;
};
type Catalog = { plugins: CatalogPlugin[]; categories?: string[]; offline?: boolean; cached?: boolean; error?: string };
type Policy = { whitelist?: string[]; blacklist?: string[]; mandatory?: string[]; forcedUpdates?: string[] };
type Tab = 'installed' | 'catalog' | 'policy' | 'publish' | 'reviews';

export default function PluginsPage() {
  const { t, lang } = useLang();
  const [tab, setTab] = useState<Tab>('installed');
  const [rows, setRows] = useState<Installed[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [policy, setPolicy] = useState<Policy>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [settingsFor, setSettingsFor] = useState<Installed | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, unknown>>({});
  const [logsFor, setLogsFor] = useState<string | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
  const [publishPkg, setPublishPkg] = useState<any>(null);
  const [publishFindings, setPublishFindings] = useState<any[]>([]);
  const [reviewRows, setReviewRows] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  const load = useCallback(async () => {
    setError('');
    try {
      const [installed, catalogData, policyData] = await Promise.all([
        api.get<Installed[]>('/api/plugins'),
        api.get<Catalog>('/api/plugins/catalog').catch(() => ({ plugins: [], offline: true })),
        api.get<Policy>('/api/plugins/policy').catch(() => ({})),
      ]);
      setRows(installed);
      setCatalog(catalogData);
      setPolicy(policyData);
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) { window.location.href = '/login'; return; }
    load();
  }, [load]);

  useEffect(() => {
    if (tab === 'reviews') {
      api.get<any[]>('/api/plugins/reviews').then((rows) => setReviewRows(Array.isArray(rows) ? rows : (rows as any).data || [])).catch(() => setReviewRows([]));
    }
  }, [tab]);

  const action = async (id: string, name: string, payload: Record<string, unknown> = {}) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.post(`/api/plugins/${encodeURIComponent(id)}/${name}`, payload);
      setNotice(JSON.stringify(result).slice(0, 200));
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const installFromCatalog = async (plugin: CatalogPlugin) => {
    if (!plugin.versionId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const pkg = await api.post(`/api/plugins/download/${encodeURIComponent(plugin.versionId)}`, {});
      await api.post('/api/plugins/install', { pkg });
      setNotice(`${plugin.name}: ${t.pluginsInstall}`);
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const openSettings = async (row: Installed) => {
    setSettingsFor(row);
    try { setSettingsDraft(await api.get(`/api/plugins/${encodeURIComponent(row.pluginId)}/settings`)); }
    catch { setSettingsDraft({}); }
  };

  const saveSettings = async () => {
    if (!settingsFor) return;
    setBusy(true); setError('');
    try {
      await api.patch(`/api/plugins/${encodeURIComponent(settingsFor.pluginId)}/settings`, settingsDraft);
      setSettingsFor(null);
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const openLogs = async (id: string) => {
    setLogsFor(id);
    try { setLogs(await api.get(`/api/plugins/${encodeURIComponent(id)}/logs`)); }
    catch (e: any) { setError(e.message); }
  };

  const savePolicy = async () => {
    setBusy(true); setError('');
    try {
      await api.patch('/api/plugins/policy', policy);
      setNotice(t.settingsSaved);
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const readPackage = async (file: File | undefined) => {
    if (!file) return;
    setError(''); setNotice(''); setPublishFindings([]);
    try {
      const pkg = JSON.parse(await file.text());
      setPublishPkg(pkg);
      const result: any = await api.post('/api/plugins/review', { pkg });
      setPublishFindings(result.findings || []);
    } catch (e: any) { setError(e.message); setPublishPkg(null); }
  };

  const submitPackage = async () => {
    if (!publishPkg) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result: any = await api.post('/api/plugins/publish', { pkg: publishPkg });
      setNotice(`${lang === 'ru' ? 'Отправлено на модерацию' : 'Submitted for review'}: ${result.pluginId} v${result.version}`);
      setPublishPkg(null); setPublishFindings([]);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const decide = async (id: string, status: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await api.post(`/api/plugins/reviews/${id}/decide`, { status });
      setNotice(`${id}: ${status}`);
      setReviewRows(await api.get<any[]>('/api/plugins/reviews'));
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const listField = (value: string | undefined) => value ? value.split(',').map((v) => v.trim()).filter(Boolean) : [];

  return (
    <>
      <PageHeader eyebrow={t.system} title={t.plugins} subtitle={t.pluginsSubtitle} icon="box"
        actions={<><HelpButton title={t.help}>
          <p>{lang === 'ru' ? 'Плагины исполняются в отдельном воркере с лимитами, без доступа к БД ядра и окружению. Все действия аудируются и предваряются снимком.' : 'Plugins run in a limited worker without core DB or env access. All actions are audited and preceded by a snapshot.'}</p>
        </HelpButton><Button icon="refresh" size="sm" onClick={load}>{t.refresh}</Button></>} />
      {error && <div className="mb-4 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
      {notice && <div className="mb-4 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs text-success">{notice}</div>}
      <div className="mb-4"><Segmented value={tab} onChange={setTab} options={[
        { value: 'installed', label: t.pluginsInstalled, icon: 'box' },
        { value: 'catalog', label: t.pluginsCatalog, icon: 'globe' },
        { value: 'policy', label: t.pluginsPolicy, icon: 'shield' },
        { value: 'publish', label: lang === 'ru' ? 'Загрузка' : 'Upload', icon: 'upload' },
        { value: 'reviews', label: lang === 'ru' ? 'Модерация' : 'Review', icon: 'checkCircle' },
      ]} /></div>

      {tab === 'installed' && (
        !rows.length ? <Card className="py-16 text-center text-xs text-subtle">{t.noData}</Card> : (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((row) => (
              <Card key={row.id} className="node-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-fg">{row.manifest?.name || row.pluginId}</p>
                    <p className="mono text-[10px] text-subtle">{row.pluginId} · v{row.version}</p>
                  </div>
                  <Badge tone={row.status === 'ENABLED' ? 'success' : row.status === 'QUARANTINED' ? 'danger' : 'neutral'} dot>{row.status}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted">{row.manifest?.description || '—'}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(row.manifest?.permissions || []).map((permission) => <Badge key={permission} tone="brand">{permission}</Badge>)}
                </div>
                {row.lastError && <p className="mt-2 text-[11px] text-danger">{row.lastError}</p>}
                <div className="mt-3 flex flex-wrap gap-1">
                  <Button size="sm" icon="check" onClick={() => action(row.pluginId, 'enable')} loading={busy}>{t.pluginsEnable}</Button>
                  <Button size="sm" variant="subtle" onClick={() => action(row.pluginId, 'disable')} loading={busy}>{t.pluginsDisable}</Button>
                  <Button size="sm" variant="subtle" icon="activity" onClick={() => action(row.pluginId, 'health')} loading={busy}>{t.pluginsHealth}</Button>
                  <Button size="sm" variant="subtle" icon="sliders" onClick={() => openSettings(row)}>{t.pluginsSettings}</Button>
                  <Button size="sm" variant="subtle" icon="file" onClick={() => openLogs(row.pluginId)}>{t.pluginsLogs}</Button>
                  <Button size="sm" variant="danger" icon="trash" onClick={() => {
                    setBusy(true); setError('');
                    api.delete(`/api/plugins/${encodeURIComponent(row.pluginId)}`)
                      .then(() => load()).catch((e: any) => setError(e.message)).finally(() => setBusy(false));
                  }} loading={busy}>{t.pluginsUninstall}</Button>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {tab === 'catalog' && (
        <div className="space-y-3">
          {catalog?.offline && <div className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">{t.pluginsOffline}</div>}
          {!catalog?.plugins.length ? <Card className="py-16 text-center text-xs text-subtle">{t.noData}</Card> : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
              {catalog.plugins.map((plugin) => {
                const installed = rows.find((row) => row.pluginId === plugin.id);
                const ours = ['XreyStudio', 'XreyStudioServer', 'DEV XSS'].includes(plugin.author);
                const authorUrl = plugin.authorUrl || (ours ? 'https://t.me/matatadmitry' : null);
                const tags = (plugin.tags?.length ? plugin.tags : [plugin.category, ...(plugin.manifest?.permissions || [])]).filter(Boolean) as string[];
                const expanded = Boolean(expandedDescriptions[plugin.id]);
                const longDescription = plugin.description.length > 100;
                return (
                  <Card key={plugin.id} className="flex min-w-0 flex-col p-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      {plugin.iconUrl ? (
                        <img src={plugin.iconUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
                      ) : (
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-sm font-bold text-brand">
                          {plugin.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <p className="truncate text-[13px] font-semibold text-fg">{plugin.name}</p>
                          {plugin.revoked && <Badge tone="danger">revoked</Badge>}
                        </div>
                        <div className="flex min-w-0 items-center gap-1.5 text-[10px]">
                          <span className={cn('truncate', ours ? 'font-semibold text-success' : 'text-subtle')}>{plugin.author}</span>
                          {authorUrl && <a href={authorUrl} target="_blank" rel="noopener noreferrer" title={t.pluginAuthorTelegram} className="shrink-0 text-brand hover:underline"><Icon name="external" size={11} /></a>}
                          <span className="shrink-0 text-subtle">· {plugin.latestVersion || '—'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {tags.slice(0, 5).map((tag) => <Badge key={tag} tone="brand">{tag}</Badge>)}
                      {tags.length > 5 && <Badge tone="neutral">+{tags.length - 5}</Badge>}
                    </div>
                    <p className={cn('mt-2 text-[11px] leading-relaxed text-muted', !expanded && 'line-clamp-3')}>{plugin.description}</p>
                    {longDescription && (
                      <button type="button" className="mt-1 self-start text-[10px] font-medium text-brand hover:underline"
                        onClick={() => setExpandedDescriptions((prev) => ({ ...prev, [plugin.id]: !expanded }))}>
                        {expanded ? t.hideExtraFields : t.pluginExpand}
                      </button>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                      <Badge tone="neutral">{plugin.category || 'plugin'}</Badge>
                      {installed ? (
                        <Button size="sm" variant="subtle" icon="sliders" disabled={busy} onClick={() => openSettings(installed)}>{t.pluginOpen}</Button>
                      ) : (
                        <Button size="sm" variant="primary" icon="download" disabled={!plugin.latestVersion || plugin.revoked || busy}
                          onClick={() => installFromCatalog(plugin)}>{t.pluginsInstall}</Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'publish' && (
        <div className="space-y-4">
          <Card className="p-4">
            <SectionTitle title={lang === 'ru' ? 'Загрузка плагина' : 'Upload a plugin'}
              subtitle={lang === 'ru' ? 'Пакет .plugin.json проверяется, подписывается и уходит на модерацию' : 'A .plugin.json package is validated, signed and sent for review'} />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-xs text-muted hover:border-brand hover:text-brand">
                <Icon name="upload" size={14} /> {lang === 'ru' ? 'Выбрать .plugin.json' : 'Choose .plugin.json'}
                <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => readPackage(e.target.files?.[0])} />
              </label>
              {publishPkg && <Badge tone="brand">{publishPkg.manifest?.id} · v{publishPkg.manifest?.version}</Badge>}
            </div>
            {publishFindings.length > 0 && (
              <div className="mt-3 space-y-1">
                {publishFindings.map((finding, index) => (
                  <div key={index} className={`rounded-lg border px-3 py-2 text-[11px] ${finding.level === 'blocking' ? 'border-danger/30 bg-danger/10 text-danger' : finding.level === 'warning' ? 'border-warning/30 bg-warning/10 text-warning' : 'border-line bg-surface-2/40 text-muted'}`}>
                    <span className="mono mr-2">{finding.code}</span>{finding.message}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <Button variant="primary" icon="check" loading={busy} disabled={!publishPkg || publishFindings.some((f) => f.level === 'blocking')} onClick={submitPackage}>
                {lang === 'ru' ? 'Отправить на модерацию' : 'Submit for review'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {tab === 'reviews' && (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <h2 className="text-[13px] font-semibold text-fg">{lang === 'ru' ? 'Заявки на публикацию' : 'Publication requests'}</h2>
            <Badge tone="neutral">{reviewRows.length}</Badge>
          </div>
          {!reviewRows.length ? <p className="p-6 text-center text-xs text-subtle">{t.noData}</p> : (
            <div className="divide-y divide-line/40">
              {reviewRows.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[11px]">
                  <span className="font-medium text-fg">{row.pluginId}</span>
                  <Badge tone="brand">v{row.version}</Badge>
                  <span className="text-subtle">{row.developer}</span>
                  <Badge tone={row.status === 'APPROVED' ? 'success' : row.status === 'REJECTED' ? 'danger' : 'warning'}>{row.status}</Badge>
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="subtle" icon="check" disabled={busy || row.status === 'APPROVED'} onClick={() => decide(row.id, 'APPROVED')}>{lang === 'ru' ? 'Одобрить' : 'Approve'}</Button>
                    <Button size="sm" variant="danger" icon="xCircle" disabled={busy || row.status === 'REJECTED'} onClick={() => decide(row.id, 'REJECTED')}>{lang === 'ru' ? 'Отклонить' : 'Reject'}</Button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'policy' && (
        <Card>
          <SectionTitle title={t.pluginsPolicy} subtitle={lang === 'ru' ? 'Списки через запятую' : 'Comma-separated lists'} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Whitelist"><textarea className="field min-h-24 text-[11px]" value={(policy.whitelist || []).join(', ')} onChange={(e) => setPolicy({ ...policy, whitelist: listField(e.target.value) })} /></Field>
            <Field label="Blacklist"><textarea className="field min-h-24 text-[11px]" value={(policy.blacklist || []).join(', ')} onChange={(e) => setPolicy({ ...policy, blacklist: listField(e.target.value) })} /></Field>
            <Field label="Mandatory"><textarea className="field min-h-24 text-[11px]" value={(policy.mandatory || []).join(', ')} onChange={(e) => setPolicy({ ...policy, mandatory: listField(e.target.value) })} /></Field>
            <Field label="Forced updates"><textarea className="field min-h-24 text-[11px]" value={(policy.forcedUpdates || []).join(', ')} onChange={(e) => setPolicy({ ...policy, forcedUpdates: listField(e.target.value) })} /></Field>
          </div>
          <div className="mt-4 flex justify-end"><Button variant="primary" icon="check" loading={busy} onClick={savePolicy}>{t.save}</Button></div>
        </Card>
      )}

      <Modal open={Boolean(settingsFor)} onClose={() => setSettingsFor(null)} title={t.pluginsSettings} icon={<Icon name="sliders" size={16} />}
        footer={<><Button onClick={() => setSettingsFor(null)}>{t.cancel}</Button><Button variant="primary" icon="check" loading={busy} onClick={saveSettings}>{t.save}</Button></>}>
        {Object.entries(settingsFor?.manifest?.settingsSchema?.properties || {}).map(([key, schema]: [string, any]) => (
          <div key={key} className="mb-3">
            {schema.type === 'boolean' ? (
              <Field label={schema.title || key}>
                <Toggle checked={Boolean(settingsDraft[key])} onChange={(value) => setSettingsDraft({ ...settingsDraft, [key]: value })} />
              </Field>
            ) : (
              <Field label={schema.title || key}>
                <input className="field" type={schema.type === 'number' ? 'number' : 'text'}
                  value={String(settingsDraft[key] ?? '')}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, [key]: schema.type === 'number' ? Number(e.target.value) : e.target.value })} />
              </Field>
            )}
          </div>
        ))}
      </Modal>

      <Modal open={Boolean(logsFor)} onClose={() => setLogsFor(null)} title={`${t.pluginsLogs}: ${logsFor}`} icon={<Icon name="file" size={16} />} size="lg">
        <div className="max-h-96 space-y-1 overflow-auto">
          {logs.map((entry) => <div key={entry.id} className="rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-[11px]">
            <span className="mono text-subtle">{new Date(entry.createdAt).toLocaleString()}</span>{' '}
            <Badge tone={entry.level === 'error' ? 'danger' : 'neutral'}>{entry.level}</Badge>{' '}
            <span className="text-muted">{entry.message}</span>
          </div>)}
        </div>
      </Modal>
    </>
  );
}
