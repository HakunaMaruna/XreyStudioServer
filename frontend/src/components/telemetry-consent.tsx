'use client';
import { useEffect, useState } from 'react';
import { useLang } from '../lib/i18n';
import { api, isLoggedIn } from '../lib/api';
import { Button, Modal, Toggle } from './ui';
import { Icon } from './icons';

type Status = {
  accepted: boolean;
  declined: boolean;
  enabled: boolean;
  installId: string;
  licenseUrl: string;
  configured: boolean;
};

export default function TelemetryConsent() {
  const { t } = useLang();
  const [status, setStatus] = useState<Status | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) return;
    api.get<{ role: string }>('/api/auth/me')
      .then((me) => {
        if (me.role !== 'ADMIN' && me.role !== 'OPERATOR') return;
        return api.get<Status>('/api/telemetry/status')
          .then((value) => { if (!value.accepted && !value.declined) setStatus(value); });
      })
      .catch(() => undefined);
  }, []);

  const decide = async (allow: boolean) => {
    setBusy(true); setError('');
    try {
      await api.post('/api/telemetry/consent', allow
        ? { accepted: true, enabled }
        : { accepted: false, enabled: false, declined: true });
      setStatus(null);
    } catch (e: any) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={Boolean(status)}
      onClose={() => undefined}
      title={t.telemetryConsentTitle}
      icon={<Icon name="activity" size={16} />}
      footer={<>
        <Button variant="subtle" disabled={busy} onClick={() => decide(false)}>{t.telemetryDecline}</Button>
        <Button variant="primary" icon="check" loading={busy} onClick={() => decide(true)}>{t.telemetryAllow}</Button>
      </>}
    >
      <p className="text-sm leading-relaxed text-muted">{t.telemetryConsentText}</p>
      <p className="mt-3 text-xs text-subtle">
        <a className="text-brand underline" href={status?.licenseUrl || '#'} target="_blank" rel="noopener noreferrer">
          {t.telemetryLicense}
        </a>
      </p>
      <div className="mt-4">
        <Toggle checked={enabled} onChange={setEnabled} label={t.telemetryEnabled} />
      </div>
      {!status?.configured && <p className="mt-3 text-xs text-warning">{t.telemetryNoConfig}</p>}
      {error && <p className="mt-3 text-xs text-danger">{error}</p>}
    </Modal>
  );
}
