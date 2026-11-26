'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { Icon } from '../../components/icons';
import { Badge, Card, EmptyState, PageHeader, cn } from '../../components/ui';

type AuditRow = {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type Level = 'all' | 'destructive' | 'change' | 'info';

const destructive = /DELETE|REVOKE|BAN|ROLLBACK|RESET|RESTORE|REMOVE|DISABLE/i;
const change = /CREATE|UPDATE|PATCH|APPLY|SYNC|IMPORT|SEED|POST|ENABLE/i;

export default function AuditPage() {
  const { t } = useLang();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState('');
  const [level, setLevel] = useState<Level>('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [userId, setUserId] = useState('');
  const [appliedUserId, setAppliedUserId] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pageIndex + 1), limit: String(pageSize) });
    if (entity) params.set('entity', entity);
    if (appliedUserId) params.set('userId', appliedUserId);
    if (appliedSearch) params.set('action', appliedSearch);
    if (level !== 'all') params.set('level', level);
    try {
      const data = await api.get(`/api/audit?${params.toString()}`);
      setRows(data.data || []);
      setTotal(Number(data.total || 0));
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [entity, appliedUserId, appliedSearch, level, pageIndex, pageSize]);

  useEffect(() => {
    if (!isLoggedIn()) window.location.href = '/login';
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search.trim());
      setAppliedUserId(userId.trim());
      setPageIndex(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, userId]);

  useEffect(() => {
    if (isLoggedIn()) load();
  }, [load]);

  const levelOf = (action: string) => {
    if (destructive.test(action)) return { tone: 'danger' as const, label: t.levelDestructive };
    if (change.test(action)) return { tone: 'info' as const, label: t.levelChange };
    return { tone: 'neutral' as const, label: t.levelInfo };
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHeader
        eyebrow={t.system}
        title={t.auditLog}
        subtitle={t.auditSubtitle}
        icon="file"
        actions={<Badge tone="neutral">{t.total}: {total}</Badge>}
      />

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.searchEvents}
              className="field pl-9"
            />
          </div>
          <select value={level} onChange={(e) => { setLevel(e.target.value as Level); setPageIndex(0); }} className="field w-auto min-w-[140px]">
            <option value="all">{t.all} {t.level}</option>
            <option value="destructive">{t.levelDestructive}</option>
            <option value="change">{t.levelChange}</option>
            <option value="info">{t.levelInfo}</option>
          </select>
          <select value={entity} onChange={(e) => { setEntity(e.target.value); setPageIndex(0); }} className="field w-auto min-w-[140px]">
            <option value="">{t.all} {t.entity}</option>
            <option value="User">User</option>
            <option value="Node">Node</option>
            <option value="Inbound">Inbound</option>
          </select>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder={`${t.user} ID`}
            className="field w-full sm:w-[180px]"
          />
        </div>
      </Card>

      <Card padded={false}>
        <div className="max-h-[min(65dvh,640px)] divide-y divide-line/70 overflow-y-auto overscroll-contain">
          {loading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <div key={`audit-skeleton-${index}`} className="flex items-center gap-3 px-3 py-2.5">
                <div className="h-3 w-24 animate-pulse rounded bg-surface-3" />
                <div className="h-3 w-16 animate-pulse rounded bg-surface-3" />
                <div className="h-3 flex-1 animate-pulse rounded bg-surface-3" />
              </div>
            ))
          ) : rows.length === 0 ? (
            <EmptyState title={t.noData} description={t.auditSubtitle} />
          ) : (
            rows.map((row) => {
              const open = expanded === row.id;
              const meta = levelOf(row.action);
              const when = new Date(row.createdAt);
              const summary = `${row.action} · ${row.entity}${row.entityId ? ` ${row.entityId}` : ''}`;
              return (
                <div key={row.id}>
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : row.id)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-2/60"
                  >
                    <span className="w-[74px] shrink-0 truncate text-[11px] tabular-nums text-subtle sm:w-[132px]" title={when.toLocaleString()}>
                      {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      <span className="hidden sm:inline"> · {when.toLocaleDateString()}</span>
                    </span>
                    <Badge tone={meta.tone} dot>{meta.label}</Badge>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-fg" title={summary}>
                      <span className="font-medium">{row.action}</span>
                      <span className="text-muted"> · {row.entity}</span>
                      {row.entityId && <span className="mono text-subtle"> {row.entityId.slice(0, 8)}</span>}
                    </span>
                    <Icon
                      name="chevronDown"
                      size={14}
                      className={cn('shrink-0 text-subtle transition-transform', open && 'rotate-180')}
                    />
                  </button>
                  {open && (
                    <dl className="grid gap-x-4 gap-y-2 border-t border-line/60 bg-surface-2/40 px-3 py-2.5 text-[11px] sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-subtle">{t.action}</dt>
                        <dd className="truncate text-fg" title={row.action}>{row.action}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-subtle">{t.entity}</dt>
                        <dd className="truncate text-fg">{row.entity}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-subtle">{t.entityId}</dt>
                        <dd className="mono break-all text-fg">{row.entityId || '—'}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-subtle">{t.user}</dt>
                        <dd className="mono break-all text-fg">{row.userId || '—'}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-subtle">{t.ip}</dt>
                        <dd className="mono break-all text-fg">{row.ip || '—'}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-subtle">{t.createdAt}</dt>
                        <dd className="truncate text-fg">{when.toLocaleString()}</dd>
                      </div>
                      {row.metadata && (
                        <div className="min-w-0 sm:col-span-2">
                          <dt className="text-subtle">{t.metadata}</dt>
                          <dd>
                            <pre className="mono max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-app/60 p-2 text-[10px] leading-relaxed text-muted">
                              {JSON.stringify(row.metadata, null, 2)}
                            </pre>
                          </dd>
                        </div>
                      )}
                    </dl>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-2 text-xs text-muted">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPageIndex((page) => Math.max(0, page - 1))}
              disabled={pageIndex === 0}
              className="ui-touch-target grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-brand/40 hover:text-fg disabled:opacity-30"
              aria-label={t.previous}
            >
              <Icon name="chevronLeft" size={15} />
            </button>
            <span className="px-2 tabular-nums">
              {t.page} <span className="font-medium text-fg">{pageIndex + 1}</span> {t.of} {pageCount}
            </span>
            <button
              onClick={() => setPageIndex((page) => Math.min(pageCount - 1, page + 1))}
              disabled={pageIndex >= pageCount - 1}
              className="ui-touch-target grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-brand/40 hover:text-fg disabled:opacity-30"
              aria-label={t.next}
            >
              <Icon name="chevronRight" size={15} />
            </button>
          </div>
          <label className="ml-auto flex items-center gap-2">
            <span className="text-subtle max-sm:hidden">{t.pageSize}</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPageIndex(0); }}
              className="field w-auto py-1"
            >
              {[20, 50, 100].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        </div>
      </Card>
    </>
  );
}
