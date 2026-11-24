'use client';
import { useSyncExternalStore } from 'react';

export type UiMode = 'aurora' | 'adminlte';

const KEY = 'xss_ui';
// Новый UI по умолчанию. Старый доступен кнопкой переключения или NEXT_PUBLIC_UI=aurora.
const ENV_MODE: UiMode = process.env.NEXT_PUBLIC_UI === 'aurora' ? 'aurora' : 'adminlte';

let cached: UiMode = ENV_MODE;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = () => listeners.forEach((fn) => fn());

export function getUiMode(): UiMode {
  return cached;
}

export function setUiMode(mode: UiMode) {
  cached = mode;
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, mode);
  emit();
}

export function toggleUiMode() {
  setUiMode(getUiMode() === 'aurora' ? 'adminlte' : 'aurora');
}

export function useUiMode(): UiMode {
  return useSyncExternalStore(subscribe, getUiMode, () => ENV_MODE);
}

if (typeof window !== 'undefined') {
  const stored = localStorage.getItem(KEY);
  if (stored === 'aurora' || stored === 'adminlte') cached = stored;
  window.addEventListener('storage', (event) => {
    const e = event as StorageEvent;
    if (e.key === KEY) {
      cached = e.newValue === 'adminlte' ? 'adminlte' : 'aurora';
      emit();
    }
  });
}
