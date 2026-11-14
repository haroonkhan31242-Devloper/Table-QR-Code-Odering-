import React, { forwardRef } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/src/utils/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'outline-danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-hover shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-2 shadow-sm',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  soft: 'bg-brand-soft text-brand-strong hover:brightness-95',
  danger: 'bg-danger text-white hover:brightness-110 shadow-sm dark:text-[#1a0505]',
  'outline-danger': 'border border-line text-danger hover:bg-danger-soft hover:border-danger/40',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon: Icon, iconRight: IconRight, block, className, children, disabled, type = 'button', ...rest },
  ref
) {
  const iconSize = size === 'sm' ? 'size-3.5' : 'size-4';
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-[background-color,border-color,color,box-shadow,filter,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className={cn(iconSize, 'animate-spin')} aria-hidden /> : Icon ? <Icon className={iconSize} aria-hidden /> : null}
      {children}
      {IconRight && !loading ? <IconRight className={iconSize} aria-hidden /> : null}
    </button>
  );
});

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  size?: 'sm' | 'md';
  tone?: 'default' | 'danger';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = 'md', tone = 'default', className, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 disabled:opacity-40',
        tone === 'danger' ? 'hover:text-danger hover:bg-danger-soft' : 'hover:text-ink',
        size === 'sm' ? 'size-8' : 'size-10',
        className
      )}
      {...rest}
    >
      <Icon className={size === 'sm' ? 'size-4' : 'size-[18px]'} aria-hidden />
    </button>
  );
});
