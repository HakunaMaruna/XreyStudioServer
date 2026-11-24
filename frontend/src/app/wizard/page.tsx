'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { COUNTRIES } from '../../lib/countries';
import { useLang } from '../../lib/i18n';
import { Icon } from '../../components/icons';
import { Button, Card, CodeBlock, Field, PageHeader, SectionTitle } from '../../components/ui';

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
  'w-full rounded-xl border border-line-2 bg-surface-2 px-3 py-2 text-sm text-fg outline-none transition focus:border-brand/60';

export default function WizardPage() {
  const { t, lang } = useLang();
  const [step, setStep] = useState(0);
  const [authMode, setAuthMode] = useState<AuthMode>('key');
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
  const [countrySearch, setCountrySearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<WizardResult | null>(null);
  const [applied, setApplied] = useState(false);

  const names = useMemo(
    () => new Intl.DisplayNames([lang === 'ru' ? 'ru' : 'en'], { type: 'region' }),
    [lang],
  );
  const countries = useMemo(() => {
    const query = countrySearch.trim().toLowerCase();
    return COUNTRIES.filter(
      (country) =>
        !query ||
        country.code.toLowerCase().includes(query) ||
        String(names.of(country.code) || '').toLowerCase().includes(query),
    );
  }, [countrySearch, names]);

  useEffect(() => {
    if (!isLoggedIn()) window.location.href = '/login';
  }, []);

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        host: form.host,
        sshUser: form.sshUser,
        sshPort: Number(form.sshPort) || 22,
        hostKeyFingerprint: form.hostKeyFingerprint,
        authMode,
        location: form.location,
        nodeName: form.nodeName || undefined,
        ipv4: form.ipv4 || undefined,
        ipv6: form.ipv6 || undefined,
        userDomain: form.userDomain || undefined,
      };
      if (authMode !== 'key') body.password = form.password;
      if (authMode !== 'password') {
        body.privateKey = form.privateKey;
        if (form.passphrase) body.passphrase = form.passphrase;
      }
      const data = await api.post('/api/wizard/nodes', body);
      setResult(data);
      setStep(2);
    } catch (e: any) {
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
      <PageHeader title={t.wizard} subtitle={t.wizardSubtitle} icon="plus" eyebrow="AUTOMATION" />

      <div className="flex flex-wrap gap-2">
        {[t.wizardStep1, t.wizardStep2, t.wizardStep3].map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => index < step && setStep(index)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
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
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {step === 0 && (
        <Card>
          <SectionTitle title={t.wizardStep1} subtitle={t.wizardFingerprintHint} />
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
            <Field label={t.wizardFingerprint}>
              <input className={inputClass} value={form.hostKeyFingerprint} onChange={(e) => update('hostKeyFingerprint', e.target.value)} placeholder="SHA256:..." />
            </Field>
          </div>
          <div className="mt-5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">{t.wizardAuthMode}</span>
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
            <Button variant="primary" icon="chevronRight" onClick={() => setStep(1)} disabled={!form.host || !form.hostKeyFingerprint}>
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
                {countries.map((country) => (
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
            <Field label={t.wizardUserDomain} hint={t.wizardUserDomainHint}>
              <input className={inputClass} value={form.userDomain} onChange={(e) => update('userDomain', e.target.value)} placeholder="vpn.example.com" />
            </Field>
            <div>
              <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">{t.wizardLocation}</span>
              <input
                className={`${inputClass} mt-1.5`}
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                placeholder={t.search}
              />
            </div>
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
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </Card>
      )}
    </div>
  );
}
