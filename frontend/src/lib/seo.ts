// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
/**
 * Public origin used in canonical links, Open Graph tags, robots.txt and sitemap.xml.
 * Set NEXT_PUBLIC_SITE_URL to the externally visible URL of the panel, e.g.
 * https://panel.example.com. No trailing slash.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) return 'http://localhost:3000';
  try {
    const url = new URL(configured);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'http://localhost:3000';
    return url.origin;
  } catch {
    return 'http://localhost:3000';
  }
}
