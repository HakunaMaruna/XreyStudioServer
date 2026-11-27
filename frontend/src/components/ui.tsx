// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { createPortal } from 'react-dom';
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './icons';
import { useLang } from '../lib/i18n';

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

type CardProps = { children: ReactNode; className?: string; padded?: boolean; delay?: number };

export function Card({ children, className, padded = true, delay }: CardProps) {
  return (
    <section
      className={cn('panel panel-hover animate-fade-up', padded && 'p-4', className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </section>
  );
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="animate-fade-up mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-5">
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-brand">
            <Icon name={icon} size={18} />
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1 text-[11px] font-medium text-brand">{eyebrow}</p>
          )}
          <h1 className="truncate text-lg font-semibold tracking-tight text-fg sm:text-xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs text-muted sm:text-[13px]">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
  size?: 'sm' | 'md';
  icon?: IconName;
  loading?: boolean;
};

const buttonVariants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'border-brand bg-brand text-white hover:bg-brand/90',
  secondary: 'border-line bg-surface-2 text-fg hover:border-line-2 hover:bg-surface-3',
  ghost: 'border-transparent bg-transparent text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'border-danger/30 bg-danger/10 text-danger hover:bg-danger/20',
  subtle: 'border-line bg-surface text-muted hover:border-line-2 hover:text-fg',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'ui-touch-target inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3.5 text-[13px]',
        buttonVariants[variant],
        className,
      )}
      disabled={disabled || loading}
      type={props.type ?? 'button'}
      {...props}
    >
      {loading ? <Icon name="refresh" size={15} className="animate-spin" /> : icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  tone = 'default',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; tone?: 'default' | 'danger' | 'brand' }) {
  return (
    <button
      title={label}
      aria-label={label}
      className={cn(
        'ui-touch-target grid h-8 w-8 place-items-center rounded-lg border border-transparent transition-colors',
        tone === 'danger'
          ? 'text-danger hover:border-danger/25 hover:bg-danger/10'
          : tone === 'brand'
            ? 'text-brand hover:border-brand/25 hover:bg-brand-soft'
            : 'text-muted hover:border-line hover:bg-surface-3 hover:text-fg',
        className,
      )}
      type={props.type ?? 'button'}
      {...props}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'cyan' | 'neutral';

const toneClasses: Record<Tone, string> = {
  brand: 'border-brand/25 bg-brand-soft text-brand',
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  danger: 'border-danger/25 bg-danger/10 text-danger',
  info: 'border-info/25 bg-info/10 text-info',
  cyan: 'border-cyan/25 bg-cyan/10 text-cyan',
  neutral: 'border-line bg-surface-3 text-muted',
};

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-1.5 text-[11px] font-medium leading-5',
        toneClasses[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const value = status.toUpperCase();
  if (['ONLINE', 'ACTIVE', 'RESOLVED', 'APPLIED', 'ENABLED', 'HEALTHY'].includes(value)) {
    return <Badge tone="success" dot>{status}</Badge>;
  }
  if (['OFFLINE', 'DISABLED', 'EXPIRED', 'FIRING', 'ERROR'].includes(value)) {
    return <Badge tone="danger" dot>{status}</Badge>;
  }
  return <Badge tone="warning" dot>{status}</Badge>;
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'brand',
  hint,
  delay,
}: {
  label: string;
  value: ReactNode;
  icon: IconName;
  tone?: Tone;
  hint?: string;
  delay?: number;
}) {
  return (
    <Card delay={delay} className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-subtle" title={label}>{label}</p>
          <p className="mt-1.5 text-xl font-semibold leading-none tracking-tight text-fg tabular-nums">{value}</p>
          {hint && <p className="mt-1 truncate text-[11px] text-muted" title={hint}>{hint}</p>}
        </div>
        <div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg border', toneClasses[tone])}>
          <Icon name={icon} size={18} />
        </div>
      </div>
    </Card>
  );
}

/** Discreet round `?` marker whose native tooltip carries the full help text. */
export function HelpTip({ text }: { text: string }) {
  return (
    <button
      type="button"
      title={text}
      aria-label={text}
      onClick={(event) => event.preventDefault()}
      className="inline-grid h-4 w-4 shrink-0 place-items-center rounded-full border border-line text-[10px] font-semibold leading-none text-subtle transition-colors hover:border-brand/40 hover:text-brand"
    >
      ?
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  const child = Children.toArray(children)[0];
  const isControl =
    isValidElement(child) &&
    typeof child.type === 'string' &&
    ['input', 'select', 'textarea'].includes(child.type as string);
  return (
    <label htmlFor={isControl ? id : undefined} className="block min-w-0 space-y-1">
      {hint ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 text-xs font-medium text-subtle">{label}</span>
          <HelpTip text={hint} />
        </span>
      ) : (
        <span className="block text-xs font-medium text-subtle">{label}</span>
      )}
      {isControl ? cloneElement(child as ReactElement<any>, { id }) : children}
      {hint && <span className="block text-[11px] text-subtle">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, className }: { checked: boolean; onChange: (value: boolean) => void; label?: string; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn('inline-flex items-center gap-2 text-[13px] text-muted', className)}
    >
      <span className={cn('relative h-4 w-7 shrink-0 rounded-full border transition-colors', checked ? 'border-brand bg-brand' : 'border-line-2 bg-surface-3')}>
        <span className={cn('absolute top-[1px] h-3 w-3 rounded-full bg-white transition-all', checked ? 'left-[14px]' : 'left-[1px]')} />
      </span>
      {label && <span className="min-w-0 truncate text-left">{label}</span>}
    </button>
  );
}

export function ProgressBar({ value, tone = 'brand' }: { value: number; tone?: Tone }) {
  const toneBg: Record<Tone, string> = {
    brand: 'bg-brand',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
    cyan: 'bg-cyan',
    neutral: 'bg-muted',
  };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div className={cn('h-full rounded-full transition-all duration-500', toneBg[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function EmptyState({ icon = 'box', title, description }: { icon?: IconName; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-2.5 grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface-2 text-subtle">
        <Icon name={icon} size={18} />
      </div>
      <p className="text-[13px] font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted">{description}</p>}
    </div>
  );
}

export function CodeBlock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <pre className={cn('mono max-h-64 overflow-auto rounded-lg border border-line bg-app/70 p-3 text-[11px] leading-relaxed text-muted', className)}>
      {children}
    </pre>
  );
}

export function Avatar({ label = 'AD', size = 'md' }: { label?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cn('grid shrink-0 place-items-center rounded-lg border border-line bg-surface-2 font-semibold text-brand', size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-9 w-9 text-xs')}>
      {label}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = dialogRef.current;
    const focusables = () =>
      root
        ? Array.from(
            root.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];
    (focusables()[0] || root)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('ui-scroll-locked');
    return () => document.body.classList.remove('ui-scroll-locked');
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  const widths = { sm: 'max-w-[480px]', md: 'max-w-[560px]', lg: 'max-w-[760px]', xl: 'max-w-[960px]' };

  return createPortal(
    <div className="ui-sheet fixed inset-0 z-modal flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn('panel ui-dialog animate-modal-in relative flex max-h-[88dvh] w-full flex-col overflow-hidden p-0', widths[size])}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {icon && <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-brand">{icon}</span>}
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-[15px] font-semibold text-fg">{title}</h2>
              {subtitle && <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>}
            </div>
          </div>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && <div className="ui-safe-bottom flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string; icon?: IconName }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded px-2.5 text-xs font-medium transition-colors',
            value === option.value ? 'bg-brand-soft text-brand shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {option.icon && <Icon name={option.icon} size={14} />}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function formatBytes(value: number | string | null | undefined) {
  let bytes = Number(value || 0);
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let unit = 0;
  while (bytes >= 1024 && unit < units.length - 1) {
    bytes /= 1024;
    unit++;
  }
  return `${bytes >= 10 || unit === 0 ? Math.round(bytes) : bytes.toFixed(1)} ${units[unit]}`;
}


export function HelpButton({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton icon="help" label={title} onClick={() => setOpen(true)} />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        subtitle="XreyStudioServer"
        icon={<Icon name="help" size={16} />}
      >
        <div className="space-y-3 text-sm leading-relaxed text-muted">{children}</div>
      </Modal>
    </>
  );
}

type PaginationBarProps = {
  pageIndex: number;
  pageCount: number;
  total: number;
  rowsOnPage: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  hidePageSize?: boolean;
  className?: string;
};

/**
 * Shared list footer: "1-20 of 150" on the left, rows-per-page and numbered
 * pages on the right. Used by every table so all lists paginate alike.
 */
export function PaginationBar({
  pageIndex,
  pageCount,
  total,
  rowsOnPage,
  pageSize,
  pageSizeOptions = [10, 20, 50, 100],
  onPageChange,
  onPageSizeChange,
  hidePageSize = false,
  className,
}: PaginationBarProps) {
  const { t } = useLang();
  const totalPages = Math.max(1, pageCount || 1);
  const current = Math.min(Math.max(0, pageIndex), totalPages - 1);
  const rangeStart = rowsOnPage ? current * pageSize + 1 : 0;
  const rangeEnd = rowsOnPage ? current * pageSize + rowsOnPage : 0;

  const items = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index) as Array<number | 'gap'>;
    const list: Array<number | 'gap'> = [0];
    const start = Math.max(1, current - 1);
    const end = Math.min(totalPages - 2, current + 1);
    if (start > 1) list.push('gap');
    for (let index = start; index <= end; index += 1) list.push(index);
    if (end < totalPages - 2) list.push('gap');
    list.push(totalPages - 1);
    return list;
  })();

  const go = (index: number) => onPageChange(Math.min(Math.max(0, index), totalPages - 1));
  const pageButton = 'ui-touch-target grid h-7 min-w-7 place-items-center rounded-lg border px-1.5 tabular-nums transition-colors';
  const navButton = 'ui-touch-target grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-brand/40 hover:text-fg disabled:opacity-30';

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 text-xs text-muted', className)}>
      <span className="tabular-nums">
        <span className="font-medium text-fg">{rangeStart}–{rangeEnd}</span> {t.of}{' '}
        <span className="font-medium text-fg">{total}</span>
      </span>

      <div className="flex flex-wrap items-center gap-3">
        {!hidePageSize && onPageSizeChange && (
          <label className="flex items-center gap-2">
            <span className="text-subtle max-sm:hidden">{t.pageSize}</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="field h-7 w-auto py-0"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size === 0 ? t.all : size}</option>
              ))}
            </select>
          </label>
        )}

        <nav className="flex items-center gap-1" aria-label={t.page}>
          <button type="button" onClick={() => go(current - 1)} disabled={current <= 0} className={navButton} aria-label={t.previous}>
            <Icon name="chevronLeft" size={15} />
          </button>
          {items.map((item, index) =>
            item === 'gap' ? (
              <span key={`gap-${index}`} className="px-0.5 text-subtle" aria-hidden="true">…</span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => go(item)}
                aria-current={item === current ? 'page' : undefined}
                aria-label={`${t.page} ${item + 1}`}
                className={cn(
                  pageButton,
                  item === current
                    ? 'border-brand/40 bg-brand/15 font-semibold text-brand'
                    : 'border-line bg-surface text-muted hover:border-brand/40 hover:text-fg',
                )}
              >
                {item + 1}
              </button>
            ),
          )}
          <button type="button" onClick={() => go(current + 1)} disabled={current >= totalPages - 1} className={navButton} aria-label={t.next}>
            <Icon name="chevronRight" size={15} />
          </button>
        </nav>
      </div>
    </div>
  );
}
