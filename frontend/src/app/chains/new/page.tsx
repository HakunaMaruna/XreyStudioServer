'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../../lib/api';
import { useLang } from '../../../lib/i18n';
import { Icon, type IconName } from '../../../components/icons';
import {
  Badge, Button, Card, EmptyState, Field, IconButton, Modal, PageHeader,
} from '../../../components/ui';

type ChainExit = {
  id?: string;
  nodeId: string;
  nodeName?: string;
  port?: number | string;
  priority?: number | string;
  status?: string | null;
};

type ChainBinding = {
  id: string;
  userId?: string;
  userEmail?: string;
  squadId?: string;
  squadName?: string;
};

type ChainRow = {
  id: string;
  name: string;
  status?: string | null;
  routingMode: 'all' | 'rules';
  routingRules?: Record<string, unknown>[];
  bridgeMode?: 'auto' | 'direct' | 'bridge';
  entryNode?: { id: string; name: string } | null;
  exits: ChainExit[];
  bindings: ChainBinding[];
  createdAt?: string;
};

type NodeOption = { id: string; name: string; status?: string | null };
type UserOption = { id: string; email: string };
type SquadOption = { id: string; name: string };

type ExitDraft = { key: string; nodeId: string; port: string; priority: string };
type ChainDraft = {
  name: string;
  entryNodeId: string;
  routingMode: 'all' | 'rules';
  bridgeMode: 'auto' | 'direct' | 'bridge';
  routingRulesText: string;
  exits: ExitDraft[];
};
type FormErrors = Record<string, string>;

function asRows<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['items', 'data']) {
      if (Array.isArray(obj[key])) return obj[key] as T[];
    }
  }
  return [];
}

const newKey = () => Math.random().toString(36).slice(2);
const newExit = (): ExitDraft => ({ key: newKey(), nodeId: '', port: '', priority: '1' });
const emptyDraft = (): ChainDraft => ({
  name: '',
  entryNodeId: '',
  routingMode: 'all',
  bridgeMode: 'auto',
  routingRulesText: '[]',
  exits: [newExit()],
});

function ChainStatusBadge({ status, fallback }: { status?: string | null; fallback: string }) {
  const value = String(status || '').toUpperCase();
  const tone: 'success' | 'danger' | 'neutral' = [
    'ONLINE', 'ACTIVE', 'HEALTHY', 'APPLIED', 'ENABLED', 'READY', 'OK',
  ].includes(value)
    ? 'success'
    : ['OFFLINE', 'ERROR', 'DISABLED', 'FAILED', 'BROKEN'].includes(value)
      ? 'danger'
      : 'neutral';
  return <Badge tone={tone} dot>{status || fallback}</Badge>;
}

function SchemaBlock({
  icon,
  label,
  value,
  status,
  fallback,
  meta,
}: {
  icon: IconName;
  label: string;
  value: string;
  status?: string | null;
  fallback: string;
  meta?: string;
}) {
  return (
    <div className="w-full min-w-0 rounded-lg border border-line bg-surface-2/60 p-3 @lg:w-auto @lg:flex-1 @lg:basis-[150px] @lg:max-w-[220px]">
      <div className="flex items-center gap-1.5 text-[11px] text-subtle">
        <Icon name={icon} size={12} /> {label}
      </div>
      <p className="mt-2 truncate text-xs font-medium text-fg" title={value}>{value}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ChainStatusBadge status={status} fallback={fallback} />
        {meta && <span className="mono text-[10px] text-subtle">{meta}</span>}
      </div>
    </div>
  );
}

function SchemaArrow() {
  return (
    <div className="flex w-5 shrink-0 rotate-90 items-center justify-center self-center text-subtle @lg:rotate-0" aria-hidden="true">
      <Icon name="chevronRight" size={16} />
    </div>
  );
}

