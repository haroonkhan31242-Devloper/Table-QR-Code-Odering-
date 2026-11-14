import React, { forwardRef, useId, useState } from 'react';
import { ChevronDown, Eye, EyeOff, Search, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/src/utils/format';

const control =
  'w-full rounded-xl border border-line bg-surface text-[15px] sm:text-sm text-ink placeholder:text-muted/80 shadow-sm transition-[border-color,box-shadow] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15';

interface FieldShellProps {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
  trailingLabel?: React.ReactNode;
}

export function FieldShell({ label, hint, error, required, className, children, trailingLabel }: FieldShellProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
            {label}
            {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
          </label>
          {trailingLabel}
        </div>
      )}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={errId} role="alert" className="text-[12.5px] font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[12.5px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: LucideIcon;
  suffix?: React.ReactNode;
  prefix?: string;
  wrapperClassName?: string;
  trailingLabel?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon: Icon, suffix, prefix, required, className, wrapperClassName, trailingLabel, type, ...rest },
  ref
) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} className={wrapperClassName} trailingLabel={trailingLabel}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          {Icon && <Icon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />}
          {prefix && (
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-medium text-muted">{prefix}</span>
          )}
          <input
            ref={ref}
            id={id}
            type={isPassword && reveal ? 'text' : type}
            required={required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={cn(control, 'h-11 px-3.5', Icon && 'pl-10', prefix && 'pl-12', (Boolean(suffix) || isPassword) && 'pr-11', className)}
            {...rest}
          />
          {isPassword ? (
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? 'Hide password' : 'Show password'}
              className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
            >
              {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          ) : (
            suffix && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted">{suffix}</div>
          )}
        </div>
      )}
    </FieldShell>
  );
});

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string | null;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, className, ...rest },
  ref
) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      {({ id, describedBy, invalid }) => (
        <textarea
          ref={ref}
          id={id}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(control, 'min-h-[88px] resize-y px-3.5 py-2.5 leading-relaxed', className)}
          {...rest}
        />
      )}
    </FieldShell>
  );
});

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  wrapperClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, required, className, wrapperClassName, ...rest },
  ref
) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <select
            ref={ref}
            id={id}
            required={required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={cn(control, 'h-11 appearance-none pl-3.5 pr-10', className)}
            {...rest}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        </div>
      )}
    </FieldShell>
  );
});

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  label = 'Search',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={cn(control, 'h-10 pl-10 pr-9 [&::-webkit-search-cancel-button]:hidden')}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  id: idProp,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  id?: string;
  /** Accessible name when no visible label is rendered. */
  ariaLabel?: string;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const toggle = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 disabled:opacity-50',
        checked ? 'border-brand bg-brand' : 'border-line-strong bg-surface-3'
      )}
    >
      {!label && <span className="sr-only">{ariaLabel ?? 'Toggle'}</span>}
      <span
        className={cn(
          'inline-block size-[18px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(.22,1,.36,1)]',
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
        )}
      />
    </button>
  );
  if (!label) return toggle;
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">{description}</span>}
      </label>
      {toggle}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('flex items-start gap-3', disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer')}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-[18px] shrink-0 cursor-pointer rounded-[5px] accent-[var(--brand)]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="block text-[12.5px] leading-relaxed text-muted">{description}</span>}
      </span>
    </label>
  );
}
