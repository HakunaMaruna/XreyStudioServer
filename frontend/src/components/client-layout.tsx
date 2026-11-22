'use client';
import { useEffect } from 'react';
import Shell from '../components/shell';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!localStorage.getItem('xss_theme')) {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', dark);
    }
  }, []);
  return <Shell>{children}</Shell>;
}
