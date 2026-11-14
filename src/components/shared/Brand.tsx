import React, { useState } from 'react';
import { Moon, Sun, UtensilsCrossed } from 'lucide-react';
import { useTheme } from '@/src/app/providers/ThemeProvider';
import { resolveImage } from '@/src/services/images/imageStorage';
import { cn } from '@/src/utils/format';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path d="M9 11.5h14M16 11.5V24" stroke="var(--brand-ink)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M11.5 8h9" stroke="var(--brand-ink)" strokeWidth="2.6" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}

export function Logo({ className, sub }: { className?: string; sub?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[17px] font-bold tracking-tight text-ink">TableCraft</span>
        {sub && <span className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{sub}</span>}
      </span>
    </span>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const Icon = theme === 'dark' ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      className={cn('flex size-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-ink', className)}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}

/** Image that resolves local-storage references and degrades to a tasteful placeholder. */
export function FoodImage({
  src,
  alt,
  className,
  iconClassName,
  loading = 'lazy',
}: {
  src?: string;
  alt: string;
  className?: string;
  iconClassName?: string;
  loading?: 'lazy' | 'eager';
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const resolved = resolveImage(src);
  if (!resolved || failed === resolved) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn(
          'flex items-center justify-center bg-[radial-gradient(circle_at_30%_20%,var(--brand-soft),transparent_60%),linear-gradient(135deg,var(--surface-2),var(--surface-3))] text-brand-strong/70',
          className
        )}
      >
        <UtensilsCrossed className={cn('size-6', iconClassName)} aria-hidden />
      </div>
    );
  }
  return (
    <img
      src={resolved}
      alt={alt}
      loading={loading}
      decoding="async"
      onError={() => setFailed(resolved)}
      className={cn('object-cover', className)}
    />
  );
}
