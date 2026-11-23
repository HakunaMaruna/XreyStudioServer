'use client';
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

type CardProps = { children: ReactNode; className?: string; padded?: boolean; delay?: number };

export function Card({ children, className, padded = true, delay }: CardProps) {
  return (
    <section className={cn('card animate-fade-up', className)} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      <div className={cn(padded && 'card-body')}>{children}</div>
    </section>
  );
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 d-flex align-items-start justify-content-between gap-3">
      <div>
        <h2 className="card-title h5 mb-1">{title}</h2>
        {subtitle && <p className="text-muted small mb-0">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, icon, actions, eyebrow }: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="page-header animate-fade-up">
      <div className="page-header-title">
        {eyebrow && <div className="text-uppercase text-muted small mb-1">{eyebrow}</div>}
        <div className="d-flex align-items-center gap-3">
          {icon && (
            <span className="avatar avatar-lg text-primary" style={{ background: 'var(--brand-soft)' }}>
              <Icon name={icon} size={20} />
            </span>
          )}
          <div>
            <h1 className="page-title mb-1">{title}</h1>
            {subtitle && <p className="text-muted mb-0">{subtitle}</p>}
          </div>
        </div>
      </div>
      {actions && <div className="page-header-actions d-flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
  size?: 'sm' | 'md';
  icon?: IconName;
  loading?: boolean;
};

const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'btn-primary',
  secondary: 'btn-outline-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  subtle: 'btn-secondary',
};

export function Button({ variant = 'secondary', size = 'md', icon, loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn('btn', variants[variant], size === 'sm' && 'btn-sm', className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Icon name="refresh" size={15} className="animate-spin" /> : icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, tone = 'default', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName; label: string; tone?: 'default' | 'danger' | 'brand';
}) {
  return (
    <button
      title={label}
      aria-label={label}
      className={cn('btn btn-sm', tone === 'danger' ? 'btn-danger' : tone === 'brand' ? 'btn-primary' : 'btn-outline-secondary', className)}
      {...props}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'cyan' | 'neutral';
const toneClasses: Record<Tone, string> = {
  brand: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  cyan: 'bg-azure',
  neutral: 'bg-secondary',
};

export function Badge({ children, tone = 'neutral', dot = false, className }: {
  children: ReactNode; tone?: Tone; dot?: boolean; className?: string;
}) {
  return (
    <span className={cn('badge', toneClasses[tone], className)}>
      {dot && <span className="status-dot" style={{ background: 'currentColor' }} />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const value = status.toUpperCase();
  if (['ONLINE', 'ACTIVE', 'RESOLVED', 'APPLIED', 'ENABLED', 'HEALTHY', 'PAID'].includes(value)) {
    return <Badge tone="success" dot>{status}</Badge>;
  }
  if (['OFFLINE', 'DISABLED', 'EXPIRED', 'FIRING', 'ERROR', 'PENDING'].includes(value)) {
    return <Badge tone="danger" dot>{status}</Badge>;
  }
  return <Badge tone="warning" dot>{status}</Badge>;
}

export function StatCard({ label, value, icon, tone = 'brand', hint, delay }: {
  label: string; value: ReactNode; icon: IconName; tone?: Tone; hint?: string; delay?: number;
}) {
  return (
    <Card delay={delay}>
      <div className="d-flex align-items-start justify-content-between gap-3">
        <div>
          <div className="text-muted small">{label}</div>
          <div className="h2 mb-1 mt-2">{value}</div>
          {hint && <div className="text-muted small">{hint}</div>}
        </div>
        <span className={cn('avatar', toneClasses[tone])}>
          <Icon name={icon} size={18} />
        </span>
      </div>
    </Card>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="form-label d-block">
      <span className="form-label">{label}</span>
      {children}
      {hint && <span className="form-hint">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label?: string }) {
  return (
    <label className="form-check form-switch">
      <input className="form-check-input" type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label && <span className="form-check-label">{label}</span>}
    </label>
  );
}

const progressTone: Record<Tone, string> = {
  brand: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger',
  info: 'bg-info', cyan: 'bg-azure', neutral: 'bg-secondary',
};

export function ProgressBar({ value, tone = 'brand' }: { value: number; tone?: Tone }) {
  return (
    <div className="progress" style={{ height: 6 }}>
      <div className={cn('progress-bar', progressTone[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function EmptyState({ icon = 'box', title, description }: { icon?: IconName; title: string; description?: string }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={24} /></div>
      <p className="empty-title h5">{title}</p>
      {description && <p className="empty-subtitle text-muted">{description}</p>}
    </div>
  );
}

export function CodeBlock({ children, className }: { children: ReactNode; className?: string }) {
  return <pre className={cn('mono small p-3 border rounded', className)} style={{ background: 'var(--surface-2)', maxHeight: 320, overflow: 'auto' }}>{children}</pre>;
}

export function Avatar({ label = 'AD', size = 'md' }: { label?: string; size?: 'sm' | 'md' }) {
  return <span className={cn('avatar', size === 'sm' ? 'avatar-sm' : 'avatar-lg', 'text-primary')} style={{ background: 'var(--brand-soft)' }}>{label}</span>;
}

export function Modal({ open, onClose, title, subtitle, icon, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; icon?: ReactNode;
  children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal modal-blur fade show d-block" style={{ background: 'rgba(0,0,0,.55)' }} onClick={onClose}>
      <div className={cn('modal-dialog modal-dialog-centered', size !== 'md' && `modal-${size}`)} onClick={(e) => e.stopPropagation()}>
        <div className="modal-content animate-modal-in">
          <div className="modal-header">
            <div className="d-flex align-items-start gap-3">
              {icon && <span className="avatar text-primary" style={{ background: 'var(--brand-soft)' }}>{icon}</span>}
              <div>
                <h3 className="modal-title">{title}</h3>
                {subtitle && <p className="text-muted small mb-0">{subtitle}</p>}
              </div>
            </div>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-footer">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: Array<{ value: T; label: string; icon?: IconName }>; value: T; onChange: (value: T) => void;
}) {
  return (
    <div className="btn-group" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn('btn', value === option.value ? 'btn-primary' : 'btn-outline-secondary')}
          onClick={() => onChange(option.value)}
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
  while (bytes >= 1024 && unit < units.length - 1) { bytes /= 1024; unit++; }
  return `${bytes >= 10 || unit === 0 ? Math.round(bytes) : bytes.toFixed(1)} ${units[unit]}`;
}
