import React from 'react';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import type { Tone } from '@/src/constants/status';
import { cn, initials } from '@/src/utils/format';

/* -------------------------------- Badge -------------------------------- */

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-ink-2',
  brand: 'bg-brand-soft text-brand-strong',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  violet: 'bg-violet-soft text-violet',
};

const dotClasses: Record<Tone, string> = {
  neutral: 'bg-muted',
  brand: 'bg-brand',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  violet: 'bg-violet',
};

export function Badge({
  tone = 'neutral',
  children,
  dot,
  className,
  icon: Icon,
}: {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
  icon?: LucideIcon;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold',
        toneClasses[tone],
        className
      )}
    >
      {dot && <span className={cn('size-1.5 rounded-full', dotClasses[tone])} aria-hidden />}
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  );
}

export function StatusBadge({ meta }: { meta: { label: string; tone: Tone } }) {
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}

/* --------------------------------- Card -------------------------------- */

export function Card({
  className,
  children,
  as: As = 'div',
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'article' | 'li' }) {
  return (
    <As className={cn('min-w-0 rounded-2xl border border-line bg-surface shadow-sm', className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  description,
  action,
  icon: Icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-5', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
            <Icon className="size-4" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ------------------------------- Avatar -------------------------------- */

const avatarPalette = ['#E0552B', '#2F7D5B', '#2B6CB0', '#7C4DCC', '#B7791F', '#C2412D', '#0F766E', '#9D3C72'];

export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const bg = avatarPalette[hash % avatarPalette.length];
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, background: bg, fontSize: Math.max(11, size * 0.36) }}
    >
      {initials(name)}
    </span>
  );
}

/* ------------------------------ Skeleton ------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-surface-2', className)} aria-hidden>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/5" />
    </div>
  );
}

/* ------------------------------ EmptyState ----------------------------- */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      <div className="relative mb-4">
        <div className="absolute inset-0 scale-150 rounded-full bg-brand-soft blur-xl" aria-hidden />
        <span className="relative flex size-12 items-center justify-center rounded-2xl border border-line bg-surface text-brand-strong shadow-sm">
          <Icon className="size-5" aria-hidden />
        </span>
      </div>
      <p className="font-display text-base font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13.5px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ------------------------------ Segmented ------------------------------ */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; count?: number; icon?: LucideIcon }>;
  label: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-surface-2 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-all duration-150',
              size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-3 text-[13px]',
              active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
            )}
          >
            {Icon && <Icon className="size-3.5" aria-hidden />}
            {o.label}
            {o.count !== undefined && (
              <span className={cn('tabular rounded-md px-1.5 text-[11px] font-semibold', active ? 'bg-brand-soft text-brand-strong' : 'bg-surface-3 text-muted')}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------ Pagination ----------------------------- */

export function Pagination({
  page,
  pageCount,
  total,
  onPage,
  label = 'results',
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (p: number) => void;
  label?: string;
}) {
  if (total === 0) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 px-1 pt-4 text-[13px] text-muted">
      <span className="tabular">
        Page {page} of {pageCount} · {total} {label}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="flex size-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 hover:bg-surface-2 disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
          className="flex size-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 hover:bg-surface-2 disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}

/* ------------------------------ PageHeader ----------------------------- */

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-strong">{eyebrow}</div>}
        <h1 className="text-balance text-[26px] font-bold leading-tight text-ink sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ------------------------------- StatCard ------------------------------ */

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'brand',
  trend,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  trend?: { value: number; label: string } | null;
}) {
  return (
    <Card className="group relative overflow-hidden p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        <span className={cn('flex size-9 items-center justify-center rounded-xl', toneClasses[tone])}>
          <Icon className="size-[18px]" aria-hidden />
        </span>
      </div>
      <p className="tabular mt-3 font-display text-[28px] font-bold leading-none text-ink">{value}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
        {trend && Number.isFinite(trend.value) && (
          <span className={cn('tabular rounded-md px-1.5 py-0.5 font-semibold', trend.value >= 0 ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>
            {trend.value >= 0 ? '+' : ''}
            {trend.value}%
          </span>
        )}
        {trend && <span>{trend.label}</span>}
        {hint && <span>{hint}</span>}
      </div>
    </Card>
  );
}

/* -------------------------------- Bars --------------------------------- */

export function BarList({
  rows,
  format,
  empty = 'No data in this period yet.',
}: {
  rows: Array<{ key: string; label: React.ReactNode; value: number; sub?: React.ReactNode }>;
  format: (n: number) => string;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length || rows.every((r) => r.value === 0)) return <p className="py-6 text-center text-[13px] text-muted">{empty}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-medium text-ink">{r.label}</span>
            <span className="tabular shrink-0 font-semibold text-ink-2">{format(r.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          {r.sub && <div className="mt-1 text-[12px] text-muted">{r.sub}</div>}
        </li>
      ))}
    </ul>
  );
}
