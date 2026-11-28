// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { Icon } from '../../components/icons';
import {
  Alert, Badge, Button, Card, CodeBlock, Field, HelpButton, IconButton, Modal,
  PageHeader, SectionTitle, StatusBadge,
} from '../../components/ui';

type MemberForm = {
  id?: string;
  protocol: string;
  address: string;
  port: string;
  uuid: string;
  password: string;
  method: string;
  security: string;
  transport: string;
  sni: string;
  path: string;
  publicKey: string;
  shortId: string;
  flow: string;
  enabled: boolean;
};

type BalancerRow = {
  id: string;
  name: string;
  strategy: string;
  enabled: boolean;
  fallbackTag: string;
  probeUrl: string;
  probeIntervalSec: number;
  observatoryMode: string;
  burstDestination: string;
  burstIntervalSec: number;
  burstSampling: number;
  burstTimeoutSec: number;
  rule: Record<string, unknown> | null;
  members: Array<{
    id: string;
    protocol: string;
    enabled: boolean;
    config: { settings?: Record<string, any>; streamSettings?: Record<string, any> };
  }>;
};

type FormState = {
  name: string;
  strategy: string;
  enabled: boolean;
  fallbackTag: string;
  probeUrl: string;
  probeIntervalSec: string;
  observatoryMode: string;
  burstDestination: string;
  burstIntervalSec: string;
  burstSampling: string;
  burstTimeoutSec: string;
  domains: string;
  ips: string;
  port: string;
  network: string;
  members: MemberForm[];
};

const STRATEGIES = ['random', 'roundRobin', 'leastPing', 'leastLoad'];
const PROTECTED_PROTOCOLS = ['vless', 'vmess', 'trojan', 'shadowsocks', 'freedom', 'socks', 'http'];

const emptyMember = (): MemberForm => ({
  protocol: 'vless', address: '', port: '443', uuid: '', password: '',
  method: 'aes-256-gcm', security: 'none', transport: 'tcp', sni: '', path: '', publicKey: '', shortId: '', flow: '', enabled: true,
});

const emptyForm = (): FormState => ({
  name: '', strategy: 'roundRobin', enabled: false, fallbackTag: 'direct',
  probeUrl: 'https://www.google.com/generate_204', probeIntervalSec: '30',
  observatoryMode: 'observatory',
  burstDestination: 'https://connectivitycheck.gstatic.com/generate_204',
  burstIntervalSec: '60', burstSampling: '10', burstTimeoutSec: '5',
  domains: '', ips: '', port: '', network: '', members: [emptyMember()],
});

const splitList = (value: string) => value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);

