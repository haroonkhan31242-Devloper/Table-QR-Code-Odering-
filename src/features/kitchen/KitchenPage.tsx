import React, { useMemo, useState } from 'react';
import { BellRing, Check, ChefHat, CookingPot, Maximize2, Minimize2, PackageCheck, Timer, X } from 'lucide-react';
import { usePortal } from '@/src/app/layouts/PortalShell';
import { useDatabase, useNow } from '@/src/hooks/useData';
import { Badge, Card, PageHeader } from '@/src/components/ui/Display';
import { Button } from '@/src/components/ui/Button';
import { ConfirmDialog } from '@/src/components/ui/Overlay';
import { useToast } from '@/src/components/feedback/Toast';
import { can } from '@/src/services/access/accessControl';
import { listScoped } from '@/src/services/storage/collection';
import type { Order, OrderStatus } from '@/src/types/domain';
import { cn, formatRelative, minutesSince } from '@/src/utils/format';
import { acceptKitchenOrder, advanceKitchenOrder, rejectKitchenOrder } from '@/src/features/orders/services/orderService';
import { OrderLines } from '@/src/features/orders/components/OrderParts';

const COLUMNS: Array<{ status: OrderStatus; title: string; icon: typeof BellRing; accent: string }> = [
  { status: 'new', title: 'New', icon: BellRing, accent: 'text-info bg-info-soft' },
  { status: 'preparing', title: 'Preparing', icon: CookingPot, accent: 'text-violet bg-violet-soft' },
  { status: 'ready', title: 'Ready at pass', icon: PackageCheck, accent: 'text-success bg-success-soft' },
];

/** When the order entered the kitchen (after approval if any). */
function kitchenStart(o: Order): string {
  const e = o.history.find((h) => h.status === 'new');
  return e?.at ?? o.createdAt;
}

