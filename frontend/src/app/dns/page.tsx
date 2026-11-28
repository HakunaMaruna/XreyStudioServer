// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { Icon } from '../../components/icons';
import {
  Alert, Badge, Button, Card, Field, HelpButton, Modal, PageHeader, SectionTitle, Segmented,
} from '../../components/ui';

type Status = {
  mode: 'control' | 'tenant';
  available: boolean;
  zone: string;
  ttl: number;
  apiUrl: string;
  apiKeyConfigured: boolean;
  bindIp: string;
  version?: string | null;
  zones?: number;
  queries?: number;
  answers?: number;
  servfail?: number;
  uptime?: number;
  latency?: number;
  metrics?: Record<string, number>;
  error?: string;
};
type ZoneRow = { id: string; name: string; kind: string; serial?: number; records?: number; managed: boolean };
type RecordRow = { name: string; type: string; ttl: number; content: string; disabled: boolean };
type Settings = {
  apiUrl: string; zone: string; ttl: number | ''; ns1: string; ns2: string;
  bindIp: string; apiKeyConfigured: boolean; mode: string;
};
type Tab = 'overview' | 'zones' | 'records' | 'dnssec' | 'metrics' | 'settings';
type DnssecKey = { id: number; keytype: string; algorithm: string | null; bits: number | null; active: boolean; published: boolean; dnskey: string | null; ds: string[]; cds: string[] };
type DnssecState = { zone: string; enabled: boolean; keys: DnssecKey[]; ds: string[]; dnskeys: string[] };

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'NS', 'MX', 'SRV', 'PTR'];

const uptime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

