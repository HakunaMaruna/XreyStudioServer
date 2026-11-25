'use client';
import { useEffect, useState } from 'react';
import { useLang } from '../lib/i18n';
import { applyPanelUpdate, fetchUpdateStatus, type UpdateJob, type UpdateStatus } from '../lib/updates';
import { Icon } from './icons';
import { Button, CodeBlock, Modal } from './ui';

export function UpdateDialog({
  open,
  onClose,
  status,
}: {
  open: boolean;
  onClose: () => void;
  status: UpdateStatus | null;
}) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState<UpdateJob | null>(status?.job ?? null);

  useEffect(() => {
    if (!job?.running) return;
    const timer = setInterval(() => {
      fetchUpdateStatus()
        .then((next) => {
          if (next.job) setJob(next.job);
        })
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [job?.running]);

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await applyPanelUpdate(status?.latestVersion);
      setJob(result.job || { running: true, startedAt: new Date().toISOString(), finishedAt: null, exitCode: null, logTail: '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const manual = status?.apply.mode === 'manual';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={manual ? t.updateManualTitle : t.updateConfirmTitle}
      subtitle={status ? `v${status.currentVersion}${status.latestVersion ? ` → v${status.latestVersion}` : ''}` : undefined}
      icon={<Icon name="download" size={16} />}
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/10 px-3 py-2.5 text-xs text-danger">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {manual ? (
          <>
            <p className="text-xs text-muted">{t.updateManualHint}</p>
            <CodeBlock>{status?.apply.command}</CodeBlock>
          </>
        ) : (
          <>
            <p className="text-xs text-muted">{t.updateConfirmText}</p>
            {job && (job.running || job.finishedAt) && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Icon
                    name={job.running ? 'refresh' : job.exitCode === 0 ? 'checkCircle' : 'alert'}
                    size={14}
                    className={job.running ? 'animate-spin text-brand' : job.exitCode === 0 ? 'text-success' : 'text-danger'}
                  />
                  {job.running ? t.updateRunning : job.exitCode === 0 ? t.updateFinished : t.updateFailed}
                </div>
                {job.logTail && <CodeBlock className="max-h-40">{job.logTail}</CodeBlock>}
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {manual ? t.close : t.cancel}
        </Button>
        {!manual && (
          <Button
            icon="download"
            variant="primary"
            onClick={start}
            loading={busy}
            disabled={!status?.canApply || Boolean(job?.running)}
          >
            {t.updateNow}
          </Button>
        )}
      </div>
    </Modal>
  );
}
