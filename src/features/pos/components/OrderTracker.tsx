import React, { useMemo, useState } from 'react';
import { CheckCheck, ClipboardList, PackageCheck, Wallet } from 'lucide-react';
import type { Order, OrderStatus } from '@/src/types/domain';
import { Card, EmptyState, Segmented, StatusBadge } from '@/src/components/ui/Display';
import { Button } from '@/src/components/ui/Button';
import { useToast } from '@/src/components/feedback/Toast';
import { ORDER_STATUS, PAYMENT_STATUS } from '@/src/constants/status';
import { cn, formatMoney, formatRelative } from '@/src/utils/format';
import { handOverTakeaway } from '../services/posService';
import { isBillable } from '../services/billingService';
import { OrderOriginBadges } from '@/src/features/orders/components/OrderOriginBadges';

type Filter = 'pos' | 'all';

const STEPS: Array<{ label: string; statuses: OrderStatus[] }> = [
  { label: 'New', statuses: ['new'] },
  { label: 'Preparing', statuses: ['preparing'] },
  { label: 'Ready', statuses: ['ready'] },
  { label: 'Completed', statuses: ['completed', 'served'] },
];

/** Live progress of today's open orders, straight from the kitchen workflow. */
export function OrderTracker({
  orders,
  now,
  canCreate,
  canCollect,
  onCollect,
}: {
  orders: Order[];
  now: number;
  canCreate: boolean;
  canCollect: boolean;
  onCollect: (orderId: string) => void;
}) {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('pos');
  const [busy, setBusy] = useState<string | null>(null);

  const open = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status !== 'rejected' &&
          o.status !== 'pending_approval' &&
          (o.status !== 'served' || o.paymentStatus === 'unpaid') &&
          (filter === 'all' || o.source === 'pos')
      ),
    [orders, filter]
  );

  const handOver = (o: Order) => {
    setBusy(o.id);
    try {
      handOverTakeaway(o.id);
      toast.success('Handed to customer', o.number);
    } catch (err) {
      toast.fromError(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13.5px] text-muted">Updates live as the kitchen moves each ticket. Unpaid orders stay here until they’re settled.</p>
        <Segmented<Filter>
          label="Show orders"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'pos', label: 'POS orders', count: orders.filter((o) => o.source === 'pos' && o.status !== 'rejected' && o.status !== 'pending_approval' && (o.status !== 'served' || o.paymentStatus === 'unpaid')).length },
            { value: 'all', label: 'All open' },
          ]}
        />
      </div>
      {open.length === 0 ? (
        <Card>
          <EmptyState icon={ClipboardList} title="No open orders" description={filter === 'pos' ? 'Orders you ring up at the POS appear here.' : 'Nothing is in progress right now.'} />
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {open.map((o) => {
            const step = STEPS.findIndex((s) => s.statuses.includes(o.status));
            const readyForPickup = o.type === 'takeaway' && o.status === 'completed';
            return (
              <li key={o.id}>
                <Card className={cn('flex h-full flex-col p-4', readyForPickup && 'ring-2 ring-success/40')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-[18px] font-bold text-ink">{o.tableLabel}</p>
                      <p className="text-[12.5px] text-muted">{o.number} · {formatRelative(o.createdAt, now)} · {formatMoney(o.total)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <StatusBadge meta={ORDER_STATUS[o.status]} />
                      <StatusBadge meta={PAYMENT_STATUS[o.paymentStatus]} />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5"><OrderOriginBadges order={o} showQr /></div>
                  <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label={`Progress: ${ORDER_STATUS[o.status].label}`}>
                    {STEPS.map((s, i) => {
                      const done = i <= step;
                      return (
                        <li key={s.label} className="flex flex-col gap-1.5">
                          <span className={cn('h-1.5 rounded-full', done ? (i === step ? 'bg-brand' : 'bg-brand/50') : 'bg-surface-3')} aria-hidden />
                          <span className={cn('text-[11.5px]', done ? 'font-semibold text-ink' : 'text-muted')}>{s.label}</span>
                        </li>
                      );
                    })}
                  </ol>
                  <p className="mt-3 line-clamp-2 text-[12.5px] text-muted">{o.lines.map((l) => `${l.quantity}× ${l.title}`).join(', ')}</p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    {readyForPickup && canCreate && (
                      <Button size="sm" icon={CheckCheck} loading={busy === o.id} onClick={() => handOver(o)}>
                        Hand over
                      </Button>
                    )}
                    {isBillable(o) && canCollect && (
                      <Button size="sm" variant="secondary" icon={Wallet} onClick={() => onCollect(o.id)}>
                        Collect payment
                      </Button>
                    )}
                    {readyForPickup && !canCreate && (
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-success"><PackageCheck className="size-4" aria-hidden /> Ready for pickup</span>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