export default function DnsPage() {
  const { t, lang } = useLang();
  const [tab, setTab] = useState<Tab>('overview');
  const [status, setStatus] = useState<Status | null>(null);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [dnssecState, setDnssecState] = useState<DnssecState | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [zoneForm, setZoneForm] = useState({ name: '', ns1: 'ns1.h2onetwork.pro.', ns2: 'ns2.h2onetwork.pro.' });
  const [recordForm, setRecordForm] = useState<{ name: string; type: string; ttl: number | ''; content: string }>({ name: '', type: 'A', ttl: 60, content: '' });
  const [keyForm, setKeyForm] = useState({ keytype: 'ksk', algorithm: '', bits: '' });
  const [zoneModal, setZoneModal] = useState(false);
  const [recordModal, setRecordModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modalError, setModalError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [statusData, zoneData, settingsData] = await Promise.all([
        api.get<Status>('/api/dns/status'),
        api.get<ZoneRow[]>('/api/dns/zones'),
        api.get<Settings>('/api/dns/settings'),
      ]);
      setStatus(statusData);
      setZones(zoneData);
      setSettings(settingsData);
      setSelectedZone((current) => current || statusData.zone);
    } catch (e: any) {
      if (e?.message?.includes('CONTROL')) {
        setStatus({ mode: 'tenant', available: false, zone: '', ttl: 60, apiUrl: '', apiKeyConfigured: false, bindIp: '' });
      } else {
        setError(e.message);
      }
    }
  }, []);

  const loadRecords = useCallback(async (zone: string) => {
    if (!zone) return;
    setBusy(true);
    try {
      setRecords(await api.get<RecordRow[]>(`/api/dns/zone/${encodeURIComponent(zone)}/records`));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) { window.location.href = '/login'; return; }
    load();
  }, [load]);

  const loadDnssec = useCallback(async (zone: string) => {
    if (!zone) return;
    setBusy(true);
    try {
      setDnssecState(await api.get<DnssecState>(`/api/dns/zone/${encodeURIComponent(zone)}/dnssec`));
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (tab === 'records' && selectedZone) loadRecords(selectedZone); }, [tab, selectedZone, loadRecords]);
  useEffect(() => { if (tab === 'dnssec' && selectedZone) loadDnssec(selectedZone); }, [tab, selectedZone, loadDnssec]);

  const toggleDnssec = async (enabled: boolean) => {
    if (!selectedZone) return;
    setBusy(true); setModalError(''); setNotice(''); setNotice('');
    try {
      await api.patch(`/api/dns/zone/${encodeURIComponent(selectedZone)}/dnssec`, { enabled });
      setNotice(`${t.dnssec}: ${enabled ? 'ON' : 'OFF'}`);
      await loadDnssec(selectedZone);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const createDnssecKey = async () => {
    if (!selectedZone) return;
    setBusy(true); setModalError(''); setNotice('');
    try {
      const body: Record<string, unknown> = { keytype: keyForm.keytype, active: true, published: true };
      if (keyForm.algorithm) body.algorithm = keyForm.algorithm;
      if (keyForm.bits) body.bits = Number(keyForm.bits);
      await api.post(`/api/dns/zone/${encodeURIComponent(selectedZone)}/dnssec/keys`, body);
      setNotice(`${t.dnssecCreateKey}: ${keyForm.keytype}`);
      await loadDnssec(selectedZone);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const toggleKey = async (key: DnssecKey, field: 'active' | 'published') => {
    if (!selectedZone) return;
    setBusy(true); setModalError(''); setNotice('');
    try {
      await api.patch(`/api/dns/zone/${encodeURIComponent(selectedZone)}/dnssec/keys/${key.id}`, { [field]: !key[field] });
      await loadDnssec(selectedZone);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const deleteDnssecKey = async (key: DnssecKey) => {
    if (!selectedZone || !window.confirm(`${t.delete}? ${key.keytype} #${key.id}`)) return;
    setBusy(true); setError('');
    try {
      await api.delete(`/api/dns/zone/${encodeURIComponent(selectedZone)}/dnssec/keys/${key.id}`);
      await loadDnssec(selectedZone);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const createZone = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setModalError(''); setNotice('');
    try {
      await api.post('/api/dns/zones', zoneForm);
      setZoneModal(false); setNotice(`${t.dnsCreateZone}: ${zoneForm.name}`);
      await load();
    } catch (e: any) { setModalError(e.message); } finally { setBusy(false); }
  };

  const deleteZone = async (name: string) => {
    if (!window.confirm(`${t.delete}? ${name}`)) return;
    setBusy(true); setError('');
    try {
      await api.delete(`/api/dns/zones/${encodeURIComponent(name)}`);
      setNotice(`${t.delete}: ${name}`);
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const addRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedZone) return;
    setBusy(true); setModalError(''); setNotice('');
    try {
      await api.post(`/api/dns/zone/${encodeURIComponent(selectedZone)}/records`, {
        name: recordForm.name,
        type: recordForm.type,
        ttl: Number(recordForm.ttl || 60),
        records: [{ content: recordForm.content }],
      });
      setRecordModal(false);
      setRecordForm({ name: '', type: 'A', ttl: 60, content: '' });
      setNotice(t.saved);
      await loadRecords(selectedZone);
    } catch (e: any) { setModalError(e.message); } finally { setBusy(false); }
  };

  const deleteRecord = async (row: RecordRow) => {
    if (!selectedZone || !window.confirm(`${t.delete}? ${row.name} ${row.type}`)) return;
    setBusy(true); setError('');
    try {
      const params = new URLSearchParams({ name: row.name, type: row.type });
      await api.delete(`/api/dns/zone/${encodeURIComponent(selectedZone)}/records?${params}`);
      await loadRecords(selectedZone);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const patch: Record<string, unknown> = {
        PDNS_API_URL: settings.apiUrl,
        NODE_DNS_ZONE: settings.zone,
        NODE_DNS_TTL: Number(settings.ttl || 60),
        DNS_NS1: settings.ns1,
        DNS_NS2: settings.ns2,
        PDNS_BIND_IP: settings.bindIp,
      };
      if (apiKeyDraft) patch.PDNS_API_KEY = apiKeyDraft;
      const data = await api.patch<Settings>('/api/dns/settings', patch);
      setSettings(data); setApiKeyDraft(''); setNotice(t.settingsSaved);
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  if (status?.mode === 'tenant') {
    return (
      <>
        <PageHeader eyebrow="CONTROL" title={t.dnsSection} subtitle={t.dnsSubtitle} icon="network" />
        <Card className="py-16 text-center text-sm text-muted">{t.dnsUnavailable}</Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="CONTROL"
        title={t.dnsSection}
        subtitle={t.dnsSubtitle}
        icon="network"
        actions={
          <>
            <HelpButton title={t.help}>
              <p>{lang === 'ru' ? 'Раздел доступен только в CONTROL-режиме. Он управляет PowerDNS через HTTP API: зоны, записи и метрики. TENANT-панели DNS не устанавливают.' : 'This section is only available in CONTROL mode. It manages PowerDNS over its HTTP API: zones, records and metrics. TENANT panels do not install DNS.'}</p>
              <p>{lang === 'ru' ? 'Документация PowerDNS API: https://doc.powerdns.com/authoritative/http-api/index.html' : 'PowerDNS API docs: https://doc.powerdns.com/authoritative/http-api/index.html'}</p>
            </HelpButton>
            <Button icon="refresh" size="sm" onClick={load}>{t.refresh}</Button>
          </>
        }
      />

      {error && <Alert className="mb-4">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-4">{notice}</Alert>}
      {status && !status.available && status.error && (
        <div role="alert" className="mb-4 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">{status.error}</div>
      )}

      <div className="mb-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: t.dnsOverview, icon: 'grid' },
            { value: 'zones', label: t.dnsZones, icon: 'database' },
            { value: 'records', label: t.dnsRecords, icon: 'list' },
            { value: 'dnssec', label: t.dnssec, icon: 'shield' },
            { value: 'metrics', label: t.dnsMetrics, icon: 'activity' },
            { value: 'settings', label: t.dnsSettings, icon: 'settings' },
          ]}
        />
      </div>

      {tab === 'overview' && status && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
            <Card className="p-3">
              <p className="text-[10px] uppercase text-subtle">{t.status}</p>
              <p className="mt-1 text-base font-semibold text-fg">{status.available ? 'OK' : '—'}</p>
              <p className="truncate text-[10px] text-muted">PowerDNS {status.version || ''}</p>
            </Card>
            <Card className="p-3">
              <p className="text-[10px] uppercase text-subtle">{t.dnsZones}</p>
              <p className="mt-1 text-base font-semibold text-fg tabular-nums">{status.zones ?? '—'}</p>
              <p className="truncate text-[10px] text-muted">{status.zone}</p>
            </Card>
            <Card className="p-3">
              <p className="text-[10px] uppercase text-subtle">{t.dnsQueries}</p>
              <p className="mt-1 text-base font-semibold text-fg tabular-nums">{status.queries ?? '—'}</p>
              <p className="truncate text-[10px] text-muted">servfail: {status.servfail ?? 0}</p>
            </Card>
            <Card className="p-3">
              <p className="text-[10px] uppercase text-subtle">{t.dnsUptime}</p>
              <p className="mt-1 text-base font-semibold text-fg tabular-nums">{status.uptime ? uptime(status.uptime) : '—'}</p>
              <p className="truncate text-[10px] text-muted">{t.dnsLatency}: {status.latency ?? 0} µs</p>
            </Card>
          </div>
          <Card className="mt-3">
            <SectionTitle title={t.dnsDelegation} subtitle={lang === 'ru' ? 'Записи в родительской зоне у регистратора' : 'Records at your registrar'}
              action={<Button size="sm" icon="refresh" onClick={load}>{t.check}</Button>} />
            <div className="max-h-44 overflow-auto rounded-lg border border-line">
              <table className="w-full table-fixed text-left text-[11px]">
                <thead className="sticky top-0 bg-surface-2 text-[10px] uppercase text-subtle">
                  <tr><th className="w-2/5 px-2 py-1.5">Домен</th><th className="w-1/5 px-2 py-1.5">Тип</th><th className="w-1/5 px-2 py-1.5">Запись</th><th className="w-1/5 px-2 py-1.5">TTL</th></tr>
                </thead>
                <tbody className="divide-y divide-line/40">
                  {[
                    [`${status.zone}.`, 'NS', 'ns1.h2onetwork.pro.', 3600],
                    [`${status.zone}.`, 'NS', 'ns2.h2onetwork.pro.', 3600],
                    ['ns1.h2onetwork.pro.', 'A', 'CONTROL IP', 3600],
                    ['ns2.h2onetwork.pro.', 'A', 'CONTROL IP', 3600],
                  ].map((row, index) => (
                    <tr key={index} className="text-fg">
                      <td className="mono truncate px-2 py-1.5">{String(row[0])}</td>
                      <td className="px-2 py-1.5"><Badge tone="brand">{String(row[1])}</Badge></td>
                      <td className="mono truncate px-2 py-1.5 text-muted">{String(row[2])}</td>
                      <td className="px-2 py-1.5 tabular-nums text-subtle">{String(row[3])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {tab === 'zones' && (
        <Card>
          <SectionTitle
            title={t.dnsZones}
            action={<Button size="sm" icon="plus" variant="primary" onClick={() => { setModalError(''); setZoneModal(true); }}>{t.dnsCreateZone}</Button>}
          />
          <div className="space-y-2">
            {zones.map((zone) => (
              <div key={zone.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/40 px-3 py-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Icon name="database" size={16} className="text-brand" />
                  <span className="mono text-fg">{zone.name}</span>
                  <Badge tone="neutral">{zone.kind}</Badge>
                  {zone.managed && <Badge tone="brand">managed</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted">{zone.records ?? '—'} rrsets</span>
                  <Button size="sm" variant="subtle" icon="list" onClick={() => { setSelectedZone(zone.name); setTab('records'); }}>{t.dnsRecords}</Button>
                  <Button size="sm" variant="danger" icon="trash" onClick={() => deleteZone(zone.name)}>{t.delete}</Button>
                </div>
              </div>
            ))}
            {!zones.length && <div className="py-8 text-center text-xs text-subtle">{t.noData}</div>}
          </div>
        </Card>
      )}

      {tab === 'records' && (
        <Card>
          <SectionTitle
            title={`${t.dnsRecords}: ${selectedZone || '—'}`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <select className="field w-auto" value={selectedZone} onChange={(e) => setSelectedZone(e.target.value)}>
                  {zones.map((zone) => <option key={zone.id} value={zone.name}>{zone.name}</option>)}
                </select>
                <Button size="sm" icon="plus" variant="primary" onClick={() => { setModalError(''); setRecordModal(true); }} disabled={!selectedZone}>{t.dnsAddRecord}</Button>
              </div>
            }
          />
          {busy ? <div className="py-8 text-center text-xs text-muted">{t.loading}</div> : (
            <div className="space-y-2">
              {records.map((row, index) => (
                <div key={`${row.name}-${row.type}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="cyan">{row.type}</Badge>
                    <span className="mono text-fg">{row.name}</span>
                    <span className="mono text-muted">{row.content}</span>
                    <span className="text-subtle">TTL {row.ttl}</span>
                  </div>
                  <Button size="sm" variant="danger" icon="trash" onClick={() => deleteRecord(row)}>{t.delete}</Button>
                </div>
              ))}
              {!records.length && <div className="py-8 text-center text-xs text-subtle">{t.noData}</div>}
            </div>
          )}
        </Card>
      )}

      {tab === 'dnssec' && (
        <div className="space-y-4">
          <Card>
            <SectionTitle
              title={t.dnssec}
              subtitle={`${selectedZone || '—'}`}
              action={<Button size="sm" variant={dnssecState?.enabled ? 'danger' : 'primary'} icon="shield" loading={busy} onClick={() => toggleDnssec(!dnssecState?.enabled)}>
                {dnssecState?.enabled ? t.disable : t.dnssecEnable}
              </Button>}
            />
            <div className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">{t.dnssecWarning}</div>
            <div className="mt-4 flex items-center gap-2">
              <Badge tone={dnssecState?.enabled ? 'success' : 'neutral'} dot>{dnssecState?.enabled ? 'DNSSEC ON' : 'DNSSEC OFF'}</Badge>
              <Badge tone="neutral">{dnssecState?.keys.length || 0} {t.dnssecKeys}</Badge>
            </div>
          </Card>

          <Card>
            <SectionTitle title={t.dnssecCreateKey} />
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t.dnssecKeytype}>
                <select className="field w-auto" value={keyForm.keytype} onChange={(e) => setKeyForm({ ...keyForm, keytype: e.target.value })}>
                  <option value="ksk">KSK</option><option value="zsk">ZSK</option><option value="csk">CSK</option>
                </select>
              </Field>
              <Field label={t.dnssecAlgorithm}>
                <input className="field w-auto" placeholder="ECDSAP256SHA256" value={keyForm.algorithm} onChange={(e) => setKeyForm({ ...keyForm, algorithm: e.target.value })} />
              </Field>
              <Field label="Bits">
                <input className="field w-auto" type="number" placeholder="256" value={keyForm.bits} onChange={(e) => setKeyForm({ ...keyForm, bits: e.target.value })} />
              </Field>
              <Button size="sm" icon="plus" variant="primary" onClick={createDnssecKey} loading={busy}>{t.dnssecCreateKey}</Button>
            </div>
          </Card>

          <Card>
            <SectionTitle title={t.dnssecKeys} />
            {!dnssecState?.keys.length ? <div className="py-8 text-center text-xs text-subtle">{t.dnssecNoKeys}</div> : (
              <div className="space-y-2">
                {dnssecState.keys.map((key) => (
                  <div key={key.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand">#{key.id} {key.keytype.toUpperCase()}</Badge>
                      <span className="text-muted">{key.algorithm || '—'}</span>
                      <span className="text-subtle">{key.bits || '—'} bits</span>
                      <button type="button" onClick={() => toggleKey(key, 'active')} className="transition hover:text-fg">
                        <Badge tone={key.active ? 'success' : 'neutral'}>{t.dnssecActive}: {String(key.active)}</Badge>
                      </button>
                      <button type="button" onClick={() => toggleKey(key, 'published')} className="transition hover:text-fg">
                        <Badge tone={key.published ? 'success' : 'neutral'}>{t.dnssecPublished}: {String(key.published)}</Badge>
                      </button>
                    </div>
                    <Button size="sm" variant="danger" icon="trash" onClick={() => deleteDnssecKey(key)}>{t.delete}</Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle title={t.dnssecDs} subtitle={lang === 'ru' ? 'Скопируйте DS-записи в родительскую зону' : 'Copy DS records to the parent zone'} />
            {!dnssecState?.ds.length ? <div className="py-8 text-center text-xs text-subtle">{t.noData}</div> : (
              <pre className="mono overflow-x-auto rounded-lg border border-line bg-surface-2/60 p-3 text-[11px] leading-relaxed text-muted">{dnssecState.ds.join('\n')}</pre>
            )}
          </Card>
        </div>
      )}

      {tab === 'metrics' && status?.metrics && (
        <Card>
          <SectionTitle title={t.dnsMetrics} subtitle="pdns_auth_*" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(status.metrics)
              .filter(([key]) => /queries|answers|cache|latency|uptime|servfail|packets|fd_usage|memory/.test(key))
              .slice(0, 24)
              .map(([key, value]) => (
                <div key={key} className="rounded-lg border border-line bg-surface-2/40 px-3 py-2">
                  <p className="mono truncate text-[10px] text-subtle">{key}</p>
                  <p className="mt-1 text-sm font-semibold text-fg tabular-nums">{value}</p>
                </div>
              ))}
          </div>
        </Card>
      )}

      {tab === 'settings' && settings && (
        <Card>
          <SectionTitle title={t.dnsSettings} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.dnsApiUrl}><input className="field" value={settings.apiUrl} onChange={(e) => setSettings({ ...settings, apiUrl: e.target.value })} /></Field>
            <Field label={t.dnsZone}><input className="field" value={settings.zone} onChange={(e) => setSettings({ ...settings, zone: e.target.value })} /></Field>
            <Field label={t.dnsTtl}><input className="field" type="number" min={30} max={86400} value={settings.ttl} onChange={(e) => setSettings({ ...settings, ttl: e.target.value === '' ? '' : Number(e.target.value) })} /></Field>
            <Field label={t.dnsNs}><input className="field" value={settings.ns1} onChange={(e) => setSettings({ ...settings, ns1: e.target.value })} /></Field>
            <Field label="NS2"><input className="field" value={settings.ns2} onChange={(e) => setSettings({ ...settings, ns2: e.target.value })} /></Field>
            <Field label={t.dnsBindIp}><input className="field" value={settings.bindIp} onChange={(e) => setSettings({ ...settings, bindIp: e.target.value })} /></Field>
            <Field label={t.dnsApiKey} hint={settings.apiKeyConfigured ? t.connected : undefined}>
              <input className="field" type="password" autoComplete="off" placeholder="••••••••" value={apiKeyDraft} onChange={(e) => setApiKeyDraft(e.target.value)} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="primary" icon="check" loading={busy} onClick={saveSettings}>{t.saveSettings}</Button>
          </div>
        </Card>
      )}

      <Modal open={zoneModal} onClose={() => setZoneModal(false)} title={t.dnsCreateZone} icon={<Icon name="database" size={16} />}
        footer={<><Button onClick={() => setZoneModal(false)}>{t.cancel}</Button><Button variant="primary" icon="check" loading={busy} form="dns-zone-form">{t.create}</Button></>}>
        <form id="dns-zone-form" onSubmit={createZone} className="space-y-4">
          <Alert>{modalError}</Alert>
          <Field label={t.dnsZone}><input className="field" required value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} placeholder="node.example.com" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="NS1"><input className="field" value={zoneForm.ns1} onChange={(e) => setZoneForm({ ...zoneForm, ns1: e.target.value })} /></Field>
            <Field label="NS2"><input className="field" value={zoneForm.ns2} onChange={(e) => setZoneForm({ ...zoneForm, ns2: e.target.value })} /></Field>
          </div>
        </form>
      </Modal>

      <Modal open={recordModal} onClose={() => setRecordModal(false)} title={t.dnsAddRecord} icon={<Icon name="list" size={16} />}
        footer={<><Button onClick={() => setRecordModal(false)}>{t.cancel}</Button><Button variant="primary" icon="check" loading={busy} form="dns-record-form">{t.create}</Button></>}>
        <form id="dns-record-form" onSubmit={addRecord} className="space-y-4">
          <Alert>{modalError}</Alert>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.name}><input className="field" required value={recordForm.name} onChange={(e) => setRecordForm({ ...recordForm, name: e.target.value })} placeholder={`host.${settings?.zone || ''}`} /></Field>
            <Field label={t.type}>
              <select className="field" value={recordForm.type} onChange={(e) => setRecordForm({ ...recordForm, type: e.target.value })}>
                {RECORD_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
            </Field>
            <Field label="TTL"><input className="field" type="number" min={30} max={86400} value={recordForm.ttl} onChange={(e) => setRecordForm({ ...recordForm, ttl: e.target.value === '' ? '' : Number(e.target.value) })} /></Field>
            <Field label={t.value}><input className="field" required value={recordForm.content} onChange={(e) => setRecordForm({ ...recordForm, content: e.target.value })} /></Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
