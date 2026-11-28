// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useEffect, useState } from 'react';
import { useLang } from '../lib/i18n';
import { api, isLoggedIn } from '../lib/api';
import { Button, Modal } from './ui';
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
  // Две независимые галочки: принятие лицензии обязательно, статистика — нет.
  const [licenseAccepted, setLicenseAccepted] = useState(false);
  const [enabled, setEnabled] = useState(false);
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

  const accept = async () => {
    if (!licenseAccepted) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/api/telemetry/consent', { accepted: true, enabled });
      setStatus(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(status)}
      onClose={() => undefined}
      title={t.licenseConsentTitle}
      icon={<Icon name="shield" size={16} />}
      size="lg"
      footer={
        <Button variant="primary" icon="check" loading={busy} disabled={!licenseAccepted} onClick={accept}>
          {t.telemetryContinue}
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-muted">{t.licenseConsentText}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <a className="text-brand underline" href="/help#license" target="_blank" rel="noopener noreferrer">
            {t.licenseReadDocs}
          </a>
          <a className="text-brand underline" href={status?.licenseUrl || '#'} target="_blank" rel="noopener noreferrer">
            {t.telemetryLicense}
          </a>
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-surface-2/40 px-3 py-2.5 text-[13px] text-fg">
          <input
            type="checkbox"
            checked={licenseAccepted}
            onChange={(event) => setLicenseAccepted(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
          />
          <span>{t.licenseAccept}</span>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5 px-3 text-[13px] text-muted">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
          />
          <span>{t.telemetryConsentCheckbox}</span>
        </label>
        {!status?.configured && <p className="text-xs text-warning">{t.telemetryNoConfig}</p>}
        {!licenseAccepted && <p className="text-xs text-subtle">{t.licenseAcceptRequired}</p>}
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
