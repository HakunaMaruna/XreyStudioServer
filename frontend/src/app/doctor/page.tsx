// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, PageHeader, cn } from '../../components/ui';

type Check = {
  id: string;
  severity: 'ok' | 'warning' | 'critical';
  title: string;
  detail: string;
  fixable: boolean;
  entityId?: string;
};

export default function DoctorPage() {
  const { t, lang } = useLang();
  const [checks, setChecks] = useState<Check[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isLoggedIn()) return;
    api.get<Check[]>('/api/doctor').then(setChecks).catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fix = async (check: Check) => {
    if (!window.confirm(`${t.applyFix}: ${check.title} — ${check.detail}?`)) return;
    setBusy(check.id + (check.entityId || ''));
    setError('');
    setNotice('');
    try {
      const result = await api.post<{ message?: string }>('/api/doctor/fix', {
        checkId: check.id,
        entityId: check.entityId,
      });
      setNotice(result.message || t.fixApplied);
      load();
    } catch (err: any) {
      setError(err.message || 'Fix failed');
    } finally {
      setBusy(null);
    }
  };

  const problems = checks.filter((check) => check.severity !== 'ok');

  return (
    <>
      <PageHeader eyebrow="Infrastructure" title={t.doctor} subtitle={t.doctorSubtitle} icon="activity" />
      <Card className="mb-4 p-3 text-[11px] leading-relaxed text-muted">
        {lang === 'ru'
          ? 'Сейчас раздел проверяет базу данных, доступность нод, результаты client-eye проверок, срок сертификатов и свежесть ревизий конфига. Для 중요한 проверок доступна кнопка «Применить исправление» — она создаёт и применяет новую ревизию. Журнал событий и расширенная диагностика планируются.'
          : 'Currently checks the database, node availability, client-eye results, certificate expiry and config revision freshness. Fixable items get an "Apply fix" button that creates and applies a new revision. Extended diagnostics and an event log are planned.'}
      </Card>
      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}
      {notice && (
        <div role="status" aria-live="polite" className="mb-4 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs text-success">
          {notice}
        </div>
      )}
      {checks.length > 0 && problems.length === 0 && (
        <Card><div className="py-6 text-center text-sm text-muted">{t.noIssues}</div></Card>
      )}
      {problems.length > 0 && (
        <Card padded={false}>
          <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5">
            <h2 className="text-[13px] font-semibold text-fg">{t.doctor}</h2>
            <Badge tone="warning">{problems.length}</Badge>
          </div>
          <div className="divide-y divide-line/70">
            {problems.map((check) => {
              const key = check.id + (check.entityId || '');
              const open = expanded === key;
              const critical = check.severity === 'critical';
              return (
                <div key={key}>
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : key)}
                    aria-expanded={open}
                    className="flex w-full items-start gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2/60"
                  >
                    <span
                      className={cn(
                        'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border',
                        critical
                          ? 'border-danger/30 bg-danger/10 text-danger'
                          : 'border-warning/30 bg-warning/10 text-warning',
                      )}
                    >
                      <Icon name="alert" size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 truncate text-[13px] font-medium text-fg">{check.title}</span>
                        <Badge tone={critical ? 'danger' : 'warning'}>{check.severity}</Badge>
                      </span>
                      {!open && (
                        <span className="mt-0.5 block truncate text-[11px] text-muted" title={check.detail}>{check.detail}</span>
                      )}
                    </span>
                    <Icon
                      name="chevronDown"
                      size={14}
                      className={cn('mt-1 shrink-0 text-subtle transition-transform', open && 'rotate-180')}
                    />
                  </button>
                  {open && (
                    <div className="px-3 pb-3 pl-[3rem]">
                      <p className="whitespace-pre-line break-words text-xs leading-relaxed text-muted">{check.detail}</p>
                      {check.fixable && (
                        <Button size="sm" className="mt-2" onClick={() => fix(check)} loading={busy === key}>
                          {t.applyFix}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
}
