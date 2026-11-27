// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { COUNTRIES } from '../../lib/countries';
import { useLang } from '../../lib/i18n';
import { APP_VERSION } from '../../lib/version';
import { Icon } from '../../components/icons';
import {
  Badge, Button, Card, CodeBlock, Field, HelpButton, IconButton, Modal, PageHeader,
  ProgressBar, SectionTitle, StatusBadge, Toggle, formatBytes,
} from '../../components/ui';

type NodeGeo = { countryCode: string | null; city: string | null; ip: string | null; asn: string | null; checkedAt: string };
type NodeMetricRow = {
  cpu: number; ram: number; disk: number;
  trafficUp: string; trafficDown: string; connections: number; createdAt: string;
  xrayStatus?: string | null;
};
type NodeRow = {
  id: string; name: string; address: string; port: number; status: string;
  location?: string | null; geo?: NodeGeo | null; metrics?: NodeMetricRow[];
  agentVersion?: string | null;
  agentOutdated?: boolean;
  domain?: string | null;
  ipv6Enabled?: boolean;
  ipv6Address?: string | null;
  ipv6Addresses?: string[] | null;
  ipv6VerifiedAt?: string | null;
  ipv6LastError?: string | null;
  clientIpv6Enabled?: boolean;
};
type AgentForm = {
  host: string;
  port: number | string;
  username: string;
  password: string;
  privateKey: string;
  passphrase: string;
  hostKeyFingerprint: string;
  useSudo: boolean;
  targetVersion: string;
};
type AgentUpdateResult = { updated?: boolean; error?: string; output?: string };
type RevisionRow = { id: string; version: number; applied: boolean; createdAt: string };
type LogEntry = { timestamp: string; level: string; message: string };
type NodeLogs = { nodeId: string; logs: LogEntry[] };

type NodeHealth = {
  nodeId: string;
  status: string;
  online: boolean;
  lastSeenAt: string | null;
  lastError: string | null;
  latestMetric: {
    cpu: number;
    ram: number;
    disk: number;
    trafficUp: string;
    trafficDown: string;
    connections: number;
    createdAt: string;
  } | null;
};