export default function ChainsPage() {
  const { t } = useLang();
  const [chains, setChains] = useState<ChainRow[]>([]);
  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [squads, setSquads] = useState<SquadOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ChainRow | null>(null);
  const [deleting, setDeleting] = useState<ChainRow | null>(null);
  const [draft, setDraft] = useState<ChainDraft>(emptyDraft);
  const [errors, setErrors] = useState<FormErrors>({});

  const [bindChain, setBindChain] = useState<ChainRow | null>(null);
  const [bindForm, setBindForm] = useState({ userId: '', squadId: '' });
  const [bindError, setBindError] = useState('');

  const loadChains = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get<{ items?: ChainRow[] } | ChainRow[]>('/api/chains');
      setChains(asRows<ChainRow>(data));
    } catch (e: any) {
      setChains([]);
      setError(String(e?.message || ''));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOptions = useCallback(async () => {
    // Squads are optional: a failure must not block the page.
    const [nodesResult, usersResult, squadsResult] = await Promise.allSettled([
      api.get('/api/nodes'),
      api.get('/api/users?limit=200'),
      api.get('/api/squads?limit=200'),
    ]);
    if (nodesResult.status === 'fulfilled') {
      setNodes(
        asRows<Record<string, any>>(nodesResult.value).map((node) => ({
          id: String(node.id),
          name: String(node.name ?? node.id),
          status: node.status ? String(node.status) : null,
        })),
      );
    }
    if (usersResult.status === 'fulfilled') {
      setUsers(
        asRows<Record<string, any>>(usersResult.value).map((user) => ({
          id: String(user.id),
          email: String(user.email ?? user.id),
        })),
      );
    }
    if (squadsResult.status === 'fulfilled') {
      setSquads(
        asRows<Record<string, any>>(squadsResult.value).map((squad) => ({
          id: String(squad.id),
          name: String(squad.name ?? squad.id),
        })),
      );
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    void loadChains();
    void loadOptions();
  }, [loadChains, loadOptions]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2500);
  };

  const closeForm = () => {
    setCreateOpen(false);
    setEditing(null);
    setErrors({});
  };

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setErrors({});
    setCreateOpen(true);
  };

  const openEdit = (chain: ChainRow) => {
    setEditing(chain);
    setDraft({
      name: chain.name || '',
      entryNodeId: chain.entryNode?.id || '',
      routingMode: chain.routingMode === 'rules' ? 'rules' : 'all',
      bridgeMode: chain.bridgeMode || 'auto',
      routingRulesText: JSON.stringify(chain.routingRules || [], null, 2),
      exits: chain.exits?.length
        ? chain.exits.map((exit) => ({
            key: newKey(),
            nodeId: exit.nodeId || '',
            port: exit.port === undefined || exit.port === null ? '' : String(exit.port),
            priority: exit.priority === undefined || exit.priority === null ? '' : String(exit.priority),
          }))
        : [newExit()],
    });
    setErrors({});
  };

  const validate = () => {
    const next: FormErrors = {};
    if (!draft.name.trim()) next.name = t.chainNameRequired;
    if (!draft.entryNodeId) next.entryNodeId = t.chainEntryRequired;
    if (!draft.exits.length) next.exits = t.chainNoExits;
    draft.exits.forEach((exit) => {
      if (!exit.nodeId) next[`exit-${exit.key}-node`] = t.chainExitRequired;
      if (exit.port && (!/^\d+$/.test(exit.port) || Number(exit.port) < 1 || Number(exit.port) > 65535)) {
        next[`exit-${exit.key}-port`] = t.chainPortInvalid;
      }
      if (exit.priority && (!/^\d+$/.test(exit.priority) || Number(exit.priority) < 0)) {
        next[`exit-${exit.key}-priority`] = t.chainPriorityInvalid;
      }
    });
    if (draft.routingMode === 'rules') {
      try {
        const parsed = JSON.parse(draft.routingRulesText || '[]');
        if (!Array.isArray(parsed)) next.routingRules = t.chainRoutingRulesInvalid;
      } catch {
        next.routingRules = t.chainRoutingRulesInvalid;
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        name: draft.name.trim(),
        entryNodeId: draft.entryNodeId,
        routingMode: draft.routingMode,
        bridgeMode: draft.bridgeMode,
        exits: draft.exits.map((exit) => ({
          nodeId: exit.nodeId,
          ...(exit.port ? { port: Number(exit.port) } : {}),
          ...(exit.priority !== '' ? { priority: Number(exit.priority) } : {}),
        })),
      };
      if (draft.routingMode === 'rules') {
        body.routingRules = JSON.parse(draft.routingRulesText || '[]');
      }
      if (editing) {
        await api.patch(`/api/chains/${encodeURIComponent(editing.id)}`, body);
      } else {
        await api.post('/api/chains', body);
      }
      closeForm();
      await loadChains();
    } catch (e: any) {
      setError(String(e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const removeChain = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await api.delete(`/api/chains/${encodeURIComponent(deleting.id)}`);
      setDeleting(null);
      await loadChains();
    } catch (e: any) {
      setError(String(e?.message || ''));
    } finally {
      setBusyId(null);
    }
  };

  const applyChain = async (chain: ChainRow) => {
    setBusyId(chain.id);
    setError('');
    try {
      await api.post(`/api/chains/${encodeURIComponent(chain.id)}/apply`);
      flash(t.chainApplyDone);
      await loadChains();
    } catch (e: any) {
      setError(String(e?.message || ''));
    } finally {
      setBusyId(null);
    }
  };

  const openBind = (chain: ChainRow) => {
    setBindChain(chain);
    setBindForm({ userId: '', squadId: '' });
    setBindError('');
  };

  const saveBinding = async () => {
    if (!bindChain) return;
    if (!bindForm.userId && !bindForm.squadId) {
      setBindError(t.chainBindingRequired);
      return;
    }
    setBusyId(bindChain.id);
    try {
      await api.post(
        `/api/chains/${encodeURIComponent(bindChain.id)}/bind`,
        bindForm.userId ? { userId: bindForm.userId } : { squadId: bindForm.squadId },
      );
      setBindChain(null);
      await loadChains();
    } catch (e: any) {
      setBindError(String(e?.message || ''));
    } finally {
      setBusyId(null);
    }
  };

  const removeBinding = async (chain: ChainRow, bindingId: string) => {
    setBusyId(chain.id);
    try {
      await api.delete(
        `/api/chains/${encodeURIComponent(chain.id)}/bind/${encodeURIComponent(bindingId)}`,
      );
      await loadChains();
    } catch (e: any) {
      setError(String(e?.message || ''));
    } finally {
      setBusyId(null);
    }
  };

  const nodeStatus = (id?: string | null) => nodes.find((node) => node.id === id)?.status;

  return (
    <>
      <PageHeader
        eyebrow={t.infrastructure}
        title={t.chains}
        subtitle={t.chainsSubtitle}
        icon="route"
        actions={
          <>
            <Button icon="refresh" size="sm" onClick={loadChains} loading={loading}>{t.refresh}</Button>
            <Button icon="plus" variant="primary" onClick={openCreate}>{t.chainNew}</Button>
          </>
        }
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger" role="alert">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs text-success" role="status">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="grid gap-3" aria-busy="true" aria-label={t.loading}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="panel ui-card-pad animate-pulse">
              <div className="h-4 w-1/2 rounded bg-surface-3" />
              <div className="mt-3 h-3 w-2/3 rounded bg-surface-3/70" />
              <div className="mt-6 grid grid-cols-3 gap-2">
                <div className="h-14 rounded-lg bg-surface-3/70" />
                <div className="h-14 rounded-lg bg-surface-3/70" />
                <div className="h-14 rounded-lg bg-surface-3/70" />
              </div>
              <div className="mt-5 h-8 rounded-lg bg-surface-3/60" />
            </div>
          ))}
        </div>
      ) : chains.length === 0 ? (
        <Card>
          <EmptyState icon="route" title={t.chainNoChains} description={t.chainNoChainsHint} />
        </Card>
      ) : (
        <div className="grid gap-3">
          {chains.map((chain) => (
            <Card key={chain.id} className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[13px] font-semibold text-fg">{chain.name}</h3>
                    <ChainStatusBadge status={chain.status} fallback={t.chainBadge} />
                    <Badge tone="cyan">
                      {chain.routingMode === 'rules' ? t.chainRoutingRules : t.chainRoutingAll}
                    </Badge>
                    {chain.bridgeMode === 'bridge' && <Badge tone="brand">{t.chainBridgeReverse}</Badge>}
                  </div>
                  <p className="mono mt-1 truncate text-[10px] text-subtle">{chain.id}</p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <IconButton icon="edit" label={t.edit} onClick={() => openEdit(chain)} />
                  <IconButton icon="trash" label={t.delete} tone="danger" onClick={() => setDeleting(chain)} />
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-medium text-subtle">
                  {t.chainSchemaHint}
                </p>
                <div className="panel @container rounded-[var(--radius-lg)] bg-app/40 p-3">
                  <div className="flex flex-col items-stretch gap-1 @lg:flex-row @lg:flex-wrap">
                    <SchemaBlock
                      icon="users"
                      label={t.chainClient}
                      value={String(chain.bindings?.length || 0)}
                      status={chain.bindings?.length ? 'ACTIVE' : null}
                      fallback={t.chainNoBindings}
                    />
                    <SchemaArrow />
                    <SchemaBlock
                      icon="globe"
                      label={t.chainEntry}
                      value={chain.entryNode?.name || t.noNode}
                      status={nodeStatus(chain.entryNode?.id)}
                      fallback={t.notConfigured}
                      meta={chain.entryNode ? chain.entryNode.id.slice(0, 6) : undefined}
                    />
                    {chain.exits?.map((exit, index) => (
                      <div key={exit.id || `${exit.nodeId}-${index}`} className="flex min-w-0 items-stretch gap-1 @lg:flex-1 @lg:basis-[150px]">
                        <SchemaArrow />
                        <SchemaBlock
                          icon="network"
                          label={`${t.chainExit} ${index + 1}`}
                          value={exit.nodeName || exit.nodeId || t.noNode}
                          status={exit.status}
                          fallback={t.notConfigured}
                          meta={exit.port ? String(exit.port) : undefined}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <Button
                  size="sm"
                  icon="checkCircle"
                  loading={busyId === chain.id}
                  onClick={() => applyChain(chain)}
                >
                  {t.apply}
                </Button>
                <Button size="sm" icon="link" onClick={() => openBind(chain)}>{t.chainBind}</Button>
                <Button size="sm" icon="refresh" onClick={loadChains} loading={loading}>{t.refresh}</Button>
                <div className="ml-auto flex max-w-full flex-wrap justify-end gap-1.5">
                  {chain.bindings?.length
                    ? chain.bindings.map((binding) => (
                        <span
                          key={binding.id}
                          className="inline-flex max-w-[160px] items-center gap-1 rounded-lg border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted"
                        >
                          <Icon name="users" size={10} className="shrink-0" />
                          <span className="truncate">{binding.userEmail || binding.squadName || t.chainBadge}</span>
                          <button
                            type="button"
                            aria-label={t.chainUnbind}
                            title={t.chainUnbind}
                            className="shrink-0 text-subtle hover:text-danger"
                            onClick={() => removeBinding(chain, binding.id)}
                          >
                            <Icon name="close" size={10} />
                          </button>
                        </span>
                      ))
                    : <span className="text-[11px] text-subtle">{t.chainNoBindings}</span>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={createOpen || Boolean(editing)}
        onClose={closeForm}
        title={editing ? t.chainEdit : t.chainNew}
        subtitle={t.chainsSubtitle}
        icon={<Icon name="route" size={16} />}
        size="lg"
        footer={
          <>
            <Button onClick={closeForm}>{t.cancel}</Button>
            <Button variant="primary" icon="check" loading={saving} onClick={save}>{t.save}</Button>
          </>
        }
      >
        <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-4">
          {error && <p className="text-xs text-danger" role="alert">{error}</p>}
          <div>
            <Field label={t.name}>
              <input
                className="field"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                aria-invalid={Boolean(errors.name)}
              />
            </Field>
            {errors.name && <p className="mt-1 text-[11px] text-danger">{errors.name}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Field label={t.chainEntryNode}>
                <select
                  className="field"
                  value={draft.entryNodeId}
                  onChange={(event) => setDraft({ ...draft, entryNodeId: event.target.value })}
                  aria-invalid={Boolean(errors.entryNodeId)}
                >
                  <option value="">—</option>
                  {nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
                </select>
              </Field>
              {errors.entryNodeId && <p className="mt-1 text-[11px] text-danger">{errors.entryNodeId}</p>}
            </div>
            <Field label={t.chainBridgeMode}>
              <select
                className="field"
                value={draft.bridgeMode}
                onChange={(event) => setDraft({ ...draft, bridgeMode: event.target.value as 'auto' | 'direct' | 'bridge' })}
              >
                <option value="auto">{t.chainBridgeAuto}</option>
                <option value="direct">{t.chainBridgeDirect}</option>
                <option value="bridge">{t.chainBridgeReverse}</option>
              </select>
            </Field>
            <Field label={t.chainRoutingMode}>
              <select
                className="field"
                value={draft.routingMode}
                onChange={(event) => setDraft({ ...draft, routingMode: event.target.value as 'all' | 'rules' })}
              >
                <option value="all">{t.chainRoutingAll}</option>
                <option value="rules">{t.chainRoutingRules}</option>
              </select>
            </Field>
            {draft.routingMode === 'rules' && (
              <div className="sm:col-span-2">
                <Field label={t.chainRoutingRulesJson} hint={t.chainRoutingRulesHint}>
                  <textarea
                    className="field mono min-h-32 text-[11px]"
                    value={draft.routingRulesText}
                    onChange={(event) => setDraft({ ...draft, routingRulesText: event.target.value })}
                  />
                </Field>
                {errors.routingRules && <p className="mt-1 text-[11px] text-danger">{errors.routingRules}</p>}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-subtle">{t.chainExitNodes}</span>
              <Button size="sm" icon="plus" onClick={() => setDraft({ ...draft, exits: [...draft.exits, newExit()] })}>
                {t.chainAddExit}
              </Button>
            </div>
            <div className="space-y-2">
              {draft.exits.map((exit, index) => (
                <div key={exit.key} className="rounded-lg border border-line bg-surface-2/50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-muted">{t.chainExit} {index + 1}</span>
                    <IconButton
                      icon="trash"
                      label={t.delete}
                      tone="danger"
                      disabled={draft.exits.length === 1}
                      onClick={() => setDraft({ ...draft, exits: draft.exits.filter((item) => item.key !== exit.key) })}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1.6fr_0.7fr_0.7fr]">
                    <div>
                      <Field label={t.node}>
                        <select
                          className="field"
                          value={exit.nodeId}
                          onChange={(event) => setDraft({
                            ...draft,
                            exits: draft.exits.map((item) => item.key === exit.key ? { ...item, nodeId: event.target.value } : item),
                          })}
                          aria-invalid={Boolean(errors[`exit-${exit.key}-node`])}
                        >
                          <option value="">—</option>
                          {nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
                        </select>
                      </Field>
                      {errors[`exit-${exit.key}-node`] && (
                        <p className="mt-1 text-[11px] text-danger">{errors[`exit-${exit.key}-node`]}</p>
                      )}
                    </div>
                    <div>
                      <Field label={t.port}>
                        <input
                          type="number"
                          min={1}
                          max={65535}
                          className="field"
                          value={exit.port}
                          onChange={(event) => setDraft({
                            ...draft,
                            exits: draft.exits.map((item) => item.key === exit.key ? { ...item, port: event.target.value } : item),
                          })}
                          aria-invalid={Boolean(errors[`exit-${exit.key}-port`])}
                        />
                      </Field>
                      {errors[`exit-${exit.key}-port`] && (
                        <p className="mt-1 text-[11px] text-danger">{errors[`exit-${exit.key}-port`]}</p>
                      )}
                    </div>
                    <div>
                      <Field label={t.chainPriority}>
                        <input
                          type="number"
                          min={0}
                          className="field"
                          value={exit.priority}
                          onChange={(event) => setDraft({
                            ...draft,
                            exits: draft.exits.map((item) => item.key === exit.key ? { ...item, priority: event.target.value } : item),
                          })}
                          aria-invalid={Boolean(errors[`exit-${exit.key}-priority`])}
                        />
                      </Field>
                      {errors[`exit-${exit.key}-priority`] && (
                        <p className="mt-1 text-[11px] text-danger">{errors[`exit-${exit.key}-priority`]}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {errors.exits && <p className="mt-1 text-[11px] text-danger">{errors.exits}</p>}
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(bindChain)}
        onClose={() => setBindChain(null)}
        title={bindChain?.name || t.chainBind}
        subtitle={t.chainBindUsers}
        icon={<Icon name="link" size={16} />}
        footer={
          <>
            <Button onClick={() => setBindChain(null)}>{t.cancel}</Button>
            <Button variant="primary" icon="link" loading={busyId === bindChain?.id} onClick={saveBinding}>
              {t.chainBind}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t.users}>
            <select
              className="field"
              value={bindForm.userId}
              onChange={(event) => setBindForm({ userId: event.target.value, squadId: '' })}
            >
              <option value="">—</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
            </select>
          </Field>
          {squads.length > 0 && (
            <Field label={t.chainBindUsers}>
              <select
                className="field"
                value={bindForm.squadId}
                onChange={(event) => setBindForm({ userId: '', squadId: event.target.value })}
              >
                <option value="">—</option>
                {squads.map((squad) => <option key={squad.id} value={squad.id}>{squad.name}</option>)}
              </select>
            </Field>
          )}
          {bindError && <p className="text-[11px] text-danger">{bindError}</p>}
        </div>
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={t.delete}
        subtitle={deleting?.name}
        icon={<Icon name="trash" size={16} />}
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>{t.cancel}</Button>
            <Button variant="danger" icon="trash" loading={busyId === deleting?.id} onClick={removeChain}>
              {t.delete}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{t.chainDeleteConfirm}</p>
      </Modal>
    </>
  );
}
