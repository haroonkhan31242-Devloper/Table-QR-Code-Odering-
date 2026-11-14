import React, { useMemo, useState } from 'react';
import { Check, CheckCheck, ClipboardList, Info, UserCheck, X } from 'lucide-react';
import { usePortal } from '@/src/app/layouts/PortalShell';
import { useDatabase, useDebounced, useNow } from '@/src/hooks/useData';
import { Badge, Card, EmptyState, PageHeader, Pagination, Segmented } from '@/src/components/ui/Display';
import { Button } from '@/src/components/ui/Button';
import { SearchInput } from '@/src/components/ui/Field';
import { ConfirmDialog, Drawer } from '@/src/components/ui/Overlay';
import { useToast } from '@/src/components/feedback/Toast';
import { can } from '@/src/services/access/accessControl';
import { listScoped, paginate, searchRecords } from '@/src/services/storage/collection';
import type { Order } from '@/src/types/domain';
import { cn, formatMoney, minutesSince } from '@/src/utils/format';
import { approveOrder, approversFor, markOrderServed, rejectOrderAtApproval } from './services/orderService';
import { OrderLines, OrderMeta, OrderTimeline, OrderTotals } from './components/OrderParts';

type Tab = 'approval' | 'active' | 'serve' | 'history' | 'rejected';

