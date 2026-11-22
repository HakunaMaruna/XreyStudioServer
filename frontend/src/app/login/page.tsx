'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { Icon } from '../../components/icons';
import { Button, Field } from '../../components/ui';

const features = [
  { icon: 'server', title: 'Multi-node control', text: 'Manage every Xray node from a single plane' },
  { icon: 'shield', title: 'Secure by default', text: 'Hashed agent tokens, RBAC and audit trail' },
  { icon: 'activity', title: 'Live observability', text: 'Metrics, alerts and configuration revisions' },
] as const;

export default function LoginPage() {
  const { t } = useLang();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 sm:p-8">
      <div className="pointer-events-none absolute inset-0 grid-fade opacity-40" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_40px_100px_-40px_rgba(0,0,0,.9)] lg:grid-cols-2">
        <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-gradient-to-br from-brand/15 via-surface to-surface p-10 lg:flex">
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand/25 blur-3xl" />
          <div className="absolute -bottom-32 -right-16 h-72 w-72 rounded-full bg-brand-2/15 blur-3xl" />

          <div className="relative flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-2 text-white shadow-[0_8px_24px_-8px_var(--brand)]">
              <Icon name="zap" size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-fg">XreyStudio</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-subtle">Control panel</p>
            </div>
          </div>

          <div className="relative space-y-8 py-12">
            <div>
              <h2 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight text-fg">
                Your infrastructure,<br />
                <span className="bg-gradient-to-r from-brand to-cyan bg-clip-text text-transparent">under control.</span>
              </h2>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
                A single place to manage nodes, subscribers, subscriptions and alerts — built for self-hosted Xray deployments.
              </p>
            </div>
            <div className="space-y-4">
              {features.map((feature) => (
                <div key={feature.title} className="flex items-start gap-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-brand/20 bg-brand-soft text-brand">
                    <Icon name={feature.icon} size={15} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-fg">{feature.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted">{feature.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="relative text-[10px] text-subtle">© 2026 XreyStudio · v1.3.0</p>
        </div>

        <div className="flex items-center justify-center p-8 sm:p-12">
          <form onSubmit={submit} className="w-full max-w-sm space-y-5">
            <div>
              <div className="mb-6 grid h-10 w-10 place-items-center rounded-xl border border-brand/25 bg-brand-soft text-brand lg:hidden">
                <Icon name="zap" size={19} />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-fg">{t.signIn}</h1>
              <p className="mt-1.5 text-sm text-muted">Enter your credentials to continue</p>
            </div>

            <Field label={t.email}>
              <div className="relative">
                <Icon name="users" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field pl-9"
                  required
                />
              </div>
            </Field>

            <Field label={t.password}>
              <div className="relative">
                <Icon name="lock" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field px-9"
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle transition-colors hover:text-fg" aria-label="Toggle password">
                  <Icon name="eye" size={15} />
                </button>
              </div>
            </Field>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2.5 text-xs text-danger">
                <Icon name="alert" size={14} /> {error}
              </div>
            )}

            <Button type="submit" variant="primary" className="w-full" loading={loading}>
              {t.signIn}
            </Button>

            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[10px] uppercase tracking-widest text-subtle">Secure access</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <p className="text-center text-[11px] leading-relaxed text-subtle">
              Access is restricted to authorised administrators only.
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
