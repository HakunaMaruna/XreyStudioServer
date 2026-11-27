// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useEffect } from 'react';
import Shell from './shell';
import { applyTheme, getTheme } from '../lib/theme';
import TelemetryConsent from './telemetry-consent';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyTheme(getTheme());
  }, []);

  return <><Shell>{children}</Shell><TelemetryConsent /></>;
}
