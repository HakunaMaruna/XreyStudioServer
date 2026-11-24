'use client';
import { useSyncExternalStore, type SVGProps } from 'react';
import { Icon as DefaultIcon, type IconName } from './icons-default';
import { Icon as TablerIcon } from './icons-tabler';

export type { IconName } from './icons-default';

export type IconSet = 'default' | 'tabler';
export type IconProps = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

const STORAGE_KEY = 'xss_icon_set';
const ENV_SET: IconSet = process.env.NEXT_PUBLIC_ICON_SET === 'default' ? 'default' : 'tabler';

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = () => listeners.forEach((fn) => fn());

export function getIconSet(): IconSet {
  if (typeof window === 'undefined') return ENV_SET;
  return (localStorage.getItem(STORAGE_KEY) as IconSet) || ENV_SET;
}

export function setIconSet(set: IconSet) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, set);
  emit();
}

export function toggleIconSet() {
  setIconSet(getIconSet() === 'tabler' ? 'default' : 'tabler');
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) emit();
  });
}

export function Icon({ name, size = 18, className, ...props }: IconProps) {
  const set = useSyncExternalStore(subscribe, getIconSet, () => ENV_SET);
  return set === 'tabler' ? (
    <TablerIcon name={name} size={size} className={className} {...props} />
  ) : (
    <DefaultIcon name={name} size={size} className={className} {...props} />
  );
}
