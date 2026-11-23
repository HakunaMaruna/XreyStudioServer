'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { APP_VERSION } from '../../lib/version';
import { Icon } from '../../components/icons';

export default function LoginPage() {
  const { t } = useLang();
  const router = useRouter();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const features = [
    { icon: 'server', title: t.feature1Title, text: t.feature1Text },
    { icon: 'shield', title: t.feature2Title, text: t.feature2Text },
    { icon: 'activity', title: t.feature3Title, text: t.feature3Text },
  ] as const;

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
    <div className="page page-center">
      <div className="container container-tight py-4">
        <div className="text-center mb-4">
          <div className="navbar-brand navbar-brand-autodark d-inline-flex">
            <span className="avatar avatar-lg text-white me-2" style={{ background: 'var(--brand)' }}><Icon name="zap" size={20} /></span>
            <strong className="h3 mb-0">XreyStudio</strong>
          </div>
        </div>

        <div className="card card-md">
          <div className="card-body">
            <h2 className="h2 text-center mb-4">{t.signIn}</h2>
            <p className="text-muted text-center mb-4">{t.credentialsSubtitle}</p>

            {error && (
              <div className="alert alert-danger" role="alert">
                <Icon name="alert" size={15} /> {error}
              </div>
            )}

            <form onSubmit={submit}>
              <div className="mb-3">
                <label className="form-label">{t.email}</label>
                <div className="input-group input-group-flat">
                  <span className="input-group-text"><Icon name="users" size={15} /></span>
                  <input
                    type="email"
                    autoComplete="email"
                    className="form-control"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label">{t.password}</label>
                <div className="input-group input-group-flat">
                  <span className="input-group-text"><Icon name="lock" size={15} /></span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="form-control"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <span className="input-group-text">
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password">
                      <Icon name="eye" size={15} />
                    </button>
                  </span>
                </div>
              </div>

              <div className="form-footer">
                <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                  {loading ? t.loading : t.signIn}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="card mt-4">
          <div className="card-body">
            <div className="row g-3">
              {features.map((feature) => (
                <div key={feature.title} className="col-12 d-flex align-items-center gap-3">
                  <span className="avatar text-primary" style={{ background: 'var(--brand-soft)' }}><Icon name={feature.icon} size={16} /></span>
                  <div>
                    <div className="fw-semibold small">{feature.title}</div>
                    <div className="text-muted small">{feature.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="text-center text-muted small mt-3">© 2026 XreyStudio · v{APP_VERSION}</div>
      </div>
    </div>
  );
}