export default function OrdersPage() {
  const ctx = usePortal();
  const db = useDatabase();
  const toast = useToast();
  const now = useNow(30_000);
  const [tab, setTab] = useState<Tab>(() =>
    ctx.restaurant.settings.requireWaiterApproval && can(ctx.user, 'orders.approve') ? 'approval' : 'active'
  );
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Order | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const q = useDebounced(query);

  const orders = useMemo(() => listScoped(db, 'orders', ctx.scope), [db, ctx.scope]);
  const approvers = useMemo(() => approversFor(db, ctx.restaurant), [db, ctx.restaurant]);
  const canApprove = can(ctx.user, 'orders.approve') && ctx.user.role === 'waiter';
  const canServe = can(ctx.user, 'orders.serve');

  const buckets = useMemo(
    () => ({
      approval: orders.filter((o) => o.status === 'pending_approval'),
      active: orders.filter((o) => ['new', 'preparing', 'ready'].includes(o.status)),
      serve: orders.filter((o) => o.status === 'completed'),
      history: orders.filter((o) => o.status === 'served'),
      rejected: orders.filter((o) => o.status === 'rejected'),
    }),
    [orders]
  );

  const list = useMemo(
    () => searchRecords(buckets[tab], q, [(o) => o.number, (o) => o.tableLabel, (o) => o.lines.map((l) => l.title).join(' ')]),
    [buckets, tab, q]
  );
  const paged = paginate(list, page, 12);
  const detail = selected ? orders.find((o) => o.id === selected) ?? null : null;

  const run = (id: string, fn: () => Order, success: string) => {
    setBusy(id);
    try {
      const o = fn();
      toast.success(success, `${o.number} · ${o.tableLabel}`);
    } catch (err) {
      toast.fromError(err);
    } finally {
      setBusy(null);
    }
  };

  const tabs: Array<{ value: Tab; label: string; count: number }> = [
    ...(ctx.restaurant.settings.requireWaiterApproval || buckets.approval.length ? [{ value: 'approval' as Tab, label: 'Needs approval', count: buckets.approval.length }] : []),
    { value: 'active', label: 'In kitchen', count: buckets.active.length },
    { value: 'serve', label: 'Ready to serve', count: buckets.serve.length },
    { value: 'history', label: 'Served', count: buckets.history.length },
    { value: 'rejected', label: 'Rejected', count: buckets.rejected.length },
  ];

  return (
    <>
      <PageHeader
        title="Orders"
        description={
          ctx.restaurant.settings.requireWaiterApproval
            ? 'Waiter approval is ON — new QR orders wait here until an authorised waiter approves them.'
            : 'Waiter approval is OFF — new QR orders go straight to the kitchen.'
        }
        actions={
          <Badge tone={ctx.restaurant.settings.requireWaiterApproval ? 'warning' : 'success'} icon={UserCheck}>
            {ctx.restaurant.settings.requireWaiterApproval ? `${approvers.length} authorised approver${approvers.length === 1 ? '' : 's'}` : 'Direct to kitchen'}
          </Badge>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented label="Order queues" value={tab} onChange={(v) => { setTab(v); setPage(1); }} options={tabs} />
        <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Order #, table or dish" className="lg:w-72" />
      </div>

      {tab === 'approval' && !canApprove && buckets.approval.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
          <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          Only waiters who were given the “Approve / reject orders” permission can approve. You can view the queue but not act on it.
        </div>
      )}

      {paged.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title={q ? 'No orders match your search' : tab === 'approval' ? 'Nothing waiting for approval' : tab === 'serve' ? 'Nothing waiting to be served' : 'No orders here yet'}
            description={tab === 'active' ? 'New QR orders will appear here the moment guests submit them.' : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {paged.items.map((o) => {
            const waiting = minutesSince(o.createdAt, now);
            return (
              <Card key={o.id} as="article" className="flex flex-col">
                <button type="button" onClick={() => setSelected(o.id)} className="flex items-start justify-between gap-3 rounded-t-2xl px-5 pt-5 text-left">
                  <div>
                    <p className="font-display text-[19px] font-bold text-ink">{o.tableLabel}</p>
                    <p className="text-[13px] text-muted">{o.number} · {o.lines.reduce((s, l) => s + l.quantity, 0)} items</p>
                  </div>
                  <span
                    className={cn(
                      'tabular rounded-lg px-2 py-1 text-[12px] font-semibold',
                      o.status === 'pending_approval' && waiting >= 5 ? 'pulse-ring bg-warning-soft text-warning' : 'bg-surface-2 text-muted'
                    )}
                  >
                    {['served', 'rejected'].includes(o.status) ? new Date(o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : `${waiting}m`}
                  </span>
                </button>
                <OrderMeta order={o} className="px-5 pt-3" />
                <div className="flex-1 px-5 py-4">
                  <OrderLines lines={o.lines.slice(0, 4)} showPrices={false} dense />
                  {o.lines.length > 4 && <p className="mt-2 text-[12.5px] text-muted">+{o.lines.length - 4} more</p>}
                  {o.customerNote && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">Note: {o.customerNote}</p>}
                  {o.rejection && (
                    <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
                      Rejected at {o.rejection.stage} by {o.rejection.byName}: {o.rejection.reason}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
                  <span className="tabular font-semibold text-ink">{formatMoney(o.total)}</span>
                  <div className="flex gap-2">
                    {o.status === 'pending_approval' && canApprove && (
                      <>
                        <Button size="sm" variant="outline-danger" icon={X} onClick={() => setRejecting(o)}>Reject</Button>
                        <Button size="sm" icon={Check} loading={busy === o.id} onClick={() => run(o.id, () => approveOrder(o.id), 'Approved and sent to kitchen')}>Approve</Button>
                      </>
                    )}
                    {o.status === 'completed' && canServe && (
                      <Button size="sm" icon={CheckCheck} loading={busy === o.id} onClick={() => run(o.id, () => markOrderServed(o.id), 'Marked as served')}>Mark served</Button>
                    )}
                    {!(o.status === 'pending_approval' && canApprove) && !(o.status === 'completed' && canServe) && (
                      <Button size="sm" variant="ghost" onClick={() => setSelected(o.id)}>Details</Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} onPage={setPage} label="orders" />

      <Drawer open={Boolean(detail)} onClose={() => setSelected(null)} title={detail ? `${detail.number} · ${detail.tableLabel}` : ''} description={detail ? `${detail.lines.length} line items` : undefined}>
        {detail && (
          <div className="flex flex-col gap-6 p-5">
            <OrderMeta order={detail} />
            <section>
              <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-muted">Items</h3>
              <OrderLines lines={detail.lines} />
              <div className="mt-4"><OrderTotals order={detail} /></div>
              {detail.customerNote && <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2">Guest note: {detail.customerNote}</p>}
            </section>
            <section>
              <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-muted">Timeline</h3>
              <OrderTimeline order={detail} />
            </section>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title={`Reject ${rejecting?.number ?? ''}?`}
        description="The order will not reach the kitchen. The reason is saved to the order history and activity log."
        reasonLabel="Reason for rejection"
        reasonPlaceholder="e.g. Duplicate order — guest already ordered at the counter"
        confirmLabel="Reject order"
        onConfirm={(reason) => {
          if (!rejecting) return;
          try {
            const o = rejectOrderAtApproval(rejecting.id, reason);
            toast.success('Order rejected', o.number);
            setRejecting(null);
          } catch (err) {
            toast.fromError(err);
          }
        }}
      />
    </>
  );
}
