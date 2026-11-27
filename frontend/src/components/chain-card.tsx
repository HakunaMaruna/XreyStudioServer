// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useLang } from '../lib/i18n';
import { Icon } from './icons';
import { Badge, cn } from './ui';

type ChainBindingInfo = {
  chainId?: string;
  chainName?: string;
  entry?: { host?: string; port?: number | string } | null;
};

/**
 * Compact client card for a user row: shows the chain a user is bound to and
 * lets the operator detach them via the client-facing binding endpoint.
 */
export default function ChainCard({
  userId,
  onUnbound,
}: {
  userId: string;
  onUnbound?: () => void | Promise<void>;
}) {
  const { t } = useLang();
  const [binding, setBinding] = useState<ChainBindingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get<ChainBindingInfo | null>(
        `/api/chains/binding/user/${encodeURIComponent(userId)}`,
      );
      setBinding(data && typeof data === 'object' ? data : null);
    } catch (e: any) {
      setBinding(null);
      // A missing binding is a normal state, not an error worth surfacing.
      if (!/404|not found/i.test(String(e?.message || ''))) setError(String(e?.message || ''));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const unbind = async () => {
    setBusy(true);
    setError('');
    try {
      await api.delete(`/api/chains/binding/user/${encodeURIComponent(userId)}`);
      setBinding(null);
      await onUnbound?.();
    } catch (e: any) {
      setError(String(e?.message || ''));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <span className="inline-block h-5 w-24 animate-pulse rounded-lg bg-surface-3" aria-label={t.loading} />;
  }

  const host = String(binding?.entry?.host ?? '').trim();
  const port = binding?.entry?.port;
  const portText = port === undefined || port === null || port === '' ? '' : String(port);
  const address = [host, portText].filter(Boolean).join(':');
  const label = binding?.chainName || t.chainBadge;

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-1.5">
        {binding ? (
          <span title={address ? `${label} · ${address}` : label}>
            <Badge tone="brand">
              <Icon name="route" size={11} /> {label}
            </Badge>
          </span>
        ) : (
          <span className="text-xs text-subtle">—</span>
        )}
        <button
          type="button"
          onClick={unbind}
          disabled={!binding || busy}
          title={t.chainUnbind}
          className={cn(
            'ui-touch-target rounded-lg border border-transparent px-1.5 py-0.5 text-[11px] font-medium text-danger transition-colors',
            binding && !busy
              ? 'hover:border-danger/25 hover:bg-danger/10'
              : 'cursor-not-allowed opacity-30',
          )}
        >
          {t.chainUnbind}
        </button>
      </div>
      {address && <span className="mono max-w-[160px] truncate text-[10px] text-subtle">{address}</span>}
      {error && (
        <span className="inline-flex items-center gap-1 text-[10px] text-danger" title={error}>
          <Icon name="alert" size={11} /> {error}
        </span>
      )}
    </div>
  );
}
