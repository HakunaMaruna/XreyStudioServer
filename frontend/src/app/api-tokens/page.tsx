// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang, type Dict } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import {
  Badge,
  Button,
  Card,
  Field,
  IconButton,
  Modal,
  PageHeader,
  Toggle,
} from '../../components/ui';

type Scope = 'MONITOR' | 'NODE_SYNC' | 'NOTIFICATIONS' | 'USERS_READ' | 'NODE_DOMAIN';
type TokenRow = {
  id: string;
  name: string;
  scopes: Scope[];
  userId: string;
  organizationId: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};
type RouteRow = {
  id: string;
  event: string;
  channel: string;
  enabled: boolean;
  organizationId: string | null;
};

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

const SCOPES: Scope[] = ['MONITOR', 'NODE_SYNC', 'NOTIFICATIONS', 'USERS_READ', 'NODE_DOMAIN'];
const EVENTS = [
  'NODE_OFFLINE',
  'NODE_ONLINE',
  'TRAFFIC_ALERT',
  'USER_EXPIRED',
  'BACKUP_FAILED',
  'CONFIG_APPLIED',
];
const CHANNELS = ['TELEGRAM', 'WEBHOOK', 'EMAIL'];

const scopeKey: Record<Scope, keyof Dict> = {
  MONITOR: 'tokenScopeMonitor',
  NODE_SYNC: 'tokenScopeNodeSync',
  NOTIFICATIONS: 'tokenScopeNotifications',
  USERS_READ: 'tokenScopeUsersRead',
  NODE_DOMAIN: 'tokenScopeNodeDomain',
};
const eventKey: Record<string, keyof Dict> = {
  NODE_OFFLINE: 'eventNodeOffline',
  NODE_ONLINE: 'eventNodeOnline',
  TRAFFIC_ALERT: 'eventTrafficAlert',
  USER_EXPIRED: 'eventUserExpired',
  BACKUP_FAILED: 'eventBackupFailed',
  CONFIG_APPLIED: 'eventConfigApplied',
  PAYMENT_RECEIVED: 'eventPaymentReceived',
};
const channelKey: Record<string, keyof Dict> = {
  TELEGRAM: 'channelTelegram',
  WEBHOOK: 'channelWebhook',
  EMAIL: 'channelEmail',
};