export default function KitchenPage() {
  const ctx = usePortal();
  const db = useDatabase();
  const toast = useToast();
  const now = useNow(15_000);
  const [rejecting, setRejecting] = useState<Order | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [full, setFull] = useState(false);

  const orders = useMemo(() => listScoped(db, 'orders', ctx.scope), [db, ctx.scope]);
  const byStatus = useMemo(() => {
    const map: Record<string, Order[]> = { new: [], preparing: [], ready: [] };
    orders.forEach((o) => map[o.status]?.push(o));
    Object.values(map).forEach((l) => l.sort((a, b) => kitchenStart(a).localeCompare(kitchenStart(b))));
    return map;
  }, [orders]);
  const recentRejected = orders.filter((o) => o.rejection?.stage === 'kitchen').slice(0, 3);
  const waitingApproval = orders.filter((o) => o.status === 'pending_approval').length;

  const canDecide = can(ctx.user, 'kitchen.decide');
  const canStatus = can(ctx.user, 'kitchen.status');

  const run = (o: Order, fn: () => Order, msg: string) => {
    setBusy(o.id);
    try {
      fn();
      toast.success(msg, `${o.number} · ${o.tableLabel}`);
    } catch (err) {
      toast.fromError(err);
    } finally {
      setBusy(null);
    }
  };

  const toggleFull = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setFull(true);
      } else {
        await document.exitFullscreen();
        setFull(false);
      }
    } catch {
      toast.info('Full screen isn’t available in this browser');
    }
  };

  return (
    <>
      <PageHeader
        title="Kitchen display"
        description="Tickets appear here only after they pass the approval step. Oldest first."
        actions={
          <>
            {waitingApproval > 0 && <Badge tone="warning">{waitingApproval} awaiting waiter approval</Badge>}
            <Button variant="secondary" icon={full ? Minimize2 : Maximize2} onClick={toggleFull}>{full ? 'Exit full screen' : 'Full screen'}</Button>
          </>
        }
      />

      {!canDecide && !canStatus && (
        <p className="mb-4 rounded-xl bg-surface-2 px-4 py-3 text-[13px] text-muted">You have view-only access to the kitchen display.</p>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = byStatus[col.status];
          return (
            <section key={col.status} aria-labelledby={`col-${col.status}`} className="flex min-w-0 flex-col rounded-3xl border border-line bg-surface-2/60 p-3">
              <header className="flex items-center justify-between px-2 pb-3 pt-1">
                <h2 id={`col-${col.status}`} className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
                  <span className={cn('flex size-8 items-center justify-center rounded-xl', col.accent)}>
                    <col.icon className="size-4" aria-hidden />
                  </span>
                  {col.title}
                </h2>
                <span className="tabular rounded-full bg-surface px-2.5 py-0.5 text-[13px] font-bold text-ink shadow-sm">{list.length}</span>
              </header>
              <div className="flex flex-col gap-3">
                {list.length === 0 && (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-4 py-10 text-center text-[13px] text-muted">
                    <ChefHat className="mb-2 size-5 opacity-60" aria-hidden />
                    No tickets
                  </div>
                )}
                {list.map((o) => {
                  const mins = minutesSince(kitchenStart(o), now);
                  const late = mins >= 20;
                  const warn = mins >= 12 && !late;
                  return (
                    <article
                      key={o.id}
                      className={cn(
                        'rounded-2xl border bg-surface p-4 shadow-sm transition-shadow',
                        late ? 'border-danger/50' : warn ? 'border-warning/50' : 'border-line'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-display text-[22px] font-bold leading-none text-ink">{o.tableLabel}</p>
                          <p className="mt-1.5 text-[12.5px] text-muted">{o.number}{o.approvedBy ? ` · approved by ${o.approvedBy.name}` : ''}</p>
                        </div>
                        <span
                          className={cn(
                            'tabular inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-bold',
                            late ? 'bg-danger-soft text-danger' : warn ? 'bg-warning-soft text-warning' : 'bg-surface-2 text-ink-2'
                          )}
                          title={late ? 'Over 20 minutes' : undefined}
                        >
                          <Timer className="size-3.5" aria-hidden /> {mins}m
                        </span>
                      </div>
                      <div className="mt-4">
                        <OrderLines lines={o.lines} showPrices={false} dense />
                      </div>
                      {o.customerNote && <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-[13px] font-medium text-warning">Note: {o.customerNote}</p>}
                      <div className="mt-4 flex flex-wrap gap-2 [&>button:last-child]:min-w-[9rem] [&>button:last-child]:flex-1">
                        {o.status === 'new' && canDecide && (
                          <>
                            <Button size="sm" variant="outline-danger" icon={X} onClick={() => setRejecting(o)}>Reject</Button>
                            <Button size="sm" icon={Check} block loading={busy === o.id} onClick={() => run(o, () => acceptKitchenOrder(o.id), 'Accepted — preparing')}>Accept & start</Button>
                          </>
                        )}
                        {o.status === 'preparing' && (
                          <>
                            {canDecide && <Button size="sm" variant="outline-danger" icon={X} onClick={() => setRejecting(o)} aria-label={`Reject ${o.number}`}>Reject</Button>}
                            {canStatus && <Button size="sm" block icon={PackageCheck} loading={busy === o.id} onClick={() => run(o, () => advanceKitchenOrder(o.id, 'preparing'), 'Marked ready')}>Mark ready</Button>}
                          </>
                        )}
                        {o.status === 'ready' && canStatus && (
                          <Button size="sm" block variant="secondary" icon={Check} loading={busy === o.id} onClick={() => run(o, () => advanceKitchenOrder(o.id, 'ready'), 'Completed — handed to service')}>
                            Complete & hand over
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {recentRejected.length > 0 && (
        <Card className="mt-6 p-5">
          <h2 className="text-[14px] font-semibold text-ink">Recently rejected by kitchen</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {recentRejected.map((o) => (
              <li key={o.id} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <span className="font-semibold text-ink">{o.number} · {o.tableLabel}</span>
                <span className="text-danger">“{o.rejection?.reason}”</span>
                <span className="text-muted">— {o.rejection?.byName}, {formatRelative(o.rejection!.at, now)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title={`Reject ${rejecting?.number ?? ''}?`}
        description="The ticket leaves the kitchen and the order is marked rejected. Waiters and managers will see your reason on the order."
        reasonLabel="Rejection reason"
        reasonPlaceholder="e.g. Out of brioche buns"
        confirmLabel="Reject ticket"
        onConfirm={(reason) => {
          if (!rejecting) return;
          try {
            rejectKitchenOrder(rejecting.id, reason);
            toast.success('Ticket rejected', rejecting.number);
            setRejecting(null);
          } catch (err) {
            toast.fromError(err);
          }
        }}
      />
    </>
  );
}
