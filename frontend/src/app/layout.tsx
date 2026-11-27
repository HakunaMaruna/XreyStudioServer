// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Suspense } from 'react';
import './globals.css';
import ClientLayout from '../components/client-layout';
import { siteUrl } from '../lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'XreyStudio Control Panel',
    template: '%s · XreyStudio',
  },
  description:
    'XreyStudio Server is a self-hosted control panel for Xray VPN nodes: user management, subscriptions, traffic analytics and secure operations.',
  applicationName: 'XreyStudio Server',
  keywords: [
    'XreyStudio Server',
    'self-hosted VPN panel',
    'Xray control panel',
    'VPN subscription manager',
    'traffic analytics',
  ],
  openGraph: {
    type: 'website',
    siteName: 'XreyStudio Server',
    title: 'XreyStudio Server — self-hosted VPN control panel',
    description: 'Manage Xray nodes, subscriptions and traffic from a single self-hosted panel.',
    url: '/docs',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'XreyStudio Server',
    description: 'Self-hosted Xray VPN control panel with subscriptions and analytics.',
  },
  formatDetection: { email: false, address: false, telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#070a14' },
    { media: '(prefers-color-scheme: light)', color: '#f3f5fc' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body className="min-h-screen bg-app text-fg antialiased">
        <Suspense fallback={null}>
          <ClientLayout>{children}</ClientLayout>
        </Suspense>
      </body>
    </html>
  );
}