export default function BalancersPage() {
  const { t, lang } = useLang();
  const [rows, setRows] = useState<BalancerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [notice, setNotice] = useState('');
  const [recipes, setRecipes] = useState<Array<{ id: string; name: string; description: string; payload: any }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<BalancerRow[]>('/api/balancers');
      setRows(Array.isArray(data) ? data : (data as any).data || []);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) { window.location.href = '/login'; return; }
    load();
    api.get('/api/balancers/recipes').then((data: any) => setRecipes(Array.isArray(data) ? data : data.items || [])).catch(() => undefined);
  }, [load]);

  const memberToForm = (member: BalancerRow['members'][number]): MemberForm => {
    const settings = member.config?.settings || {};
    const stream = member.config?.streamSettings || {};
    return {
      id: member.id,
      protocol: member.protocol,
      address: String(settings.address || ''),
      port: String(settings.port || '443'),
      uuid: String(settings.clients?.[0]?.id || ''),
      password: String(settings.clients?.[0]?.password || ''),
      method: String(settings.clients?.[0]?.method || 'aes-256-gcm'),
      security: String(stream.security || 'none'),
      transport: String(stream.network || 'tcp'),
      sni: String(stream.realitySettings?.serverName || stream.tlsSettings?.serverName || ''),
      path: String(stream.wsSettings?.path || ''),
      publicKey: String(stream.realitySettings?.publicKey || ''),
      shortId: String(stream.realitySettings?.shortId || ''),
      flow: String(settings.clients?.[0]?.flow || ''),
      enabled: member.enabled,
    };
  };

  const startCreate = () => {
    setEditing(null); setForm(emptyForm()); setPreview(null); setModalError(''); setOpen(true);
  };

  const startEdit = (row: BalancerRow) => {
    setEditing(row.id);
    setForm({
      name: row.name,
      strategy: row.strategy,
      enabled: row.enabled,
      fallbackTag: row.fallbackTag,
      probeUrl: row.probeUrl,
      probeIntervalSec: String(row.probeIntervalSec),
      observatoryMode: row.observatoryMode || 'observatory',
      burstDestination: row.burstDestination || 'https://connectivitycheck.gstatic.com/generate_204',
      burstIntervalSec: String(row.burstIntervalSec || 60),
      burstSampling: String(row.burstSampling || 10),
      burstTimeoutSec: String(row.burstTimeoutSec || 5),
      domains: ((row.rule?.domain as string[]) || []).join(', '),
      ips: ((row.rule?.ip as string[]) || []).join(', '),
      port: String(row.rule?.port || ''),
      network: String(row.rule?.network || ''),
      members: row.members.map(memberToForm),
    });
    setPreview(null); setModalError(''); setOpen(true);
  };

  const applyRecipe = (recipe: any) => {
    const payload = recipe.payload || {};
    setEditing(null);
    setForm({
      name: String(payload.name || ''),
      strategy: String(payload.strategy || 'roundRobin'),
      enabled: Boolean(payload.enabled),
      fallbackTag: String(payload.fallbackTag || 'direct'),
      probeUrl: String(payload.probeUrl || 'https://www.google.com/generate_204'),
      probeIntervalSec: String(payload.probeIntervalSec || 30),
      observatoryMode: String(payload.observatoryMode || 'observatory'),
      burstDestination: String(payload.burstDestination || ''),
      burstIntervalSec: String(payload.burstIntervalSec || 60),
      burstSampling: String(payload.burstSampling || 10),
      burstTimeoutSec: String(payload.burstTimeoutSec || 5),
      domains: ((payload.rule?.domain as string[]) || []).join(', '),
      ips: ((payload.rule?.ip as string[]) || []).join(', '),
      port: String(payload.rule?.port || ''),
      network: String(payload.rule?.network || ''),
      members: (payload.members || []).map((m: any) => ({
        ...emptyMember(),
        protocol: String(m.protocol || 'vless'),
        address: String(m.address || ''),
        port: String(m.port || 443),
        uuid: String(m.uuid || ''),
        password: String(m.password || ''),
        security: String(m.security || 'none'),
        sni: String(m.sni || ''),
        publicKey: String(m.publicKey || ''),
        shortId: String(m.shortId || ''),
        flow: String(m.flow || ''),
        enabled: m.enabled !== false,
      })),
    });
    setPreview(null); setModalError(''); setOpen(true);
  };

  const buildPayload = () => ({
    name: form.name,
    strategy: form.strategy,
    enabled: form.enabled,
    fallbackTag: form.fallbackTag,
    probeUrl: form.probeUrl,
    probeIntervalSec: Number(form.probeIntervalSec) || 30,
    observatoryMode: form.observatoryMode,
    burstDestination: form.burstDestination,
    burstIntervalSec: Number(form.burstIntervalSec) || 60,
    burstSampling: Number(form.burstSampling) || 10,
    burstTimeoutSec: Number(form.burstTimeoutSec) || 5,
    rule: {
      ...(splitList(form.domains).length ? { domain: splitList(form.domains) } : {}),
      ...(splitList(form.ips).length ? { ip: splitList(form.ips) } : {}),
      ...(form.port ? { port: form.port } : {}),
      ...(form.network ? { network: form.network } : {}),
    },
    members: form.members.map((member) => ({
      ...(member.id ? { id: member.id } : {}),
      protocol: member.protocol,
      address: member.address,
      port: Number(member.port) || 443,
      uuid: member.uuid,
      password: member.password,
      method: member.method,
      security: member.security,
      transport: member.transport,
      sni: member.sni,
      path: member.path,
      ...(member.security === 'reality' ? { publicKey: member.publicKey.trim(), shortId: member.shortId.trim() } : {}),
      ...(member.protocol === 'vless' ? { flow: member.flow } : {}),
      enabled: member.enabled,
    })),
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setModalError(''); setNotice('');
    try {
      const payload = buildPayload();
      if (editing) await api.patch(`/api/balancers/${editing}`, payload);
      else await api.post('/api/balancers', payload);
      setOpen(false);
      setNotice(t.saved);
      await load();
    } catch (e: any) { setModalError(e.message); } finally { setBusy(false); }
  };

  const showPreview = async () => {
    if (!editing) return;
    setBusy(true); setModalError('');
    try {
      setPreview(await api.post(`/api/balancers/${editing}/preview`, {}));
    } catch (e: any) { setModalError(e.message); } finally { setBusy(false); }
  };

  const toggle = async (row: BalancerRow) => {
    try {
      await api.patch(`/api/balancers/${row.id}`, { enabled: !row.enabled });
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const remove = async (row: BalancerRow) => {
    if (!window.confirm(`${t.delete}? ${row.name}`)) return;
    try {
      await api.delete(`/api/balancers/${row.id}`);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const updateMember = (index: number, patch: Partial<MemberForm>) =>
    setForm((current) => ({ ...current, members: current.members.map((item, i) => i === index ? { ...item, ...patch } : item) }));

  const hint = (ru: string, en: string) => (lang === 'ru' ? ru : en);

  const strategyHint = (strategy: string) => {
    const key: Record<string, string> = {
      random: 'balancerHelpRandom', roundRobin: 'balancerHelpRoundRobin',
      leastPing: 'balancerHelpLeastPing', leastLoad: 'balancerHelpLeastLoad',
    };
    return (t as any)[key[strategy]] || '';
  };

  return (
    <>
      <PageHeader
        eyebrow={t.infrastructure}
        title={t.balancers}
        subtitle={t.balancersSubtitle}
        icon="zap"
        actions={
          <>
            <HelpButton title={t.help}>
              <p>{lang === 'ru' ? 'Балансировщик распределяет трафик между исходящими подключениями. Выберите стратегию, добавьте участников и, при необходимости, задайте правило — например, домены для балансировки. Xray сгенерирует routing.balancers и observatory.' : 'A balancer distributes traffic across outbound connections. Pick a strategy, add members and optionally a rule such as domains to balance. Xray generates routing.balancers and observatory.'}</p>
              <p>{lang === 'ru' ? 'random и roundRobin работают без проверки доступности; leastPing и leastLoad требуют observatory и используют Probe URL.' : 'random and roundRobin work without probing; leastPing and leastLoad require observatory and use the Probe URL.'}</p>
            </HelpButton>
            <Button icon="plus" variant="primary" onClick={startCreate}>{t.balancerNew}</Button>
          </>
        }
      />

      {error && <Alert className="mb-4">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-4">{notice}</Alert>}

      {loading ? (
        <Card className="py-16 text-center text-xs text-muted">{t.loading}</Card>
      ) : !rows.length ? (
        <Card className="py-16 text-center text-xs text-subtle">{t.noData}</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => (
            <Card key={row.id} className="node-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-brand/30 bg-brand/10 text-brand"><Icon name="zap" size={16} /></div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-fg">{row.name}</p>
                      <Badge tone="brand">{row.strategy}</Badge>
                      <Badge tone={row.enabled ? 'success' : 'neutral'} dot>{row.enabled ? t.enabled : t.disabled}</Badge>
                    </div>
                    <p className="mono mt-0.5 text-[10px] text-subtle">{row.id.slice(0, 12)} · fallback: {row.fallbackTag}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <IconButton icon="power" label={row.enabled ? t.disable : t.enable} onClick={() => toggle(row)} />
                  <IconButton icon="edit" label={t.edit} onClick={() => startEdit(row)} />
                  <IconButton icon="trash" label={t.delete} tone="danger" onClick={() => remove(row)} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted">
                <span>{t.balancerMembers}: {row.members.length}</span>
                <span>·</span>
                <span>{t.balancerProbeInterval}: {row.probeIntervalSec}s</span>
                <span>·</span>
                <span>{row.observatoryMode === 'burstObservatory' ? 'burst' : 'observatory'}</span>
                {row.rule && Object.keys(row.rule).length > 0 && <><span>·</span><span>{t.balancerRule}: {Object.keys(row.rule).join(', ')}</span></>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `${t.edit}: ${form.name}` : t.balancerNew}
        subtitle={t.balancersSubtitle}
        icon={<Icon name="zap" size={16} />}
        size="xl"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{t.cancel}</Button>
            {editing && <Button icon="code" onClick={showPreview} loading={busy}>{t.balancerPreview}</Button>}
            <Button variant="primary" icon="check" form="balancer-form" loading={busy}>{t.save}</Button>
          </>
        }
      >
        <Alert className="mb-4">{modalError}</Alert>
        {recipes.length > 0 && (
          <div className="mb-4 rounded-lg border border-line bg-surface-2/40 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">{lang === 'ru' ? 'Готовые рецепты' : 'Ready recipes'}</p>
            <div className="flex flex-wrap gap-2">
              {recipes.map((recipe) => (
                <button type="button" key={recipe.id} onClick={() => applyRecipe(recipe)}
                  title={recipe.description}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:border-brand/40 hover:text-fg">
                  {recipe.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <form id="balancer-form" onSubmit={save} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.name} hint={hint('Имя балансировщика, видно в конфиге Xray','Balancer name shown in the Xray config')}><input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label={t.balancerFallback} hint={hint('Куда направить трафик, если все участники недоступны','Where to send traffic when no member is healthy')}>
              <select className="field" value={form.fallbackTag} onChange={(e) => setForm({ ...form, fallbackTag: e.target.value })}>
                <option value="direct">direct</option><option value="blocked">blocked</option>
              </select>
            </Field>
          </div>

          <div>
            <span className="text-[11px] font-medium text-subtle">{t.balancerStrategy}</span>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {STRATEGIES.map((strategy) => (
                <button key={strategy} type="button" aria-pressed={form.strategy === strategy} onClick={() => setForm({ ...form, strategy })}
                  className={`rounded-lg border px-3 py-2 text-left transition ${form.strategy === strategy ? 'border-brand/50 bg-brand/10' : 'border-line bg-surface-2 hover:border-brand/30'}`}>
                  <span className="block text-xs font-semibold text-fg">{strategy}</span>
                  <span className="mt-0.5 block text-[10px] text-muted">{strategyHint(strategy)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.balancerProbe} hint={hint('URL для проверки доступности участников','URL used to probe member availability')}><input className="field" value={form.probeUrl} onChange={(e) => setForm({ ...form, probeUrl: e.target.value })} /></Field>
            <Field label={t.balancerProbeInterval} hint={hint('Как часто проверять участников, секунды','How often to probe members, seconds')}><input className="field" type="number" min={10} max={3600} value={form.probeIntervalSec} onChange={(e) => setForm({ ...form, probeIntervalSec: e.target.value })} /></Field>
            <Field label={t.balancerObservatoryMode} hint={hint('Обычные пробы или короткие пакетные замеры','Regular probing or short burst measurements')}>
              <select className="field" value={form.observatoryMode} onChange={(e) => setForm({ ...form, observatoryMode: e.target.value })}>
                <option value="observatory">observatory</option>
                <option value="burstObservatory">burstObservatory</option>
              </select>
            </Field>
            {form.observatoryMode === 'burstObservatory' && (
              <>
                <Field label={t.balancerBurstDestination} hint={hint('Цель для burst-проб','Destination for burst probes')}><input className="field" value={form.burstDestination} onChange={(e) => setForm({ ...form, burstDestination: e.target.value })} /></Field>
                <Field label={t.balancerBurstInterval} hint={hint('Интервал burst-проб, секунды','Burst probe interval, seconds')}><input className="field" type="number" min={10} max={3600} value={form.burstIntervalSec} onChange={(e) => setForm({ ...form, burstIntervalSec: e.target.value })} /></Field>
                <Field label={t.balancerBurstSampling} hint={hint('Сколько замеров в одной серии','Samples per burst')}><input className="field" type="number" min={1} max={50} value={form.burstSampling} onChange={(e) => setForm({ ...form, burstSampling: e.target.value })} /></Field>
                <Field label={t.balancerBurstTimeout} hint={hint('Таймаут одного замера, секунды','Single probe timeout, seconds')}><input className="field" type="number" min={1} max={60} value={form.burstTimeoutSec} onChange={(e) => setForm({ ...form, burstTimeoutSec: e.target.value })} /></Field>
              </>
            )}
            <Field label="Domains" hint={hint('Домены, которые пойдут через балансировщик; geosite:* поддерживается','Domains routed through the balancer; geosite:* supported')}><input className="field" placeholder="example.com, geosite:google" value={form.domains} onChange={(e) => setForm({ ...form, domains: e.target.value })} /></Field>
            <Field label="IP / CIDR" hint={hint('IP и подсети для правила маршрутизации','IPs and CIDRs for the routing rule')}><input className="field" placeholder="0.0.0.0/0" value={form.ips} onChange={(e) => setForm({ ...form, ips: e.target.value })} /></Field>
            <Field label={t.port} hint={hint('Порты через запятую или диапазон','Comma-separated ports or a range')}><input className="field" placeholder="443,1000-2000" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} /></Field>
            <Field label="Network" hint={hint('tcp, udp или tcp,udp','tcp, udp or tcp,udp')}><input className="field" placeholder="tcp,udp" value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })} /></Field>
          </div>

          <div>
            <SectionTitle
              title={t.balancerMembers}
              action={<Button size="sm" icon="plus" onClick={() => setForm({ ...form, members: [...form.members, emptyMember()] })}>{t.balancerAddMember}</Button>}
            />
            {!form.members.length && <p className="py-3 text-center text-xs text-subtle">{t.balancerNoMembers}</p>}
            <div className="space-y-3">
              {form.members.map((member, index) => (
                <div key={index} className="rounded-lg border border-line bg-surface-2/40 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <Badge tone="cyan">#{index + 1}</Badge>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[10px] text-muted">
                        <input type="checkbox" checked={member.enabled} onChange={(e) => updateMember(index, { enabled: e.target.checked })} />
                        {t.enabled}
                      </label>
                      <Button size="sm" variant="danger" icon="trash" onClick={() => setForm({ ...form, members: form.members.filter((_, i) => i !== index) })}>{t.delete}</Button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label={t.protocol} hint={hint('Протокол исходящего подключения участника','Outbound protocol of the member')}>
                      <select className="field" value={member.protocol} onChange={(e) => updateMember(index, { protocol: e.target.value })}>
                        {PROTECTED_PROTOCOLS.map((protocol) => <option key={protocol}>{protocol}</option>)}
                      </select>
                    </Field>
                    <Field label={t.balancerAddress} hint={hint('Домен или IP сервера участника','Member server domain or IP')}><input className="field" value={member.address} onChange={(e) => updateMember(index, { address: e.target.value })} /></Field>
                    <Field label={t.balancerPort} hint={hint('Порт сервера участника, 1–65535','Member server port, 1–65535')}><input className="field" type="number" min={1} max={65535} value={member.port} onChange={(e) => updateMember(index, { port: e.target.value })} /></Field>
                    <Field label={t.balancerUuid} hint={hint('UUID клиента для VLESS/VMess','Client UUID for VLESS/VMess')}><input className="field" value={member.uuid} onChange={(e) => updateMember(index, { uuid: e.target.value })} /></Field>
                    <Field label={t.balancerPassword} hint={hint('Пароль для Trojan/Shadowsocks','Password for Trojan/Shadowsocks')}><input className="field" type="password" value={member.password} onChange={(e) => updateMember(index, { password: e.target.value })} /></Field>
                    <Field label={t.balancerMethod} hint={hint('Шифр Shadowsocks, например aes-256-gcm','Shadowsocks cipher, e.g. aes-256-gcm')}><input className="field" value={member.method} onChange={(e) => updateMember(index, { method: e.target.value })} /></Field>
                    <Field label={t.balancerSecurity} hint={hint('Шифрование транспорта: none, tls или reality','Transport security: none, tls or reality')}>
                      <select className="field" value={member.security} onChange={(e) => updateMember(index, { security: e.target.value })}>
                        <option value="none">none</option><option value="tls">tls</option><option value="reality">reality</option>
                      </select>
                    </Field>
                    <Field label={t.balancerTransport} hint={hint('Транспорт: tcp, ws, grpc и т.д.','Transport: tcp, ws, grpc, etc.')}><input className="field" value={member.transport} onChange={(e) => updateMember(index, { transport: e.target.value })} /></Field>
                    <Field label={t.balancerSni} hint={hint('Имя сервера для TLS/REALITY','Server name for TLS/REALITY')}><input className="field" value={member.sni} onChange={(e) => updateMember(index, { sni: e.target.value })} /></Field>
                    {member.security === 'reality' && (
                      <>
                        <Field label="REALITY public key" hint={hint('Публичный ключ (pbk) подключения на ноде-выходе. Есть в ссылке vless://…&pbk=…','Public key (pbk) of the exit node inbound, found in the vless:// link as pbk=…')}><input className="field font-mono" required value={member.publicKey} onChange={(e) => updateMember(index, { publicKey: e.target.value })} /></Field>
                        <Field label="REALITY shortId" hint={hint('Short ID (sid) из ссылки подключения, до 16 hex-символов','Short ID (sid) from the connection link, up to 16 hex chars')}><input className="field font-mono" value={member.shortId} onChange={(e) => updateMember(index, { shortId: e.target.value })} /></Field>
                      </>
                    )}
                    {member.protocol === 'vless' && (
                      <Field label="Flow" hint={hint('xtls-rprx-vision — если подключение на выходе использует Vision (так создаёт мастер)','xtls-rprx-vision if the exit inbound uses Vision (wizard default)')}>
                        <select className="field" value={member.flow} onChange={(e) => updateMember(index, { flow: e.target.value })}>
                          <option value="">none</option><option value="xtls-rprx-vision">xtls-rprx-vision</option>
                        </select>
                      </Field>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {preview && <CodeBlock>{String(JSON.stringify(preview, null, 2))}</CodeBlock>}
        </form>
      </Modal>
    </>
  );
}
