// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { APP_VERSION } from '../../lib/version';
import { Icon } from '../../components/icons';
import { Button, Field } from '../../components/ui';

export default function LoginPage() {
  const { t } = useLang();
  const router = useRouter();
  const features = [
    { icon: 'server', title: t.feature1Title, text: t.feature1Text },
    { icon: 'shield', title: t.feature2Title, text: t.feature2Text },
    { icon: 'activity', title: t.feature3Title, text: t.feature3Text },
  ] as const;
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
      <div className="pointer-events-none absolute inset-0 grid-fade opacity-25" />
      <div className="animate-fade-up relative grid w-full max-w-4xl overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--ui-shadow-3)] lg:grid-cols-2">
        <div className="relative hidden flex-col justify-between border-r border-line bg-surface-2 p-8 lg:flex">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white">
              <Icon name="zap" size={16} />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-fg">XreyStudio</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-subtle">{t.controlPanel}</p>
            </div>
          </div>

          <div className="space-y-6 py-8">
            <div>
              <h2 className="max-w-sm text-xl font-semibold leading-snug tracking-tight text-fg">
                {t.brandTitle1}<br />
                <span className="text-brand">{t.brandTitle2}</span>
              </h2>
              <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-muted">{t.brandDescription}</p>
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

          <p className="relative text-[10px] text-subtle">© 2026 XreyStudio · v{APP_VERSION}</p>
        </div>

        <div className="flex items-center justify-center p-6 sm:p-10">
          <form onSubmit={submit} className="w-full max-w-sm space-y-4">
            <div>
              <div className="mb-5 grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface-2 text-brand lg:hidden">
                <Icon name="zap" size={18} />
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-fg">{t.signIn}</h1>
              <p className="mt-1 text-[13px] text-muted">{t.credentialsSubtitle}</p>
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
                  aria-label={t.password}
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
              <div className="flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
                <Icon name="alert" size={14} /> {error}
              </div>
            )}

            <Button type="submit" variant="primary" className="w-full" loading={loading}>
              {t.signIn}
            </Button>

            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[11px] text-subtle">{t.secureAccess}</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <p className="text-center text-[11px] leading-relaxed text-subtle">{t.restrictedAccess}</p>
          </form>
        </div>
      </div>
    </main>
  );
}
