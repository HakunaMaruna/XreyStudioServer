'use client';
import Link from 'next/link';
import { useLang } from '../lib/i18n';
import { clearTokens, isLoggedIn } from '../lib/api';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Shell({ children }: { children: React.ReactNode }) {
  const { t, toggle } = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const [dark, setDark] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(isLoggedIn());
    const stored = localStorage.getItem('xss_theme');
    const isDark = stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('xss_theme', next ? 'dark' : 'light');
  };

  const logout = () => {
    clearTokens();
    setAuthed(false);
    router.push('/login');
  };

  if (pathname === '/login') return <>{children}</>;

  const nav = [
    { href: '/dashboard', label: t.dashboard },
    { href: '/users', label: t.users },
    { href: '/nodes', label: t.nodes },
    { href: '/inbounds', label: t.inbounds },
    { href: '/hosts', label: t.hosts },
    { href: '/rules', label: t.rules },
    { href: '/alerts', label: t.alerts },
    { href: '/audit', label: t.audit },
    { href: '/organizations', label: t.organizations },
    { href: '/payments', label: t.payments },
    { href: '/plans', label: t.plans },
    { href: '/settings', label: t.settings },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white dark:bg-gray-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-bold">XSS</Link>
            <nav className="hidden gap-4 md:flex">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-sm ${pathname === item.href ? 'font-semibold text-blue-600' : 'text-gray-600 dark:text-gray-300'}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggle} className="rounded border px-2 py-1 text-xs">{t.language}</button>
            <button onClick={toggleTheme} className="rounded border px-2 py-1 text-xs">{dark ? '☀️' : '🌙'}</button>
            {authed ? (
              <button onClick={logout} className="rounded border px-2 py-1 text-xs">{t.logout}</button>
            ) : (
              <Link href="/login" className="rounded border px-2 py-1 text-xs">{t.login}</Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4">{children}</main>
    </div>
  );
}
