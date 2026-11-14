import React, { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/src/utils/format';

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  hidden?: boolean;
}

/** Accessible dropdown menu with keyboard support. */
export function Menu({
  trigger,
  items,
  align = 'end',
  header,
  className,
}: {
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu'; 'aria-controls': string }) => React.ReactNode;
  items: Array<MenuItem | 'separator'>;
  align?: 'start' | 'end';
  header?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const visible = items.filter((i) => i === 'separator' || !i.hidden);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      const els = [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])];
      const idx = els.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape') {
        setOpen(false);
        (root.current?.querySelector('[aria-haspopup]') as HTMLElement | null)?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        els[(idx + 1) % els.length]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        els[(idx - 1 + els.length) % els.length]?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.setTimeout(() => list.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus(), 10);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={cn('relative', className)}>
      {trigger({ onClick: () => setOpen((v) => !v), 'aria-expanded': open, 'aria-haspopup': 'menu', 'aria-controls': id })}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={list}
            id={id}
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97, transition: { duration: 0.1 } }}
            transition={{ duration: 0.14 }}
            className={cn(
              'absolute top-full z-50 mt-2 min-w-[210px] origin-top overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-lg',
              align === 'end' ? 'right-0' : 'left-0'
            )}
          >
            {header && <div className="border-b border-line px-2.5 pb-2 pt-1.5 mb-1">{header}</div>}
            {visible.map((item, i) =>
              item === 'separator' ? (
                <div key={`sep-${i}`} className="my-1 h-px bg-line" role="separator" />
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] font-medium outline-none transition-colors disabled:opacity-40',
                    item.tone === 'danger' ? 'text-danger hover:bg-danger-soft focus:bg-danger-soft' : 'text-ink-2 hover:bg-surface-2 hover:text-ink focus:bg-surface-2'
                  )}
                >
                  {item.icon && <item.icon className="size-4 shrink-0" aria-hidden />}
                  {item.label}
                </button>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
