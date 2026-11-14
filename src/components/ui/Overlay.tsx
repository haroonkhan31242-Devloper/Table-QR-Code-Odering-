import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/src/utils/format';
import { Button } from './Button';
import { Textarea } from './Field';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

let openCount = 0;

function useOverlayBehaviour(open: boolean, onClose: () => void, panel: React.RefObject<HTMLDivElement | null>) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    openCount++;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => {
      const el = panel.current;
      if (!el) return;
      const target = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el;
      target.focus({ preventScroll: true });
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      const el = panel.current;
      if (!el) return;
      // Only the top-most overlay responds.
      const all = document.querySelectorAll('[data-overlay-panel]');
      if (all[all.length - 1] !== el) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab') {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
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
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) document.body.style.overflow = '';
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, panel]);
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Prevent closing via backdrop click (e.g. forms with unsaved changes). */
  dismissible?: boolean;
}

const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

/** Centered dialog on desktop, bottom sheet on phones. */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', dismissible = true }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useOverlayBehaviour(open, onClose, panel);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            onClick={dismissible ? onClose : undefined}
            aria-hidden
          />
          <motion.div
            ref={panel}
            data-overlay-panel
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 420, damping: 34 } }}
            exit={{ opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.14 } }}
            className={cn(
              'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-lg outline-none sm:rounded-2xl',
              widths[size]
            )}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 id={titleId} className="text-[17px] font-semibold text-ink">
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="mt-0.5 text-[13px] leading-relaxed text-muted">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="-mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-[18px]" />
              </button>
            </div>
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
            {footer && (
              <div className="safe-bottom flex flex-col-reverse gap-2 border-t border-line bg-surface-2/60 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:pb-3.5">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/** Slide-over panel from the right (desktop) / full-height on mobile. */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = 'right',
  widthClass = 'max-w-md',
}: Omit<DialogProps, 'size' | 'dismissible'> & { side?: 'left' | 'right'; widthClass?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlayBehaviour(open, onClose, panel);
  const from = side === 'right' ? '100%' : '-100%';
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cn('fixed inset-0 z-[60] flex', side === 'right' ? 'justify-end' : 'justify-start')}>
          <motion.div
            className="absolute inset-0 bg-[var(--overlay)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panel}
            data-overlay-panel
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ x: from }}
            animate={{ x: 0, transition: { type: 'spring', stiffness: 380, damping: 38 } }}
            exit={{ x: from, transition: { duration: 0.18 } }}
            className={cn('relative flex h-full w-full flex-col border-line bg-surface shadow-lg outline-none', side === 'right' ? 'border-l' : 'border-r', widthClass)}
          >
            {title !== null && (
              <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <h2 id={titleId} className="text-[17px] font-semibold text-ink">
                    {title}
                  </h2>
                  {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close panel"
                  className="-mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
                >
                  <X className="size-[18px]" />
                </button>
              </div>
            )}
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
            {footer && <div className="safe-bottom border-t border-line px-5 py-3.5">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  /** Require a free-text reason (e.g. order rejection). */
  reasonLabel?: string;
  reasonPlaceholder?: string;
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  tone = 'danger',
  reasonLabel,
  reasonPlaceholder,
  busy,
}: ConfirmProps) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);
  const reasonError = reasonLabel && touched && reason.trim().length < 3 ? 'Please give a short reason (at least 3 characters).' : null;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (reasonLabel && reason.trim().length < 3) return;
    void onConfirm(reason.trim());
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={
        <span className="flex items-center gap-2.5">
          {tone === 'danger' && (
            <span className="flex size-8 items-center justify-center rounded-lg bg-danger-soft text-danger">
              <AlertTriangle className="size-4" aria-hidden />
            </span>
          )}
          {title}
        </span>
      }
    >
      <form id="confirm-form" onSubmit={submit} className="flex flex-col gap-4">
        <div className="text-[14px] leading-relaxed text-ink-2">{description}</div>
        {reasonLabel && (
          <Textarea
            label={reasonLabel}
            required
            data-autofocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={reasonPlaceholder}
            error={reasonError}
            maxLength={200}
          />
        )}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
