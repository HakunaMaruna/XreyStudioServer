'use client';
import { useEffect } from 'react';
import Shell from './shell';
import { applyTheme, getTheme } from '../lib/theme';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyTheme(getTheme());
  }, []);

  return <Shell>{children}</Shell>;
}
