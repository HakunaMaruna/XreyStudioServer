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
