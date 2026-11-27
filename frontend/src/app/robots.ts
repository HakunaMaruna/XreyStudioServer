// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import type { MetadataRoute } from 'next';
import { siteUrl } from '../lib/seo';

export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/docs', '/robots.txt', '/sitemap.xml'],
        disallow: ['/api/', '/sub/', '/login', '/dashboard', '/users', '/nodes', '/settings', '/admin'],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
