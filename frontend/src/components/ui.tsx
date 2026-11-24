'use client';
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './icons';

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

type CardProps = { children: ReactNode; className?: string; padded?: boolean; delay?: number };

export function Card({ children, className, padded = true, delay }: CardProps) {
  return (
    <section
      className={cn('panel animate-fade-up', padded && 'p-5', className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </section>
  );
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-fg">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
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
    <div className="animate-fade-up mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-3.5">
        {icon && (
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-brand/25 bg-brand-soft text-brand shadow-[0_0_24px_-8px_var(--brand)]">
            <Icon name={icon} size={20} />
          </div>
        )}
        <div>
          {eyebrow && (
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
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
  primary:
    'border-brand/40 bg-gradient-to-b from-brand to-brand-2 text-white shadow-[0_8px_24px_-10px_var(--brand)] hover:brightness-110',
  secondary: 'border-line-2 bg-surface-2 text-fg hover:border-brand/40 hover:bg-surface-3',
  ghost: 'border-transparent bg-transparent text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'border-danger/30 bg-danger/10 text-danger hover:bg-danger/20',
  subtle: 'border-line bg-surface text-muted hover:text-fg hover:border-line-2',
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
        'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
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
        'grid h-8 w-8 place-items-center rounded-lg border border-transparent transition-colors',
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
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide',
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
    <Card delay={delay} className="group relative overflow-hidden">
      <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-brand/5 blur-2xl transition-opacity group-hover:opacity-100" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="mt-3 text-[28px] font-semibold leading-none tracking-tight text-fg tabular-nums">{value}</p>
          {hint && <p className="mt-2 text-[11px] text-subtle">{hint}</p>}
        </div>
        <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl border', toneClasses[tone])}>
          <Icon name={icon} size={18} />
        </div>
      </div>
    </Card>
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
    <label htmlFor={isControl ? id : undefined} className="block space-y-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">{label}</span>
      {isControl ? cloneElement(child as ReactElement<any>, { id }) : children}
      {hint && <span className="block text-[11px] text-subtle">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5 text-sm text-muted"
    >
      <span className={cn('relative h-5 w-9 rounded-full border transition-colors', checked ? 'border-brand/50 bg-brand' : 'border-line-2 bg-surface-3')}>
        <span className={cn('absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
      {label}
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
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface-2 text-subtle">
        <Icon name={icon} size={20} />
      </div>
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted">{description}</p>}
    </div>
  );
}

export function CodeBlock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <pre className={cn('mono max-h-64 overflow-auto rounded-xl border border-line bg-app/70 p-3 text-[11px] leading-relaxed text-muted', className)}>
      {children}
    </pre>
  );
}

export function Avatar({ label = 'AD', size = 'md' }: { label?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cn('grid shrink-0 place-items-center rounded-xl border border-brand/30 bg-gradient-to-br from-brand/30 to-brand-2/10 font-semibold text-brand', size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-10 w-10 text-xs')}>
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

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-app/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn('panel animate-modal-in relative flex max-h-[88vh] w-full flex-col overflow-hidden p-0', widths[size])}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex items-start gap-3">
            {icon && <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-lg border border-brand/25 bg-brand-soft text-brand">{icon}</span>}
            <div>
              <h2 id={titleId} className="text-base font-semibold text-fg">{title}</h2>
              {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
            </div>
          </div>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>
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
    <div className="inline-flex rounded-lg border border-line bg-surface-2 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
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
