import React from 'react';
import { Clock, MessageSquareText } from 'lucide-react';
import type { Order, OrderLine } from '@/src/types/domain';
import { ORDER_STATUS, PAYMENT_STATUS } from '@/src/constants/status';
import { StatusBadge } from '@/src/components/ui/Display';
import { cn, formatDateTime, formatMoney, formatTime } from '@/src/utils/format';
import { OrderOriginBadges } from './OrderOriginBadges';

export function OrderLines({ lines, showPrices = true, dense }: { lines: OrderLine[]; showPrices?: boolean; dense?: boolean }) {
  return (
    <ul className={cn('flex flex-col', dense ? 'gap-2' : 'gap-3')}>
      {lines.map((l) => (
        // Grid (not flex) so the price column can never overlap a long item name.
        <li key={l.id} className={cn('grid items-start gap-x-3', showPrices ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[auto_minmax(0,1fr)]')}>
          <span className="tabular flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-surface-3 px-1.5 text-[12.5px] font-bold text-ink">
            {l.quantity}×
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn('break-words font-medium leading-snug text-ink', dense ? 'text-[14px]' : 'text-[14.5px]')}>{l.title}</p>
            {(l.variant || l.addons.length > 0) && (
              <p className="text-[12.5px] text-muted">
                {[l.variant?.name, ...l.addons.map((a) => `+ ${a.name}`)].filter(Boolean).join(' · ')}
              </p>
            )}
            {l.note && (
              <p className="mt-1 inline-flex items-start gap-1.5 rounded-md bg-warning-soft px-2 py-1 text-[12.5px] font-medium text-warning">
                <MessageSquareText className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {l.note}
              </p>
            )}
          </div>
          {showPrices && <span className="tabular shrink-0 text-[13.5px] font-semibold text-ink-2">{formatMoney(l.lineTotal)}</span>}
        </li>
      ))}
    </ul>
  );
}

export function OrderTotals({ order }: { order: Pick<Order, 'subtotal' | 'serviceCharge' | 'total'> }) {
  return (
    <dl className="flex flex-col gap-1.5 text-[13.5px]">
      <div className="flex justify-between text-muted"><dt>Subtotal</dt><dd className="tabular">{formatMoney(order.subtotal)}</dd></div>
      {order.serviceCharge > 0 && (
        <div className="flex justify-between text-muted"><dt>Service charge</dt><dd className="tabular">{formatMoney(order.serviceCharge)}</dd></div>
      )}
      <div className="flex justify-between border-t border-line pt-2 text-[15px] font-bold text-ink"><dt>Total</dt><dd className="tabular">{formatMoney(order.total)}</dd></div>
    </dl>
  );
}

export function OrderTimeline({ order }: { order: Order }) {
  return (
    <ol className="flex flex-col gap-0">
      {order.history.map((e, i) => (
        <li key={`${e.at}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
          {i < order.history.length - 1 && <span className="absolute left-[5px] top-4 bottom-0 w-px bg-line" aria-hidden />}
          <span className={cn('mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-surface ring-1', i === order.history.length - 1 ? 'bg-brand ring-brand' : 'bg-surface-3 ring-line-strong')} aria-hidden />
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium text-ink">{e.label}</p>
            <p className="text-[12px] text-muted">
              {e.actorName} · {e.actorRole} · <time dateTime={e.at}>{formatDateTime(e.at)}</time>
            </p>
            {e.note && <p className="mt-1 rounded-md bg-surface-2 px-2 py-1 text-[12.5px] text-ink-2">“{e.note}”</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function OrderMeta({ order, className }: { order: Order; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <OrderOriginBadges order={order} />
      <StatusBadge meta={ORDER_STATUS[order.status]} />
      {order.status !== 'rejected' && <StatusBadge meta={PAYMENT_STATUS[order.paymentStatus]} />}
      <span className="inline-flex items-center gap-1 text-[12.5px] text-muted">
        <Clock className="size-3.5" aria-hidden /> {formatTime(order.createdAt)}
      </span>
    </div>
  );
}
