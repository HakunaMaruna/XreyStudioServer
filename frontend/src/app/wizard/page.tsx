// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { COUNTRIES } from '../../lib/countries';
import { useLang } from '../../lib/i18n';
import { Icon } from '../../components/icons';
import { Button, Card, CodeBlock, Field, HelpButton, Modal, PageHeader, SectionTitle, Segmented, Toggle } from '../../components/ui';

type AuthMode = 'password' | 'password_key' | 'key';
type WizardResult = {
  nodeId: string;
  nodeName: string;
  fqdn: string;
  domainId: string;
  userDomain: string | null;
  inboundPort: number;
  revision: number;
  certificateIssued: boolean;
  domains: string[];
  next: string;
};

const inputClass =
  'w-full rounded-lg border border-line-2 bg-surface-2 px-3 py-2 text-sm text-fg outline-none transition focus:border-brand/60';

export default function WizardPage() {
  const { t, lang } = useLang();
  const [step, setStep] = useState(0);
  const [authMode, setAuthMode] = useState<AuthMode>('key');
  const [domainMode, setDomainMode] = useState<'auto' | 'custom'>('auto');
  const [issueCustomCert, setIssueCustomCert] = useState(true);
  const [form, setForm] = useState({
    host: '',
    sshUser: 'root',
    sshPort: '22',
    hostKeyFingerprint: '',
    location: 'RU',
    nodeName: '',
    ipv4: '',
    ipv6: '',
    userDomain: '',
    password: '',
    privateKey: '',
    passphrase: '',
  });
  const [busy, setBusy] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [install, setInstall] = useState<any>(null);
  const pollRef = useRef<number | null>(null);
  const redirectRef = useRef<number | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<WizardResult | null>(null);
  const [applied, setApplied] = useState(false);
  const [jumpNodeId, setJumpNodeId] = useState('');
  const [nodes, setNodes] = useState<Array<{ id: string; name: string; status?: string }>>([]);

  const names = useMemo(
    () => new Intl.DisplayNames([lang === 'ru' ? 'ru' : 'en'], { type: 'region' }),
    [lang],
  );

  useEffect(() => {
    if (!isLoggedIn()) window.location.href = '/login';
    api.get('/api/nodes').then((data: any) => setNodes(Array.isArray(data) ? data : data?.data || [])).catch(() => undefined);
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
      if (redirectRef.current !== null) window.clearTimeout(redirectRef.current);
    };
  }, []);

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    if (domainMode === 'custom' && !form.userDomain.trim()) {
      setError(t.wizardCustomDomainRequired);
      return;
    }
    setBusy(true);
    setError('');
    const installId = crypto.randomUUID();
    let activeInstallId = installId;
    setInstall({ status: 'running', stage: 'start', progress: 2, error: null,
      logs: [{ id: 'local', level: 'info', stage: 'start', message: t.wizardInstallStarting }] });
    setInstallOpen(true);
    const poll = () => api.get(`/api/wizard/install/${activeInstallId}`).then(setInstall).catch(() => undefined);
    pollRef.current = window.setInterval(poll, 1200);
    try {
      const body: Record<string, unknown> = {
        host: form.host,
        sshUser: form.sshUser,
        sshPort: Number(form.sshPort) || 22,
        authMode,
        location: form.location,
        jumpNodeId: jumpNodeId || undefined,
        nodeName: form.nodeName || undefined,
        ipv4: form.ipv4 || undefined,
        ipv6: form.ipv6 || undefined,
        ...(domainMode === 'custom'
          ? { userDomain: form.userDomain, issueCustomCert }
          : {}),
        installId,
      };
      if (authMode !== 'key') body.password = form.password;
      if (authMode !== 'password' && form.hostKeyFingerprint) body.hostKeyFingerprint = form.hostKeyFingerprint;
      if (authMode !== 'password') {
        body.privateKey = form.privateKey;
        if (form.passphrase) body.passphrase = form.passphrase;
      }
      const data = await api.post('/api/wizard/nodes', body);
      if (data?.installId && data.installId !== activeInstallId) activeInstallId = data.installId;
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
      pollRef.current = null;
      await poll();
      setResult(data);
      setStep(2);
    } catch (e: any) {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
      pollRef.current = null;
      await poll();
      setError(e.message || 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!result) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/nodes/${result.nodeId}/apply`, {});
      setApplied(true);
      setInstallOpen(false);
      redirectRef.current = window.setTimeout(() => { window.location.href = '/nodes'; }, 1600);
    } catch (e: any) {
      setError(e.message || 'Apply failed');
    } finally {
      setBusy(false);
    }
  };

  const retryCertificate = async () => {
    if (!result) return;
    setBusy(true);
    setError('');
    try {
      const data = await api.post('/api/wizard/certificates/retry', { domainId: result.domainId });
      setResult({ ...result, certificateIssued: data.certificateIssued, domains: data.domains });
    } catch (e: any) {
      setError(e.message || 'Certificate retry failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t.wizard} subtitle={t.wizardSubtitle} icon="plus" eyebrow="AUTOMATION"
        actions={<HelpButton title={t.help}><p>{lang === 'ru' ? 'Мастер запрашивает домен у CONTROL, устанавливает агента по SSH и создаёт первое VLESS TLS подключение. Пароль и ключ шифруются; пустые поля в редактировании означают «оставить как было».' : 'The wizard asks CONTROL for a domain, installs the agent over SSH and creates the first VLESS TLS inbound. Passwords and keys are encrypted; empty fields in editing mean “keep current”.'}</p></HelpButton>} />

      <div className="flex flex-wrap gap-2">
        {[t.wizardStep1, t.wizardStep2, t.wizardStep3].map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => index < step && setStep(index)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              index === step
                ? 'border-brand/50 bg-brand/15 text-fg'
                : index < step
                  ? 'border-line-2 bg-surface-2 text-muted'
                  : 'border-line bg-transparent text-subtle'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {step === 0 && (
        <Card>
          <SectionTitle title={t.wizardStep1} subtitle={authMode === 'password' ? undefined : t.wizardFingerprintHint} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.wizardHost}>
              <input className={inputClass} value={form.host} onChange={(e) => update('host', e.target.value)} placeholder="node.example.com" />
            </Field>
            <Field label={t.wizardUser}>
              <input className={inputClass} value={form.sshUser} onChange={(e) => update('sshUser', e.target.value)} />
            </Field>
            <Field label={t.wizardPort}>
              <input className={inputClass} value={form.sshPort} onChange={(e) => update('sshPort', e.target.value)} />
            </Field>
            {authMode !== 'password' && (
              <Field label={t.wizardFingerprint}>
                <input className={inputClass} value={form.hostKeyFingerprint} onChange={(e) => update('hostKeyFingerprint', e.target.value)} placeholder="SHA256:..." />
              </Field>
            )}
          </div>
          <div className="mt-5">
            <span className="text-[11px] font-medium text-subtle">{t.wizardAuthMode}</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['key', 'password', 'password_key'] as AuthMode[]).map((mode) => (
                <Button key={mode} variant={authMode === mode ? 'primary' : 'subtle'} size="sm" onClick={() => setAuthMode(mode)}>
                  {mode === 'key' ? t.wizardKey : mode === 'password' ? t.wizardPassword : `${t.wizardPassword} + ${t.wizardKey}`}
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {authMode !== 'key' && (
              <Field label={t.wizardPassword}>
                <input type="password" className={inputClass} value={form.password} onChange={(e) => update('password', e.target.value)} autoComplete="new-password" />
              </Field>
            )}
            {authMode !== 'password' && (
              <>
                <Field label={t.wizardKey}>
                  <textarea className={`${inputClass} min-h-28 font-mono text-[11px]`} value={form.privateKey} onChange={(e) => update('privateKey', e.target.value)} />
                </Field>
                <Field label={t.wizardPassphrase}>
                  <input type="password" className={inputClass} value={form.passphrase} onChange={(e) => update('passphrase', e.target.value)} autoComplete="off" />
                </Field>
              </>
            )}
          </div>
          <div className="mt-5 flex justify-end">
            <Field label={t.wizardJumpNode} hint={t.wizardJumpNodeHint}>
              <select className={inputClass} value={jumpNodeId} onChange={(e) => setJumpNodeId(e.target.value)}>
                <option value="">{t.none}</option>
                {nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
              </select>
            </Field>
            <Button variant="primary" icon="chevronRight" onClick={() => setStep(1)} disabled={!form.host || (authMode !== 'password' && !form.hostKeyFingerprint)}>
              {t.next}
            </Button>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <SectionTitle title={t.wizardStep2} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.wizardName}>
              <input className={inputClass} value={form.nodeName} onChange={(e) => update('nodeName', e.target.value)} />
            </Field>
            <Field label={t.wizardLocation}>
              <select className={inputClass} value={form.location} onChange={(e) => update('location', e.target.value)}>
                {COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.flag} {names.of(country.code)} ({country.code})
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.wizardIpv4}>
              <input className={inputClass} value={form.ipv4} onChange={(e) => update('ipv4', e.target.value)} />
            </Field>
            <Field label={t.wizardIpv6}>
              <input className={inputClass} value={form.ipv6} onChange={(e) => update('ipv6', e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <span className="text-[11px] font-medium text-subtle">{t.wizardDomainMode}</span>
              <div className="mt-2">
                <Segmented value={domainMode} onChange={setDomainMode} options={[
                  { value: 'auto', label: t.wizardAutoDomain, icon: 'globe' },
                  { value: 'custom', label: t.wizardCustomDomainMode, icon: 'link' },
                ]} />
              </div>
              <p className="mt-2 text-xs text-muted">
                {domainMode === 'auto' ? t.wizardAutoDomainHint : t.wizardCustomDomainHint}
              </p>
            </div>
            {domainMode === 'custom' && (
              <>
                <Field label={t.wizardUserDomain} hint={t.wizardUserDomainHint}>
                  <input className={inputClass} value={form.userDomain} onChange={(e) => update('userDomain', e.target.value)} placeholder="vpn.example.com" />
                </Field>
                <div className="flex items-center">
                  <Toggle checked={issueCustomCert} onChange={setIssueCustomCert} label={t.wizardIssueCustomCert} />
                </div>
              </>
            )}
          </div>
          <div className="mt-5 flex flex-wrap justify-between gap-2">
            <Button icon="chevronLeft" onClick={() => setStep(0)}>{t.previous}</Button>
            <Button variant="primary" icon="plus" loading={busy} onClick={submit}>
              {t.wizardCreate}
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && result && (
        <Card>
          <SectionTitle title={t.wizardSuccess} subtitle={result.next} />
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Icon name="server" size={16} />
              <span className="text-muted">{t.wizardName}:</span>
              <span className="font-medium text-fg">{result.nodeName}</span>
            </div>
            <CodeBlock>{result.domains.join('\n')}</CodeBlock>
            <p className="text-xs text-subtle">
              VLESS TLS · {t.port}: {result.inboundPort} · {t.version}: {result.revision}
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" icon="check" loading={busy} onClick={apply} disabled={applied}>
              {applied ? t.wizardApplied : t.wizardApply}
            </Button>
            {!result.certificateIssued && (
              <Button icon="refresh" loading={busy} onClick={retryCertificate}>
                {t.wizardRetryCert}
              </Button>
            )}
          </div>
          {applied && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-sm text-success" role="status">
              <Icon name="checkCircle" size={16} />
              <span>{t.wizardApplied} · {t.wizardRedirecting}</span>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </Card>
      )}
      <Modal
        open={installOpen}
        onClose={() => { if (install?.status !== 'running') setInstallOpen(false); }}
        title={install?.status === 'failed' ? t.wizardInstallFailed
          : install?.status === 'success' ? t.wizardInstallSuccess : t.wizardInstalling}
        icon={<Icon name="terminal" size={16} />}
        size="lg"
        footer={<Button
          className="w-full sm:w-auto sm:min-w-[8rem]"
          icon={install?.status === 'success' ? 'check' : undefined}
          disabled={install?.status === 'running'}
          onClick={() => setInstallOpen(false)}
        >
          {install?.status === 'failed' ? t.wizardClose : t.wizardContinue}
        </Button>}
      >
        <div className="mb-2 flex items-center justify-between text-xs text-muted">
          <span>{install?.stage || 'start'}</span>
          <span>{install?.progress || 0}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-brand transition-all duration-500"
            style={{ width: `${install?.progress || 0}%` }} />
        </div>
        <p className="mt-4 text-[11px] font-medium text-subtle">{t.wizardInstallTerminal}</p>
        <div className="mono mt-2 max-h-72 space-y-1 overflow-auto rounded-lg border border-line bg-[#07090f] p-3 text-[11px] leading-relaxed">
          {(install?.logs || []).map((entry: any) => (
            <div key={entry.id} className={entry.level === 'error' ? 'text-danger'
              : entry.level === 'warn' ? 'text-warning'
                : entry.level === 'output' ? 'text-subtle' : 'text-success'}>
              <span className="text-subtle">[{entry.createdAt ? new Date(entry.createdAt).toLocaleTimeString() : '—'}]</span>{' '}
              {entry.message}
            </div>
          ))}
        </div>
        {install?.error && <p className="mt-3 text-xs text-danger">{install.error}</p>}
      </Modal>
    </div>
  );
}
