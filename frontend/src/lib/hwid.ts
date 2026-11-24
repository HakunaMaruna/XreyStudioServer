'use client';

const STORAGE_KEY = 'xss-hwid';

/** Stable, opaque browser identifier used for the per-user device limit. */
export function getBrowserHwid(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && /^[A-Za-z0-9_.:-]{8,128}$/.test(existing)) return existing;
    const generated = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, generated);
    return generated;
  } catch {
    return '';
  }
}
