'use client';

export type Theme = 'dark' | 'light';

const KEY = 'xss_theme';

export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('light', theme === 'light');
  root.dataset.theme = theme;
  localStorage.setItem(KEY, theme);
}