function formatDate(value: string | null, locale: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function ApiTokensPage() {
  const { t, lang } = useLang();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Scope[]>(['MONITOR']);
  const [expiresInDays, setExpiresInDays] = useState('');
  const [createdToken, setCreatedToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [tokenData, routeData] = await Promise.all([
        api.get<TokenRow[]>('/api/api-tokens'),
        api.get<RouteRow[]>('/api/notification-routes'),
      ]);
      setTokens(Array.isArray(tokenData) ? tokenData : []);
      setRoutes(Array.isArray(routeData) ? routeData : []);
    } catch (e) {
      setError(errorMessage(e, 'Failed to load'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) return;
    void load();
  }, [load]);

  const routeMap = useMemo(() => {
    const map = new Map<string, RouteRow>();
    routes.forEach((r) => map.set(`${r.event}:${r.channel}`, r));
    return map;
  }, [routes]);

  const toggleScope = (scope: Scope) => {
    setSelected((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const create = async () => {
    setError('');
    setCreating(true);
    try {
      const body: Record<string, unknown> = { name: name.trim(), scopes: selected };
      if (expiresInDays.trim()) {
        const days = Number(expiresInDays);
        if (!Number.isFinite(days) || days <= 0 || days > 3650) {
          throw new Error('expire days must be 1-3650');
        }
        body.expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
      }
      const result = await api.post<{ token: string }>('/api/api-tokens', body);
      setCreatedToken(result.token || '');
      setCopied(false);
      setName('');
      setSelected(['MONITOR']);
      setExpiresInDays('');
      setModal(false);
      await load();
    } catch (e) {
      setError(errorMessage(e, 'Failed to create token'));
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    setBusyId(id);
    setError('');
    try {
      await api.delete(`/api/api-tokens/${encodeURIComponent(id)}`);
      await load();
    } catch (e) {
      setError(errorMessage(e, 'Failed to revoke token'));
    } finally {
      setBusyId('');
    }
  };

  const toggleRoute = async (event: string, channel: string, current: boolean) => {
    setBusyId(`${event}:${channel}`);
    setError('');
    try {
      await api.post('/api/notification-routes', { event, channel, enabled: !current });
      await load();
    } catch (e) {
      setError(errorMessage(e, 'Failed to update route'));
    } finally {
      setBusyId('');
    }
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const tokenColumns: ColumnDef<TokenRow>[] = [
    {
      accessorKey: 'name',
      header: t.tokenName,
      size: 300,
      meta: { noTruncate: true },
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="mono truncate font-medium text-fg" title={row.original.name}>
              {row.original.name}
            </span>
            {row.original.revokedAt && <Badge tone="danger" className="shrink-0">revoked</Badge>}
          </div>
          <p className="mono truncate text-[10px] text-subtle" title={row.original.id}>
            {row.original.id}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'scopes',
      header: t.tokenScopes,
      size: 240,
      enableSorting: false,
      meta: { noTruncate: true },
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.scopes.map((scope) => (
            <Badge key={scope} tone="info">{t[scopeKey[scope]]}</Badge>
          ))}
        </div>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: t.tokenCreated,
      size: 150,
      cell: ({ row }) => <span title={row.original.createdAt}>{formatDate(row.original.createdAt, lang)}</span>,
    },
    {
      accessorKey: 'lastUsedAt',
      header: t.tokenLastUsed,
      size: 150,
      cell: ({ row }) => <span title={row.original.lastUsedAt || ''}>{formatDate(row.original.lastUsedAt, lang)}</span>,
    },
    {
      accessorKey: 'expiresAt',
      header: t.tokenExpires,
      size: 150,
      cell: ({ row }) => <span title={row.original.expiresAt || ''}>{formatDate(row.original.expiresAt, lang)}</span>,
    },
    {
      id: 'actions',
      header: t.actions,
      size: 64,
      enableSorting: false,
      meta: { noTruncate: true, align: 'right' },
      cell: ({ row }) => (
        <IconButton
          icon="trash"
          label={t.tokenRevoke}
          tone="danger"
          disabled={Boolean(row.original.revokedAt) || busyId === row.original.id}
          onClick={() => void revoke(row.original.id)}
        />
      ),
    },
  ];


  return (
    <div className="space-y-6">
      <PageHeader
        title={t.apiTokens}
        subtitle={t.apiTokensSubtitle}
        icon="key"
        actions={
          <Button variant="primary" icon="plus" onClick={() => setModal(true)}>
            {t.tokenCreate}
          </Button>
        }
      />

      {error && (
        <div className="animate-fade-up mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {createdToken && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs font-medium text-muted">{t.tokenValue}</p>
              <code className="block break-all rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs text-fg">{createdToken}</code>
            </div>
            <div className="flex gap-2">
              <Button icon={copied ? 'check' : 'copy'} onClick={() => void copyToken()}>
                {copied ? t.save : t.tokenCopy}
              </Button>
              <Button variant="ghost" icon="close" onClick={() => setCreatedToken('')} aria-label="Close" />
            </div>
          </div>
        </Card>
      )}

      <DataTable
        data={tokens}
        columns={tokenColumns}
        loading={loading}
        getRowId={(row) => row.id}
        total={tokens.length}
        searchPlaceholder={t.search}
      />

      <div>
        <h2 className="mb-1 text-lg font-semibold text-fg">{t.notificationRoutes}</h2>
        <p className="mb-4 text-sm text-muted">{t.notificationRoutesSubtitle}</p>
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-xs font-semibold text-muted">
                  <th className="px-3 py-2">{t.events}</th>
                  {CHANNELS.map((channel) => (
                    <th key={channel} className="px-3 py-2 text-center">{t[channelKey[channel]]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EVENTS.map((event) => (
                  <tr key={event} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-2 font-medium text-fg">{t[eventKey[event]]}</td>
                    {CHANNELS.map((channel) => {
                      const route = routeMap.get(`${event}:${channel}`);
                      const enabled = Boolean(route?.enabled);
                      const key = `${event}:${channel}`;
                      return (
                        <td key={channel} className="px-4 py-3 text-center">
                          <Toggle
                            checked={enabled}
                            onChange={() => void toggleRoute(event, channel, enabled)}
                            label={busyId === key ? '...' : undefined}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={t.tokenCreate}>
        <div className="space-y-4">
          <Field label={t.tokenName}>
            <input
              className="w-full rounded-lg border border-line-2 bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-brand"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder="Grafana monitoring"
            />
          </Field>
          <Field label={t.tokenScopes}>
            <div className="space-y-2">
              {SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-3 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={selected.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    className="h-4 w-4 accent-brand"
                  />
                  {t[scopeKey[scope]]}
                </label>
              ))}
            </div>
          </Field>
          <Field label={t.tokenExpires} hint={t.tokenExpires}>
            <input
              type="number"
              min={1}
              max={3650}
              className="w-full rounded-lg border border-line-2 bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-brand"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              placeholder="90"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModal(false)}>{t.cancel}</Button>
            <Button
              variant="primary"
              loading={creating}
              disabled={!name.trim() || selected.length === 0}
              onClick={() => void create()}
              icon="key"
            >
              {t.tokenCreate}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
