// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import type { MetadataRoute } from 'next';
import { siteUrl } from '../lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteUrl();
  return [
    {
      url: `${origin}/docs`,
      lastModified: new Date('2026-11-25'),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
