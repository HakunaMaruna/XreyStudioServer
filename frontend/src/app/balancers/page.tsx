'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { Icon } from '../../components/icons';
import {
  Badge, Button, Card, CodeBlock, Field, HelpButton, IconButton, Modal,
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
  method: 'aes-256-gcm', security: 'none', transport: 'tcp', sni: '', path: '', enabled: true,
});

const emptyForm = (): FormState => ({
  name: '', strategy: 'roundRobin', enabled: false, fallbackTag: 'direct',
  probeUrl: 'https://www.google.com/generate_204', probeIntervalSec: '30',
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
      sni: String(stream.tlsSettings?.serverName || ''),
      path: String(stream.wsSettings?.path || ''),
      enabled: member.enabled,
    };
  };

  const startCreate = () => {
    setEditing(null); setForm(emptyForm()); setPreview(null); setError(''); setOpen(true);
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
      domains: ((row.rule?.domain as string[]) || []).join(', '),
      ips: ((row.rule?.ip as string[]) || []).join(', '),
      port: String(row.rule?.port || ''),
      network: String(row.rule?.network || ''),
      members: row.members.map(memberToForm),
    });
    setPreview(null); setError(''); setOpen(true);
  };

  const buildPayload = () => ({
    name: form.name,
    strategy: form.strategy,
    enabled: form.enabled,
    fallbackTag: form.fallbackTag,
    probeUrl: form.probeUrl,
    probeIntervalSec: Number(form.probeIntervalSec) || 30,
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
      enabled: member.enabled,
    })),
  });

  const save = async () => {
    setBusy(true); setError('');
    try {
      const payload = buildPayload();
      if (editing) await api.patch(`/api/balancers/${editing}`, payload);
      else await api.post('/api/balancers', payload);
      setOpen(false);
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const showPreview = async () => {
    if (!editing) { setError(t.save); return; }
    setBusy(true); setError('');
    try {
      setPreview(await api.post(`/api/balancers/${editing}/preview`, {}));
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
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

      {error && <div className="mb-4 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger"><Icon name="alert" size={15} />{error}</div>}

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
                  <div className="grid h-10 w-10 place-items-center rounded-xl border border-brand/30 bg-brand/10 text-brand"><Icon name="zap" size={20} /></div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-fg">{row.name}</p>
                      <Badge tone="brand">{row.strategy}</Badge>
                      <Badge tone={row.enabled ? 'success' : 'neutral'} dot>{row.enabled ? t.enabled : t.disabled}</Badge>
                    </div>
                    <p className="mono mt-0.5 text-[10px] text-subtle">{row.id.slice(0, 12)} · fallback: {row.fallbackTag}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <IconButton icon="power" label={t.enabled} onClick={() => toggle(row)} />
                  <IconButton icon="edit" label={t.edit} onClick={() => startEdit(row)} />
                  <IconButton icon="trash" label={t.delete} tone="danger" onClick={() => remove(row)} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted">
                <span>{t.balancerMembers}: {row.members.length}</span>
                <span>·</span>
                <span>{t.balancerProbeInterval}: {row.probeIntervalSec}s</span>
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
            <Button variant="primary" icon="check" onClick={save} loading={busy}>{t.save}</Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.name}><input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label={t.balancerFallback}>
              <select className="field" value={form.fallbackTag} onChange={(e) => setForm({ ...form, fallbackTag: e.target.value })}>
                <option value="direct">direct</option><option value="blocked">blocked</option>
              </select>
            </Field>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">{t.balancerStrategy}</span>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {STRATEGIES.map((strategy) => (
                <button key={strategy} type="button" onClick={() => setForm({ ...form, strategy })}
                  className={`rounded-xl border px-3 py-2 text-left transition ${form.strategy === strategy ? 'border-brand/50 bg-brand/10' : 'border-line bg-surface-2 hover:border-brand/30'}`}>
                  <span className="block text-xs font-semibold text-fg">{strategy}</span>
                  <span className="mt-0.5 block text-[10px] text-muted">{strategyHint(strategy)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.balancerProbe}><input className="field" value={form.probeUrl} onChange={(e) => setForm({ ...form, probeUrl: e.target.value })} /></Field>
            <Field label={t.balancerProbeInterval}><input className="field" type="number" min={10} max={3600} value={form.probeIntervalSec} onChange={(e) => setForm({ ...form, probeIntervalSec: e.target.value })} /></Field>
            <Field label="Domains" hint={t.balancerRule}><input className="field" placeholder="example.com, geosite:google" value={form.domains} onChange={(e) => setForm({ ...form, domains: e.target.value })} /></Field>
            <Field label="IP / CIDR"><input className="field" placeholder="0.0.0.0/0" value={form.ips} onChange={(e) => setForm({ ...form, ips: e.target.value })} /></Field>
            <Field label={t.port}><input className="field" placeholder="443,1000-2000" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} /></Field>
            <Field label="Network"><input className="field" placeholder="tcp,udp" value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })} /></Field>
          </div>

          <div>
            <SectionTitle
              title={t.balancerMembers}
              action={<Button size="sm" icon="plus" onClick={() => setForm({ ...form, members: [...form.members, emptyMember()] })}>{t.balancerAddMember}</Button>}
            />
            {!form.members.length && <p className="py-3 text-center text-xs text-subtle">{t.balancerNoMembers}</p>}
            <div className="space-y-3">
              {form.members.map((member, index) => (
                <div key={index} className="rounded-xl border border-line bg-surface-2/40 p-3">
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
                    <Field label={t.protocol}>
                      <select className="field" value={member.protocol} onChange={(e) => updateMember(index, { protocol: e.target.value })}>
                        {PROTECTED_PROTOCOLS.map((protocol) => <option key={protocol}>{protocol}</option>)}
                      </select>
                    </Field>
                    <Field label={t.balancerAddress}><input className="field" value={member.address} onChange={(e) => updateMember(index, { address: e.target.value })} /></Field>
                    <Field label={t.balancerPort}><input className="field" type="number" value={member.port} onChange={(e) => updateMember(index, { port: e.target.value })} /></Field>
                    <Field label={t.balancerUuid}><input className="field" value={member.uuid} onChange={(e) => updateMember(index, { uuid: e.target.value })} /></Field>
                    <Field label={t.balancerPassword}><input className="field" type="password" value={member.password} onChange={(e) => updateMember(index, { password: e.target.value })} /></Field>
                    <Field label={t.balancerMethod}><input className="field" value={member.method} onChange={(e) => updateMember(index, { method: e.target.value })} /></Field>
                    <Field label={t.balancerSecurity}>
                      <select className="field" value={member.security} onChange={(e) => updateMember(index, { security: e.target.value })}>
                        <option value="none">none</option><option value="tls">tls</option><option value="reality">reality</option>
                      </select>
                    </Field>
                    <Field label={t.balancerTransport}><input className="field" value={member.transport} onChange={(e) => updateMember(index, { transport: e.target.value })} /></Field>
                    <Field label={t.balancerSni}><input className="field" value={member.sni} onChange={(e) => updateMember(index, { sni: e.target.value })} /></Field>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {preview && <CodeBlock>{String(JSON.stringify(preview, null, 2))}</CodeBlock>}
        </div>
      </Modal>
    </>
  );
}
