'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { Badge, Button, Card, PageHeader, SectionTitle } from '../../components/ui';

type Check = {
  id: string;
  severity: 'ok' | 'warning' | 'critical';
  title: string;
  detail: string;
  fixable: boolean;
  entityId?: string;
};

export default function DoctorPage() {
  const { t } = useLang();
  const [checks, setChecks] = useState<Check[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

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
    try {
      const result = await api.post<{ message?: string }>('/api/doctor/fix', {
        checkId: check.id,
        entityId: check.entityId,
      });
      setError(result.message || t.fixApplied);
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
      {error && <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}
      {checks.length > 0 && problems.length === 0 && (
        <Card><div className="py-6 text-center text-sm text-muted">{t.noIssues}</div></Card>
      )}
      {problems.length > 0 && (
        <Card>
          <SectionTitle title={t.doctor} />
          <div className="divide-y divide-border">
            {problems.map((check) => (
              <div key={check.id + (check.entityId || '')} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{check.title}</span>
                    <Badge tone={check.severity === 'critical' ? 'danger' : 'warning'}>{check.severity}</Badge>
                  </div>
                  <p className="text-xs text-muted">{check.detail}</p>
                </div>
                {check.fixable && (
                  <Button
                    size="sm"
                    onClick={() => fix(check)}
                    loading={busy === check.id + (check.entityId || '')}
                  >
                    {t.applyFix}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
