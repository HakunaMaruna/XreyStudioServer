'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { Icon } from '../../components/icons';
import {
  Badge, Button, Card, Field, HelpButton, IconButton, Modal, PageHeader, Toggle,
} from '../../components/ui';

type Recipe = { id: string; title: string; description: string; hosts: Record<string, unknown>; servers: unknown[]; options: Record<string, unknown> };
type Profile = {
  id: string; name: string; description: string | null; enabled: boolean; priority: number;
  hosts: Record<string, unknown> | null; servers: unknown[]; options: Record<string, unknown> | null;
  recipe: string | null; createdAt: string;
};
type Form = {
  name: string; description: string; enabled: boolean; priority: string; recipe: string;
  hostsText: string; serversText: string; optionsText: string;
};

const emptyForm = (): Form => ({
  name: '', description: '', enabled: false, priority: '0', recipe: '',
  hostsText: '{}', serversText: '["localhost"]', optionsText: '{"queryStrategy":"UseIP"}',
});

export default function DnsProfilesPage() {
  const { t, lang } = useLang();
  const [rows, setRows] = useState<Profile[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Profile[]>('/api/dns-profiles');
      setRows(Array.isArray(data) ? data : (data as any).data || []);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) { window.location.href = '/login'; return; }
    api.get<Recipe[]>('/api/dns-profiles/recipes/list')
      .then((data) => setRecipes(Array.isArray(data) ? data : (data as any).data || []))
      .catch(() => undefined);
    load();
  }, [load]);

  const chooseRecipe = (id: string) => {
    const recipe = recipes.find((item) => item.id === id);
    if (!recipe) return;
    setForm({
      ...form,
      recipe: id,
      name: recipe.title,
      description: recipe.description,
      hostsText: JSON.stringify(recipe.hosts, null, 2),
      serversText: JSON.stringify(recipe.servers, null, 2),
      optionsText: JSON.stringify(recipe.options, null, 2),
    });
    setError(''); setNotice('');
  };

  const startCreate = () => { setEditing(null); setForm(emptyForm()); setError(''); setNotice(''); setOpen(true); };
  const startEdit = (row: Profile) => {
    setEditing(row.id);
    setForm({
      name: row.name, description: row.description || '', enabled: row.enabled, priority: String(row.priority),
      recipe: row.recipe || '',
      hostsText: JSON.stringify(row.hosts || {}, null, 2),
      serversText: JSON.stringify(row.servers, null, 2),
      optionsText: JSON.stringify(row.options || {}, null, 2),
    });
    setError(''); setNotice(''); setOpen(true);
  };

  const parseForm = () => {
    let hosts: Record<string, unknown>;
    let servers: unknown[];
    let options: Record<string, unknown>;
    try { hosts = JSON.parse(form.hostsText); } catch { throw new Error(t.invalidJson); }
    try { servers = JSON.parse(form.serversText); } catch { throw new Error(t.invalidJson); }
    try { options = JSON.parse(form.optionsText); } catch { throw new Error(t.invalidJson); }
    return { hosts, servers, options };
  };

  const validate = async () => {
    setError(''); setNotice('');
    try {
      const payload = parseForm();
      const result = await api.post<{ valid: boolean; errors?: string[] }>('/api/dns-profiles/validate', { payload });
      if (result.valid) setNotice(t.dnsProfileValid);
      else setError(result.errors?.join('; ') || t.dnsProfileInvalid);
    } catch (e: any) { setError(e.message || t.invalidJson); }
  };

  const save = async () => {
    setBusy(true); setError('');
    try {
      const payload = { ...parseForm(), name: form.name, description: form.description || undefined,
        enabled: form.enabled, priority: Number(form.priority) || 0, recipe: form.recipe || undefined };
      if (editing) await api.patch(`/api/dns-profiles/${editing}`, payload);
      else await api.post('/api/dns-profiles', payload);
      setOpen(false);
      await load();
    } catch (e: any) { setError(e.message || t.invalidJson); } finally { setBusy(false); }
  };

  const toggle = async (row: Profile) => {
    try { await api.patch(`/api/dns-profiles/${row.id}`, { enabled: !row.enabled }); await load(); }
    catch (e: any) { setError(e.message); }
  };

  const remove = async (row: Profile) => {
    if (!window.confirm(`${t.delete}? ${row.name}`)) return;
    try { await api.delete(`/api/dns-profiles/${row.id}`); await load(); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <>
      <PageHeader
        eyebrow={t.infrastructure}
        title={t.dnsProfiles}
        subtitle={t.dnsProfilesSubtitle}
        icon="globe"
        actions={
          <>
            <HelpButton title={t.help}>
              <p>{lang === 'ru' ? 'DNS-профиль задаёт dns-блок конфига Xray: hosts и список серверов с доменами, ожидаемыми IP и режимом запросов. Включённые профили объединяются по приоритету.' : 'A DNS profile defines the Xray dns block: hosts and servers with domains, expected IPs and query strategy. Enabled profiles are merged by priority.'}</p>
              <p>{lang === 'ru' ? 'Поддерживаются UDP, tcp://, https:// (DoH), https+local://, tcp+local:// и quic+local://. geosite/geoip требуют geodata на ноде.' : 'UDP, tcp://, https:// (DoH), https+local://, tcp+local:// and quic+local:// are supported. geosite/geoip need geodata on the node.'}</p>
            </HelpButton>
            <Button icon="plus" variant="primary" onClick={startCreate}>{t.dnsProfileNew}</Button>
          </>
        }
      />

      {error && <div className="mb-4 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger"><Icon name="alert" size={15} />{error}</div>}
      {notice && <div className="mb-4 rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-xs text-success">{notice}</div>}

      {loading ? (
        <Card className="py-16 text-center text-xs text-muted">{t.loading}</Card>
      ) : !rows.length ? (
        <Card className="py-16 text-center text-xs text-subtle">{t.noData}</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => (
            <Card key={row.id} className="node-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl border border-brand/30 bg-brand/10 text-brand"><Icon name="globe" size={20} /></div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-fg">{row.name}</p>
                      <Badge tone={row.enabled ? 'success' : 'neutral'} dot>{row.enabled ? t.enabled : t.disabled}</Badge>
                      {row.recipe && <Badge tone="brand">{row.recipe}</Badge>}
                    </div>
                    <p className="mt-0.5 text-[10px] text-subtle">{row.description || row.id.slice(0, 12)} · {t.dnsProfilePriority}: {row.priority}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <IconButton icon="power" label={t.enabled} onClick={() => toggle(row)} />
                  <IconButton icon="edit" label={t.edit} onClick={() => startEdit(row)} />
                  <IconButton icon="trash" label={t.delete} tone="danger" onClick={() => remove(row)} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted">
                <span>{t.dnsProfileServers}: {row.servers?.length || 0}</span>
                <span>·</span>
                <span>hosts: {Object.keys(row.hosts || {}).length}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `${t.edit}: ${form.name}` : t.dnsProfileNew}
        subtitle={t.dnsProfilesSubtitle}
        icon={<Icon name="globe" size={16} />}
        size="xl"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{t.cancel}</Button>
            <Button icon="shield" onClick={validate}>{t.routingValidate}</Button>
            <Button variant="primary" icon="check" onClick={save} loading={busy}>{t.save}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t.routingRecipe}>
            <select className="field" value={form.recipe} onChange={(e) => chooseRecipe(e.target.value)}>
              <option value="">—</option>
              {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.title}</option>)}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t.name}><input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label={t.dnsProfilePriority}><input className="field" type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></Field>
            <Field label={t.enabled}><Toggle checked={form.enabled} onChange={(value) => setForm({ ...form, enabled: value })} /></Field>
          </div>
          <Field label={t.comment}><input className="field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid gap-4 lg:grid-cols-3">
            <Field label={t.dnsProfileHosts} hint="JSON">
              <textarea className="field mono min-h-40 text-[11px]" value={form.hostsText} onChange={(e) => setForm({ ...form, hostsText: e.target.value })} />
            </Field>
            <Field label={t.dnsProfileServers} hint="JSON">
              <textarea className="field mono min-h-40 text-[11px]" value={form.serversText} onChange={(e) => setForm({ ...form, serversText: e.target.value })} />
            </Field>
            <Field label={t.dnsProfileOptions} hint="JSON">
              <textarea className="field mono min-h-40 text-[11px]" value={form.optionsText} onChange={(e) => setForm({ ...form, optionsText: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>
    </>
  );
}