export default function NodesPage() {
  const { t, lang } = useLang();
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [pings, setPings] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uiSettings, setUiSettings] = useState<{ autoRefresh?: boolean; metricsEnabled?: boolean }>({});
  const [updatingAgentId, setUpdatingAgentId] = useState<string | null>(null);
  const [ipv6Node, setIpv6Node] = useState<NodeRow | null>(null);
  const [ipv6Addresses, setIpv6Addresses] = useState<string[]>([]);
  const [ipv6Selected, setIpv6Selected] = useState('');
  const [ipv6Check, setIpv6Check] = useState<any>(null);
  const [ipv6Busy, setIpv6Busy] = useState(false);
  const [clientIpv6, setClientIpv6] = useState(true);
  const [revisionsNode, setRevisionsNode] = useState<NodeRow | null>(null);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [healthNode, setHealthNode] = useState<NodeRow | null>(null);
  const [health, setHealth] = useState<NodeHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [logsNode, setLogsNode] = useState<NodeRow | null>(null);
  const [logsData, setLogsData] = useState<NodeLogs | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [editNodeId, setEditNodeId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [metricsNode, setMetricsNode] = useState<NodeRow | null>(null);
  const [metricsData, setMetricsData] = useState<any>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [checkNode, setCheckNode] = useState<NodeRow | null>(null);
  const [checkData, setCheckData] = useState<any>(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkStep, setCheckStep] = useState(0);
  const [search, setSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [agentNode, setAgentNode] = useState<NodeRow | null>(null);
  const [agentForm, setAgentForm] = useState<AgentForm | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentResult, setAgentResult] = useState<AgentUpdateResult | null>(null);

  const countryNames = useMemo(
    () => new Intl.DisplayNames([lang === 'ru' ? 'ru' : 'en'], { type: 'region' }),
    [lang],
  );
  const flagFor = (code?: string | null) => COUNTRIES.find((c) => c.code === code)?.flag || '';

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.get('/api/nodes');
      setNodes(Array.isArray(data) ? data : data.data || []);
      setLastUpdated(Date.now());
      setError('');
    } catch (e: any) {
      if (!silent) setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
    // Пинг до агента может ждать таймаут, поэтому не задерживаем показ списка.
    api.get('/api/nodes/pings')
      .then((latency) => {
        setPings(latency && typeof latency === 'object' ? latency as Record<string, number | null> : {});
        setLastUpdated(Date.now());
      })
      .catch(() => {});
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem('xss_settings');
      if (stored) setUiSettings(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    load();
    // Метрики и пинг обновляем каждые 15 секунд, как их присылает агент.
    if (uiSettings.autoRefresh === false) return () => {};
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      load(true);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [uiSettings.autoRefresh]);

  const openAgentUpdate = (node: NodeRow) => {
    setAgentNode(node);
    setAgentResult(null);
    setAgentForm({
      host: node.address,
      port: 22,
      username: 'root',
      password: '',
      privateKey: '',
      passphrase: '',
      hostKeyFingerprint: '',
      useSudo: true,
      targetVersion: APP_VERSION,
    });
  };

  const submitAgentUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!agentNode || !agentForm) return;
    setAgentBusy(true);
    setAgentResult(null);
    try {
      const payload: Record<string, unknown> = {
        host: agentForm.host,
        port: Number(agentForm.port) || 22,
        username: agentForm.username,
        hostKeyFingerprint: agentForm.hostKeyFingerprint,
        useSudo: agentForm.useSudo,
        targetVersion: agentForm.targetVersion || undefined,
      };
      if (agentForm.password) payload.password = agentForm.password;
      if (agentForm.privateKey) payload.privateKey = agentForm.privateKey;
      if (agentForm.passphrase) payload.passphrase = agentForm.passphrase;
      const result = await api.post(`/api/node-provision/${agentNode.id}/update`, payload);
      setAgentResult(result);
      if (result?.updated) await load();
    } catch (e: any) {
      setAgentResult({ updated: false, error: e.message });
    } finally {
      setAgentBusy(false);
    }
  };

  const openIpv6 = async (node: NodeRow) => {
    setIpv6Node(node);
    setIpv6Selected(node.ipv6Address || '');
    setClientIpv6(node.clientIpv6Enabled !== false);
    setIpv6Check(null);
    setIpv6Busy(true);
    try {
      const data: any = await api.get(`/api/nodes/${node.id}/ipv6/addresses`);
      const addresses: string[] = Array.isArray(data) ? data : data.addresses || [];
      setIpv6Addresses(addresses);
      setIpv6Selected((current) => current || addresses[0] || '');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIpv6Busy(false);
    }
  };

  const checkIpv6 = async () => {
    if (!ipv6Node || !ipv6Selected) return;
    setIpv6Busy(true);
    try {
      setIpv6Check(await api.post(`/api/nodes/${ipv6Node.id}/ipv6/check`, { address: ipv6Selected }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIpv6Busy(false);
    }
  };

  const saveClientIpv6 = async (enabled: boolean) => {
    if (!ipv6Node) return;
    setClientIpv6(enabled);
    setIpv6Busy(true);
    try {
      await api.patch(`/api/nodes/${ipv6Node.id}/client-ipv6`, { enabled });
      setNotice(t.clientIpv6Changed);
      await load();
    } catch (e: any) {
      setError(e.message);
      setClientIpv6(!enabled);
    } finally {
      setIpv6Busy(false);
    }
  };

  const saveIpv6 = async (enabled: boolean) => {
    if (!ipv6Node) return;
    setIpv6Busy(true);
    try {
      await api.post(`/api/nodes/${ipv6Node.id}/ipv6`, { enabled, address: enabled ? ipv6Selected : null });
      setIpv6Node(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIpv6Busy(false);
    }
  };

  const updateAgentLatest = async (node: NodeRow) => {
    setUpdatingAgentId(node.id);
    setError('');
    setNotice('');
    try {
      const result = await api.post(`/api/node-provision/${node.id}/update-latest`, {});
      setNotice(result?.message || `${t.updateAgentDone}: ${node.name}`);
      await load();
    } catch (e: any) {
      setError(e.message || t.updateAgentFailed);
    } finally {
      setUpdatingAgentId(null);
    }
  };

  const apply = async (id: string) => {
    await api.post(`/api/nodes/${id}/apply`, {});
    await load();
  };

  const restart = async (id: string) => {
    await api.post(`/api/nodes/${id}/restart`, {});
    await load();
  };

  const remove = async (node: NodeRow) => {
    if (!confirm(`${node.name}\n\n${t.nodeDeleteConfirm}`)) return;
    try {
      await api.delete(`/api/nodes/${node.id}`);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const openRevisions = async (node: NodeRow) => {
    setRevisionsNode(node);
    setRevisions([]);
    setError('');
    setRevisionsLoading(true);
    try {
      const data = await api.get(`/api/nodes/${node.id}/revisions`);
      setRevisions(Array.isArray(data) ? data : data.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRevisionsLoading(false);
    }
  };

  const applyRevision = async (revisionId: string) => {
    if (!revisionsNode) return;
    try {
      await api.post(`/api/nodes/${revisionsNode.id}/apply`, revisionId ? { revisionId } : {});
      await openRevisions(revisionsNode);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const rollback = async (revisionId: string) => {
    if (!revisionsNode) return;
    try {
      await api.post(`/api/nodes/${revisionsNode.id}/rollback/${revisionId}`, {});
      await openRevisions(revisionsNode);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const openHealth = async (node: NodeRow) => {
    setHealthNode(node);
    setHealth(null);
    setHealthLoading(true);
    try {
      const data = await api.get(`/api/nodes/${node.id}/health`);
      setHealth(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setHealthLoading(false);
    }
  };

  const openLogs = async (node: NodeRow) => {
    setLogsNode(node);
    setLogsData(null);
    setLogsLoading(true);
    try {
      const data = await api.get(`/api/nodes/${node.id}/logs?limit=200`);
      setLogsData(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLogsLoading(false);
    }
  };

  const openEdit = async (node: NodeRow) => {
    setEditNodeId(node.id);
    setEditData(null);
    setError('');
    try {
      const data = await api.get(`/api/wizard/nodes/${node.id}`);
      setEditData({ ...data, name: data.name || node.name, address: data.address || node.address });
    } catch (e: any) {
      setEditNodeId(null);
      setError(e.message);
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editNodeId || !editData) return;
    setEditBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        name: editData.name,
        address: editData.address,
        location: editData.location || undefined,
        sshUser: editData.sshUser,
        sshPort: Number(editData.sshPort) || 22,
        authMode: editData.authMode,
        ipv4: editData.ipv4 || undefined,
        ipv6: editData.ipv6 || undefined,
        userDomain: editData.userDomain || undefined,
      };
      if (editData.password) body.password = editData.password;
      if (editData.privateKey) body.privateKey = editData.privateKey;
      if (editData.passphrase) body.passphrase = editData.passphrase;
      await api.patch(`/api/wizard/nodes/${editNodeId}`, body);
      setEditNodeId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEditBusy(false);
    }
  };

  const openMetrics = async (node: NodeRow) => {
    setMetricsNode(node);
    setMetricsData(null);
    setMetricsLoading(true);
    try {
      setMetricsData(await api.get(`/api/nodes/${node.id}/health`));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setMetricsLoading(false);
    }
  };

  const runCheburcheck = async (node: NodeRow) => {
    setCheckNode(node);
    setCheckData(null);
    setCheckStep(1);
    setCheckBusy(true);
    setError('');
    const timer = window.setInterval(() => setCheckStep((current) => Math.min(3, current + 1)), 6000);
    try {
      const data = await api.post('/api/cheburcheck/check', { nodeId: node.id });
      setCheckData(data);
      setCheckStep(4);
    } catch (e: any) {
      setError(e.message);
      setCheckStep(4);
    } finally {
      window.clearInterval(timer);
      setCheckBusy(false);
    }
  };

  const filteredNodes = nodes.filter((node) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [node.name, node.address, node.id, node.location, node.geo?.countryCode, node.geo?.city]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });

  const online = nodes.filter((node) => node.status === 'ONLINE').length;

  return (
    <>
      <PageHeader
        eyebrow="Infrastructure"
        title={t.nodes}
        subtitle={t.nodesSubtitle}
        icon="server"
        actions={
          <>
            <HelpButton title={t.help}>
              <p>{lang === 'ru' ? 'Здесь собраны ноды и их состояние. Карточка ноды показывает CPU, RAM, скорость сети и число подключений — данные приходят от агента каждые 15 секунд.' : 'Nodes and their status live here. The node card shows CPU, RAM, network speed and connections — the agent reports every 15 seconds.'}</p>
              <p>{lang === 'ru' ? 'Кнопки рядом: метрики и Ping, история конфигов, редактирование параметров мастера, проверка Cheburcheck, применение конфига, перезапуск и логи.' : 'Buttons next to the card: metrics and ping, config history, wizard parameters, Cheburcheck check, apply config, restart and logs.'}</p>
            </HelpButton>
            <Button icon="plus" variant="primary" onClick={() => { window.location.href = '/wizard'; }}>
              {t.wizard}
            </Button>
          </>
        }
      />

      {notice && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-xs text-success" role="status">
          <Icon name="checkCircle" size={15} /> {notice}
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Card className="flex items-center gap-2.5 p-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-2 text-muted"><Icon name="server" size={17} /></div>
          <div><p className="text-[11px] text-subtle">{t.totalNodesLabel}</p><p className="text-base font-semibold text-fg tabular-nums">{nodes.length}</p></div>
        </Card>
        <Card className="flex items-center gap-2.5 p-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg border border-success/25 bg-success/10 text-success"><Icon name="activity" size={17} /></div>
          <div><p className="text-[11px] text-subtle">{t.online}</p><p className="text-base font-semibold text-fg tabular-nums">{online}</p></div>
        </Card>
        <Card className="flex items-center gap-2.5 p-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg border border-warning/25 bg-warning/10 text-warning"><Icon name="pulse" size={17} /></div>
          <div><p className="text-[11px] text-subtle">{t.availability}</p><p className="text-base font-semibold text-fg tabular-nums">{nodes.length ? Math.round((online / nodes.length) * 100) : 0}%</p></div>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            aria-label={t.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.search}
            className="field pl-9"
          />
        </div>
        <Badge tone="neutral">{filteredNodes.length} / {nodes.length}</Badge>
        {lastUpdated && (
          <span className="inline-flex items-center gap-1.5 text-[10px] text-subtle">
            <span className="animate-soft-pulse h-1.5 w-1.5 rounded-full bg-success" />
            {t.lastUpdated} {new Date(lastUpdated).toLocaleTimeString()}
          </span>
        )}
      </div>

      {loading ? (
        <Card className="py-16 text-center text-xs text-muted">{t.loading}</Card>
      ) : filteredNodes.length === 0 ? (
        <Card className="py-16 text-center text-xs text-subtle">{t.noData}</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filteredNodes.map((node) => {
            const metric = node.metrics?.[0];
            const upMbps = metric ? Number((Number(metric.trafficUp) * 8 / 15 / 1_000_000).toFixed(3)) : 0;
            const downMbps = metric ? Number((Number(metric.trafficDown) * 8 / 15 / 1_000_000).toFixed(3)) : 0;
            const flag = flagFor(node.geo?.countryCode || node.location);
            return (
              <Card key={node.id} className="node-card p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-brand/30 bg-brand/10 text-brand">
                    <Icon name="server" size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {flag && <span title={node.geo?.countryCode || node.location || ''}>{flag}</span>}
                      <p className="truncate font-semibold text-fg">{node.name}</p>
                      <StatusBadge status={node.status} />
                      {node.geo?.countryCode && <Badge tone="neutral">{node.geo.countryCode}</Badge>}
                      {node.agentVersion && (
                        <Badge tone={node.agentOutdated ? 'warning' : 'success'} dot>
                          {t.agentVersion}: {node.agentVersion}
                        </Badge>
                      )}
                      {node.ipv6Enabled && node.ipv6Address && (
                        <Badge tone="cyan" dot>IPv6: {node.ipv6Address}</Badge>
                      )}
                    </div>
                    <p className="mono mt-0.5 truncate text-[10px] text-subtle">
                      {node.address}:{node.port} · {t.idLabel} {node.id.slice(0, 8)}
                    </p>
                    {node.domain && (
                      <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] text-brand">
                        <Icon name="globe" size={12} className="shrink-0" />
                        <a href={`https://${node.domain}`} target="_blank" rel="noreferrer" className="truncate hover:underline">
                          {node.domain}
                        </a>
                      </p>
                    )}
                    {(node.geo?.city || node.geo?.ip || node.geo?.asn) && (
                      <p className="mt-0.5 truncate text-[10px] text-muted">
                        {[node.geo?.city, node.geo?.ip, node.geo?.asn].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>

                {(() => {
                  const hasPing = Object.prototype.hasOwnProperty.call(pings, node.id);
                  const latency = pings[node.id];
                  const level = !hasPing ? 'idle' : latency == null ? 'down' : latency <= 100 ? 'good' : latency <= 300 ? 'fair' : 'poor';
                  const color = {
                    idle: 'text-subtle', down: 'text-danger', good: 'text-success',
                    fair: 'text-warning', poor: 'text-danger',
                  }[level];
                  const dot = {
                    idle: 'bg-subtle', down: 'bg-danger', good: 'bg-success',
                    fair: 'bg-warning', poor: 'bg-danger',
                  }[level];
                  const display = !hasPing ? '—' : latency == null ? t.unreachable : `${latency} ms`;
                  return (
                    <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                      <span className="flex items-center gap-1.5 text-subtle">
                        <Icon name="activity" size={12} /> {t.ping}
                      </span>
                      <span className={`flex items-center gap-1.5 font-semibold tabular-nums ${color}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${dot} ${level === 'good' ? 'animate-soft-pulse' : ''}`} />
                        {display}
                      </span>
                    </div>
                  );
                })()}

                {uiSettings.metricsEnabled !== false && <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1 flex justify-between text-[10px] text-subtle"><span>CPU</span><span className="tabular-nums text-fg">{metric ? Number(metric.cpu).toFixed(0) : '—'}%</span></div>
                    <ProgressBar value={metric ? Number(metric.cpu) : 0} tone={metric && Number(metric.cpu) > 85 ? 'danger' : metric && Number(metric.cpu) > 65 ? 'warning' : 'success'} />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-[10px] text-subtle"><span>RAM</span><span className="tabular-nums text-fg">{metric ? Number(metric.ram).toFixed(0) : '—'}%</span></div>
                    <ProgressBar value={metric ? Number(metric.ram) : 0} tone={metric && Number(metric.ram) > 85 ? 'danger' : metric && Number(metric.ram) > 65 ? 'warning' : 'cyan'} />
                  </div>
                </div>}

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-subtle">
                  <span className="flex items-center gap-1"><Icon name="upload" size={13} className="text-brand" /> ↑ {upMbps} Mbps</span>
                  <span className="flex items-center gap-1"><Icon name="download" size={13} className="text-cyan" /> ↓ {downMbps} Mbps</span>
                  <span className="flex items-center gap-1"><Icon name="activity" size={13} className="text-success" /> {metric?.connections ?? 0} {t.connections.toLowerCase()}</span>
                  {metric?.xrayStatus && <Badge tone={metric.xrayStatus === 'running' ? 'success' : 'danger'}>Xray {metric.xrayStatus}</Badge>}
                </div>

                <div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-3">
                  <IconButton icon="gauge" label={t.metrics} tone="brand" onClick={() => openMetrics(node)} />
                  <IconButton icon="activity" label={t.health} onClick={() => openHealth(node)} />
                  <IconButton icon="shield" label={t.cheburcheckCheck} tone="brand" onClick={() => runCheburcheck(node)} />
                  <IconButton icon="edit" label={t.edit} onClick={() => openEdit(node)} />
                  <IconButton icon="play" label={t.apply} tone="brand" onClick={() => apply(node.id)} />
                  <IconButton icon="download" label={t.updateAgent} tone="brand" onClick={() => openAgentUpdate(node)} />
                  <IconButton icon="network" label={t.ipv6Entry} tone={node.ipv6Enabled ? 'brand' : 'default'} onClick={() => openIpv6(node)} />
                  {node.agentOutdated && (
                    <Button size="sm" variant="primary" icon="refresh" loading={updatingAgentId === node.id}
                      disabled={Boolean(updatingAgentId)} onClick={() => updateAgentLatest(node)}>
                      {t.updateAgentLatest}
                    </Button>
                  )}
                  <IconButton icon="refresh" label={t.restart} onClick={() => restart(node.id)} />
                  <IconButton icon="history" label={t.revisions} onClick={() => openRevisions(node)} />
                  <IconButton icon="terminal" label={t.logs} onClick={() => openLogs(node)} />
                  <Button size="sm" variant="danger" icon="trash" className="ml-auto" onClick={() => remove(node)}>
                    {t.deleteNode}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={Boolean(revisionsNode)} onClose={() => setRevisionsNode(null)} title={`${t.revisions} — ${revisionsNode?.name || ''}`} subtitle="Version history and deployment control" size="lg">
        <SectionTitle title={t.configHistory} action={<Button size="sm" icon="play" onClick={() => applyRevision('')} loading={revisionsLoading}>{t.applyLatest}</Button>} />
        {revisionsLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted"><Icon name="refresh" size={15} className="animate-spin text-brand" />{t.loading}</div>
        ) : revisions.length === 0 ? (
          <div className="py-10 text-center text-xs text-subtle">{t.noData}</div>
        ) : (
          <div className="relative space-y-3 pl-6">
            <div className="absolute bottom-3 left-[7px] top-3 w-px bg-line" />
            {revisions.map((revision) => (
              <div key={revision.id} className="relative rounded-lg border border-line bg-surface-2/50 p-3.5">
                <span className="absolute -left-[22px] top-5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand" />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Badge tone="brand">v{revision.version}</Badge>
                    {revision.applied && <Badge tone="success" dot>{t.applied}</Badge>}
                    <span className="text-[11px] text-subtle">{new Date(revision.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" icon="play" onClick={() => applyRevision(revision.id)}>{t.apply}</Button>
                    <Button size="sm" variant="ghost" icon="history" onClick={() => rollback(revision.id)}>{t.rollback}</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(healthNode)}
        onClose={() => { setHealthNode(null); setHealth(null); }}
        title={t.nodeHealth}
        subtitle={healthNode?.name}
        icon={<Icon name="activity" size={16} />}
      >
        {healthLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted">
            <Icon name="refresh" size={15} className="animate-spin text-brand" />{t.loading}
          </div>
        ) : health ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={health.status} />
              <Badge tone={health.online ? 'success' : 'danger'} dot>{health.online ? t.online : t.offline}</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: t.lastSeen, value: health.lastSeenAt ? new Date(health.lastSeenAt).toLocaleString() : '—' },
                { label: t.cpu, value: health.latestMetric ? `${Number(health.latestMetric.cpu).toFixed(1)}%` : '—' },
                { label: t.ram, value: health.latestMetric ? `${Number(health.latestMetric.ram).toFixed(1)}%` : '—' },
                { label: t.disk, value: health.latestMetric ? `${Number(health.latestMetric.disk).toFixed(1)}%` : '—' },
                { label: t.trafficUsed, value: health.latestMetric ? formatBytes(health.latestMetric.trafficUp) : '—' },
                { label: t.connections, value: health.latestMetric ? String(health.latestMetric.connections) : '—' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-line bg-surface-2/50 p-3">
                  <p className="text-[11px] text-subtle">{item.label}</p>
                  <p className="mt-1.5 text-sm font-medium text-fg tabular-nums">{item.value}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-[11px] text-subtle">{t.lastError}</p>
              {health.lastError ? (
                <div className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/10 p-3 text-xs text-danger">
                  <Icon name="alert" size={14} className="mt-0.5 shrink-0" />{health.lastError}
                </div>
              ) : (
                <p className="text-xs text-subtle">{t.noErrors}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-subtle">{t.noData}</div>
        )}
      </Modal>

      <Modal
        open={Boolean(agentNode)}
        onClose={() => { setAgentNode(null); setAgentForm(null); setAgentResult(null); }}
        title={t.updateAgentTitle}
        subtitle={agentNode ? `${agentNode.name} · ${agentNode.agentVersion || '—'}` : undefined}
        icon={<Icon name="download" size={16} />}
        size="lg"
        footer={<>
          <Button onClick={() => { setAgentNode(null); setAgentForm(null); setAgentResult(null); }}>{t.close}</Button>
          <Button variant="primary" icon="download" form="agent-update-form" loading={agentBusy}>{t.updateNow}</Button>
        </>}
      >
        {agentForm ? (
          <form id="agent-update-form" onSubmit={submitAgentUpdate} className="space-y-4">
            <p className="text-xs text-muted">{t.updateAgentHint}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.wizardHost}>
                <input className="field" value={agentForm.host} onChange={(e) => setAgentForm({ ...agentForm, host: e.target.value })} required />
              </Field>
              <Field label={t.wizardPort}>
                <input className="field" type="number" min={1} max={65535} value={agentForm.port} onChange={(e) => setAgentForm({ ...agentForm, port: e.target.value })} required />
              </Field>
              <Field label={t.wizardUser}>
                <input className="field" value={agentForm.username} onChange={(e) => setAgentForm({ ...agentForm, username: e.target.value })} required />
              </Field>
              <Field label={t.updateAgentTarget}>
                <input className="field mono" value={agentForm.targetVersion} placeholder={`v${APP_VERSION}`} onChange={(e) => setAgentForm({ ...agentForm, targetVersion: e.target.value })} />
              </Field>
              <Field label={t.wizardFingerprint} hint={t.wizardFingerprintHint}>
                <input className="field mono text-[11px]" value={agentForm.hostKeyFingerprint} onChange={(e) => setAgentForm({ ...agentForm, hostKeyFingerprint: e.target.value })} placeholder="SHA256:..." required />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.wizardPassword} hint={t.secretNeverStored}>
                <input className="field" type="password" autoComplete="new-password" value={agentForm.password} onChange={(e) => setAgentForm({ ...agentForm, password: e.target.value })} />
              </Field>
              <Field label={t.wizardPassphrase} hint={t.secretNeverStored}>
                <input className="field" type="password" autoComplete="off" value={agentForm.passphrase} onChange={(e) => setAgentForm({ ...agentForm, passphrase: e.target.value })} />
              </Field>
            </div>
            <Field label={t.wizardKey} hint={t.secretNeverStored}>
              <textarea className="field mono min-h-24 text-[11px]" value={agentForm.privateKey} onChange={(e) => setAgentForm({ ...agentForm, privateKey: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={agentForm.useSudo} onChange={(e) => setAgentForm({ ...agentForm, useSudo: e.target.checked })} />
              sudo
            </label>

            {agentResult && (
              <div className="space-y-2 border-t border-line pt-4">
                <div className={`flex items-center gap-2 text-xs ${agentResult.updated ? 'text-success' : 'text-danger'}`}>
                  <Icon name={agentResult.updated ? 'checkCircle' : 'alert'} size={14} />
                  {agentResult.updated ? t.updateAgentDone : (agentResult.error || t.updateAgentFailed)}
                </div>
                {agentResult.output && (
                  <>
                    <p className="text-[11px] uppercase tracking-wider text-subtle">{t.updateAgentOutput}</p>
                    <CodeBlock className="max-h-56">{agentResult.output}</CodeBlock>
                  </>
                )}
              </div>
            )}
          </form>
        ) : (
          <div className="py-10 text-center text-xs text-subtle"><Icon name="refresh" size={15} className="mx-auto animate-spin text-brand" /></div>
        )}
      </Modal>

      <Modal
        open={Boolean(logsNode)}
        onClose={() => { setLogsNode(null); setLogsData(null); }}
        title={t.logs}
        subtitle={logsNode?.name}
        icon={<Icon name="server" size={16} />}
        size="lg"
      >
        {logsLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted">
            <Icon name="refresh" size={15} className="animate-spin text-brand" />{t.loading}
          </div>
        ) : logsData?.logs?.length ? (
          <div className="mono max-h-[60vh] space-y-1 overflow-y-auto rounded-lg border border-line bg-app/70 p-3 text-[11px] leading-relaxed">
            {logsData.logs.map((entry, index) => (
              <div key={`${entry.timestamp}-${index}`} className="flex gap-3">
                <span className="shrink-0 text-subtle">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                <span className={entry.level === 'error' ? 'shrink-0 text-danger' : entry.level === 'warn' ? 'shrink-0 text-warning' : 'shrink-0 text-brand'}>
                  {entry.level.toUpperCase()}
                </span>
                <span className="min-w-0 break-all text-muted">{entry.message}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-subtle">{t.noLogs}</div>
        )}
      </Modal>


      <Modal
        open={Boolean(editNodeId)}
        onClose={() => { setEditNodeId(null); setEditData(null); }}
        title={t.editNode}
        subtitle={editData?.name || undefined}
        icon={<Icon name="edit" size={16} />}
        size="lg"
        footer={<>
          <Button onClick={() => { setEditNodeId(null); setEditData(null); }}>{t.cancel}</Button>
          <Button variant="primary" icon="check" form="edit-node-form" loading={editBusy}>{t.save}</Button>
        </>}
      >
        {editData ? (
          <form id="edit-node-form" onSubmit={saveEdit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.name}>
                <input className="field" value={editData.name || ''} onChange={(e) => setEditData({ ...editData, name: e.target.value })} required />
              </Field>
              <Field label={t.wizardHost}>
                <input className="field" value={editData.address || ''} onChange={(e) => setEditData({ ...editData, address: e.target.value })} required />
              </Field>
              <Field label={t.wizardLocation}>
                <select className="field" value={editData.location || ''} onChange={(e) => setEditData({ ...editData, location: e.target.value || null })}>
                  <option value="">—</option>
                  {COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.flag} {countryNames.of(country.code)} ({country.code})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t.wizardAuthMode}>
                <select className="field" value={editData.authMode || 'key'} onChange={(e) => setEditData({ ...editData, authMode: e.target.value })}>
                  <option value="key">{t.wizardKey}</option>
                  <option value="password">{t.wizardPassword}</option>
                  <option value="password_key">{t.wizardPassword} + {t.wizardKey}</option>
                </select>
              </Field>
              <Field label={t.wizardUser}>
                <input className="field" value={editData.sshUser || ''} onChange={(e) => setEditData({ ...editData, sshUser: e.target.value })} />
              </Field>
              <Field label={t.wizardPort}>
                <input className="field" type="number" min={1} max={65535} value={editData.sshPort ?? 22} onChange={(e) => setEditData({ ...editData, sshPort: e.target.value })} />
              </Field>
              <Field label={t.wizardIpv4}>
                <input className="field" value={editData.ipv4 || ''} onChange={(e) => setEditData({ ...editData, ipv4: e.target.value })} />
              </Field>
              <Field label={t.wizardIpv6}>
                <input className="field" value={editData.ipv6 || ''} onChange={(e) => setEditData({ ...editData, ipv6: e.target.value })} />
              </Field>
              <Field label={t.wizardUserDomain}>
                <input className="field" value={editData.userDomain || ''} onChange={(e) => setEditData({ ...editData, userDomain: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.wizardPassword} hint={t.keepSecret}>
                <input className="field" type="password" autoComplete="new-password" value={editData.password || ''} onChange={(e) => setEditData({ ...editData, password: e.target.value })} />
              </Field>
              <Field label={t.wizardKey} hint={t.keepSecret}>
                <textarea className="field mono min-h-20 text-[11px]" value={editData.privateKey || ''} onChange={(e) => setEditData({ ...editData, privateKey: e.target.value })} />
              </Field>
              <Field label={t.wizardPassphrase} hint={t.keepSecret}>
                <input className="field" type="password" autoComplete="off" value={editData.passphrase || ''} onChange={(e) => setEditData({ ...editData, passphrase: e.target.value })} />
              </Field>
            </div>
          </form>
        ) : (
          <div className="py-10 text-center text-xs text-subtle"><Icon name="refresh" size={15} className="mx-auto animate-spin text-brand" /></div>
        )}
      </Modal>

      <Modal
        open={Boolean(metricsNode)}
        onClose={() => { setMetricsNode(null); setMetricsData(null); }}
        title={t.metrics}
        subtitle={metricsNode?.name}
        icon={<Icon name="gauge" size={16} />}
      >
        {metricsLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted">
            <Icon name="refresh" size={15} className="animate-spin text-brand" />{t.loading}
          </div>
        ) : metricsData ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={metricsData.status} />
              <Badge tone={metricsData.xray === 'running' ? 'success' : 'danger'} dot>
                {t.xrayStatus}: {metricsData.xray}
              </Badge>
              <Badge tone={metricsData.ping?.reachable ? 'success' : 'danger'} dot>
                {t.ping}: {metricsData.ping?.reachable ? `${metricsData.ping.latencyMs} ms` : t.unreachable}
              </Badge>
            </div>
            <div>
              <p className="mb-2 text-[11px] text-subtle">{t.networkSpeed}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: t.upload, value: `${metricsData.network?.uploadMbps ?? 0} Mbps` },
                  { label: t.download, value: `${metricsData.network?.downloadMbps ?? 0} Mbps` },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-line bg-surface-2/50 p-3">
                    <p className="text-[11px] text-subtle">{item.label}</p>
                    <p className="mt-1 text-sm font-semibold text-fg tabular-nums">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-subtle">{t.noData}</div>
        )}
      </Modal>


      <Modal
        open={Boolean(checkNode)}
        onClose={() => { setCheckNode(null); setCheckData(null); }}
        title={t.cheburcheck}
        subtitle={checkNode?.address}
        icon={<Icon name="shield" size={16} />}
        size="lg"
        footer={<Button onClick={() => { setCheckNode(null); setCheckData(null); }}>{t.close}</Button>}
      >
        {checkBusy && (
          <div className="flex flex-col items-center gap-5 py-6">
            <div className="cheb-radar"><span /><span /><span /><i /></div>
            <p className="text-sm font-medium text-fg">{t.cheburcheckChecking}</p>
            <div className="w-full max-w-md space-y-2">
              {[t.cheburcheckStep1, t.cheburcheckStep2, t.cheburcheckStep3].map((label, index) => (
                <div key={label} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all ${checkStep >= index + 1 ? 'border-brand/30 bg-brand/10 text-fg' : 'border-line bg-surface-2 text-subtle'}`}>
                  <span className={`grid h-5 w-5 place-items-center rounded-full border ${checkStep > index + 1 ? 'border-success/40 bg-success/20 text-success' : checkStep === index + 1 ? 'border-brand/40 bg-brand/20 text-brand' : 'border-line text-subtle'}`}>
                    {checkStep > index + 1 ? '✓' : index + 1}
                  </span>
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}

        {!checkBusy && checkData && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={checkData.blocked ? 'danger' : 'success'} dot>
                {checkData.blocked ? t.cheburcheckBlocked : t.cheburcheckOk}
              </Badge>
              <Badge tone="brand">{t.cheburcheckVerdict}: {checkData.verdict}</Badge>
              <Badge tone="neutral">{checkData.targetType || '—'}</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-surface-2/50 p-3">
                <p className="text-[11px] text-subtle">{t.cheburcheckTarget}</p>
                <p className="mono mt-1 text-sm text-fg">{checkData.target}</p>
                <p className="mt-1 text-[11px] text-muted">{checkData.ips?.join(', ') || '—'}</p>
              </div>
              <div className="rounded-lg border border-line bg-surface-2/50 p-3">
                <p className="text-[11px] text-subtle">{t.cheburcheckGeo}</p>
                <p className="mt-1 text-sm text-fg">{checkData.geo?.location || '—'}</p>
                <p className="mt-1 text-[11px] text-muted">{checkData.geo?.organisation || ''} {checkData.geo?.asn || ''}</p>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] text-subtle">{t.cheburcheckProbes}</p>
                <Badge tone="neutral">{checkData.probes?.length || 0}</Badge>
              </div>
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {(checkData.probes || []).map((probe: any, index: number) => (
                  <div key={`${probe.probeId}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2 text-muted">
                      <span className="mono text-brand">#{probe.probeId}</span>
                      <span>{probe.region || '—'}</span>
                      <span>{probe.provider || ''}</span>
                      <span className="mono">{probe.asn || ''}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(probe.verdicts || []).map((verdict: string) => (
                        <Badge key={verdict} tone={verdict === 'ok' ? 'success' : verdict === 'uncertain' ? 'warning' : 'danger'}>{verdict}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
                {!checkData.probes?.length && <p className="py-4 text-center text-xs text-subtle">{checkData.probeError || t.noData}</p>}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(ipv6Node)} onClose={() => setIpv6Node(null)} title={t.ipv6Entry}
        subtitle={ipv6Node?.name} icon={<Icon name="network" size={16} />} size="lg"
        footer={<>
          <Button onClick={() => setIpv6Node(null)}>{t.close}</Button>
          <Button onClick={checkIpv6} loading={ipv6Busy} disabled={!ipv6Selected}>{t.check}</Button>
          {ipv6Node?.ipv6Enabled
            ? <Button variant="danger" onClick={() => saveIpv6(false)} loading={ipv6Busy}>{t.disable}</Button>
            : <Button variant="primary" onClick={() => saveIpv6(true)} loading={ipv6Busy} disabled={!ipv6Selected}>{t.enable}</Button>}
        </>}>
        <div className="space-y-4">
          <p className="text-xs text-muted">{t.ipv6EntryHint}</p>
          <div className="flex min-h-10 items-center rounded-lg border border-line bg-surface-2/40 px-3">
            <Toggle checked={clientIpv6} onChange={saveClientIpv6} label={t.clientIpv6} className="w-full justify-between gap-3" />
          </div>
          <p className="text-[11px] text-subtle">{t.clientIpv6Hint}</p>
          <Field label={t.ipv6Address} hint={t.ipv6AddressHint}>
            {ipv6Addresses.length ? (
              <select className="field" value={ipv6Selected} onChange={(e) => setIpv6Selected(e.target.value)}>
                <option value="">—</option>
                {ipv6Addresses.map((address) => <option key={address} value={address}>{address}</option>)}
              </select>
            ) : (
              <input className="field mono" value={ipv6Selected} onChange={(e) => setIpv6Selected(e.target.value)} placeholder="2001:db8::1" />
            )}
          </Field>
          {ipv6Check && (
            <div className={`rounded-lg border px-3 py-2 text-xs ${ipv6Check.reachable ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger'}`}>
              {ipv6Check.reachable ? t.ipv6CheckOk : t.ipv6CheckFail}
              <span className="mono ml-2">{(ipv6Check.results || []).map((r: any) => `${r.port}:${r.reachable ? 'OK' : '—'}`).join(' ')}</span>
            </div>
          )}
          {ipv6Node?.ipv6LastError && <p className="text-xs text-danger">{ipv6Node.ipv6LastError}</p>}
        </div>
      </Modal>

    </>
  );
}