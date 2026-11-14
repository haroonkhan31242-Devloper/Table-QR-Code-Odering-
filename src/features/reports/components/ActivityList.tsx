import React from 'react';
import {
  Building2,
  ChefHat,
  ClipboardList,
  KeyRound,
  QrCode,
  Receipt,
  Settings,
  ShieldCheck,
  Table2,
  UserCheck,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityCategory, ActivityLog } from '@/src/types/domain';
import { ACTIVITY_CATEGORY_LABELS } from '@/src/services/audit/activityService';
import { formatDateTime, formatRelative } from '@/src/utils/format';

const ICONS: Record<ActivityCategory, LucideIcon> = {
  auth: KeyRound,
  tenant: Building2,
  settings: Settings,
  menu: UtensilsCrossed,
  table: Table2,
  qr: QrCode,
  order: ClipboardList,
  approval: UserCheck,
  kitchen: ChefHat,
  payment: Wallet,
  receipt: Receipt,
  staff: Users,
  system: ShieldCheck,
};

export function ActivityList({ items, compact }: { items: ActivityLog[]; compact?: boolean }) {
  return (
    <ul className="flex flex-col">
      {items.map((log, i) => {
        const Icon = ICONS[log.category] ?? ShieldCheck;
        return (
          <li key={log.id} className="relative flex gap-3.5 py-3">
            {i < items.length - 1 && <span className="absolute left-[17px] top-12 bottom-0 w-px bg-line" aria-hidden />}
            <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-ink-2">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="text-[14px] font-semibold text-ink">{log.action}</p>
                {!compact && <span className="text-[12px] text-muted">{ACTIVITY_CATEGORY_LABELS[log.category]}</span>}
              </div>
              <p className="mt-0.5 break-words text-[13px] leading-relaxed text-muted">{log.details}</p>
              <p className="mt-1 text-[12px] text-muted">
                <span className="font-medium text-ink-2">{log.actorName}</span> · {log.actorRole} ·{' '}
                <time dateTime={log.at} title={formatDateTime(log.at)}>
                  {formatRelative(log.at)}
                </time>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
