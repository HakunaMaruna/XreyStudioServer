'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { Icon } from '../../components/icons';
import {
  Badge, Button, Card, Field, HelpButton, IconButton, Modal, PageHeader, SectionTitle, Segmented, Toggle,
} from '../../components/ui';

type Installed = {
  id: string; pluginId: string; version: string; status: string;
  manifest: { name?: string; description?: string; permissions?: string[]; settingsSchema?: { properties?: Record<string, any> } };
  settings: Record<string, unknown> | null; lastError: string | null; lastHealthAt: string | null;
};
type CatalogPlugin = {
  id: string; name: string; author: string; description: string; category: string;
  latestVersion: string | null; versionId?: string | null; manifest?: { permissions?: string[] }; iconUrl?: string | null; revoked?: boolean;
};
type Catalog = { plugins: CatalogPlugin[]; categories?: string[]; offline?: boolean; cached?: boolean; error?: string };
type Policy = { whitelist?: string[]; blacklist?: string[]; mandatory?: string[]; forcedUpdates?: string[] };
type Tab = 'installed' | 'catalog' | 'policy';

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
            <div className="grid gap-3 md:grid-cols-2">
              {catalog.plugins.map((plugin) => (
                <Card key={plugin.id} className="p-4">
                  <div className="flex items-center gap-3">
                    {plugin.iconUrl ? <img src={plugin.iconUrl} alt="" className="h-9 w-9 rounded-lg object-contain" /> : <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand/10 text-brand"><Icon name="box" size={17} /></div>}
                    <div><p className="text-sm font-semibold text-fg">{plugin.name}</p><p className="text-[10px] text-subtle">{plugin.author} · {plugin.latestVersion || '—'}</p></div>
                  </div>
                  <p className="mt-2 text-xs text-muted">{plugin.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">{(plugin.manifest?.permissions || []).map((p) => <Badge key={p} tone="brand">{p}</Badge>)}</div>
                  {plugin.revoked && <Badge tone="danger">revoked</Badge>}
                  <Button size="sm" variant="primary" icon="download" className="mt-3" disabled={!plugin.latestVersion || plugin.revoked || busy}
                    onClick={() => installFromCatalog(plugin)}>{t.pluginsInstall}</Button>
                </Card>
              ))}
            </div>
          )}
        </div>
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
