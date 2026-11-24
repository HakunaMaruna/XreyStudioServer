'use client';
import { useEffect } from 'react';
import Shell from './shell';
import AdminLiteShell from './adminlte-shell';
import { applyTheme, getTheme } from '../lib/theme';
import { useUiMode } from '../lib/ui-mode';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const ui = useUiMode();

  useEffect(() => {
    applyTheme(getTheme());
  }, []);

  return ui === 'adminlte' ? <AdminLiteShell>{children}</AdminLiteShell> : <Shell>{children}</Shell>;
}
