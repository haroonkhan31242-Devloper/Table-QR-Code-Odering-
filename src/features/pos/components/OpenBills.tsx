import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, CheckCircle2, CreditCard, Globe, Receipt, ShoppingBag, Wallet } from 'lucide-react';
import type { Order, Payment } from '@/src/types/domain';
import { Badge, Card, EmptyState, StatusBadge } from '@/src/components/ui/Display';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Field';
import { useToast } from '@/src/components/feedback/Toast';
import { ORDER_STATUS } from '@/src/constants/status';
import { cn, formatMoney, formatTime } from '@/src/utils/format';
import { OrderLines } from '@/src/features/orders/components/OrderParts';
import { changeFor, isBillable, recordCashPayment, summarizeBill } from '../services/billingService';
import { OrderOriginBadges } from '@/src/features/orders/components/OrderOriginBadges';

const METHODS = [
  { id: 'cash', label: 'Cash at counter', icon: Banknote, active: true },
  { id: 'online', label: 'Online payment', icon: Globe, active: false },
  { id: 'card', label: 'Credit card', icon: CreditCard, active: false },
] as const;

interface BillGroup {
  key: string;
  label: string;
  takeaway: boolean;
  orders: Order[];
}

/** Dine-in orders group by table; each takeaway order is its own bill. */
export function groupBills(orders: Order[]): BillGroup[] {
  const map = new Map<string, BillGroup>();
  orders.filter(isBillable).forEach((o) => {
    const key = o.tableId ?? `takeaway:${o.id}`;
    const g = map.get(key) ?? { key, label: o.tableId ? o.tableLabel : `Takeaway · ${o.number}`, takeaway: !o.tableId, orders: [] };
    g.orders.push(o);
    map.set(key, g);
  });
  return [...map.values()].sort((a, b) => Number(a.takeaway) - Number(b.takeaway) || a.label.localeCompare(b.label, undefined, { numeric: true }));
}

export function OpenBills({
  orders,
  canCollect,
  focusOrderId,
  onPaid,
}: {
  orders: Order[];
  canCollect: boolean;
  /** Pre-select the bill containing this order (e.g. from order tracking). */
  focusOrderId?: string | null;
  onPaid: (payment: Payment) => void;
}) {
  const toast = useToast();
  const groups = useMemo(() => groupBills(orders), [orders]);
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const billRef = useRef<HTMLDivElement>(null);

  const active = groups.find((g) => g.key === groupKey) ?? null;

  const select = (key: string) => {
    const g = groups.find((x) => x.key === key);
    setGroupKey(key);
    setSelectedIds(g ? g.orders.map((o) => o.id) : []);
    setReceived('');
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => billRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  useEffect(() => {
    if (!focusOrderId) return;
    const g = groups.find((x) => x.orders.some((o) => o.id === focusOrderId));
    if (g) select(g.key);
  }, [focusOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the selection valid as orders get paid elsewhere.
  useEffect(() => {
    if (groupKey && !active) {
      setGroupKey(null);
      setSelectedIds([]);
    } else if (active) {
      setSelectedIds((ids) => ids.filter((id) => active.orders.some((o) => o.id === id)));
    }
  }, [active, groupKey]);

  const selectedOrders = active ? active.orders.filter((o) => selectedIds.includes(o.id)) : [];
  const bill = summarizeBill(selectedOrders);
  const amount = Number(received) || 0;
  const { change, shortBy } = changeFor(bill.totalDue, amount);
  const billType: Payment['billType'] = selectedOrders.length > 1 ? 'combined_table' : 'individual';
  const quick = bill.totalDue
    ? [...new Set([bill.totalDue, Math.ceil(bill.totalDue / 500) * 500, Math.ceil(bill.totalDue / 1000) * 1000, Math.ceil(bill.totalDue / 5000) * 5000])]
    : [];

  const pay = () => {
    setBusy(true);
    try {
      const payment = recordCashPayment({ orderIds: selectedOrders.map((o) => o.id), billType, amountReceived: amount });
      toast.success('Payment recorded', `${payment.receiptNumber} · change ${formatMoney(payment.changeDue)}`);
      setReceived('');
      onPaid(payment);
    } catch (err) {
      toast.fromError(err, 'Payment not recorded');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6 2xl:grid-cols-[280px_minmax(0,1fr)_380px]">
      <Card className="p-3 lg:sticky lg:top-24">
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Unpaid bills</p>
          {groups.length > 0 && <span className="tabular rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-ink-2">{groups.length}</span>}
        </div>
        {groups.length === 0 ? (
          <EmptyState compact icon={CheckCircle2} title="All settled" description="Unpaid dine-in and takeaway orders appear here." />
        ) : (
          <ul className="no-scrollbar -mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
            {groups.map((g) => {
              const total = g.orders.reduce((s, o) => s + o.total, 0);
              const isActive = g.key === groupKey;
              return (
                <li key={g.key} className="shrink-0 snap-start lg:shrink">
                  <button
                    type="button"
                    onClick={() => select(g.key)}
                    aria-pressed={isActive}
                    className={cn(
                      'flex min-h-14 w-full min-w-[10.5rem] items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors lg:min-w-0',
                      isActive ? 'bg-brand-soft ring-1 ring-brand/40' : 'ring-1 ring-line hover:bg-surface-2 lg:ring-0'
                    )}
                  >
                    {g.takeaway && <ShoppingBag className={cn('size-4 shrink-0', isActive ? 'text-brand-strong' : 'text-muted')} aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate font-semibold', isActive ? 'text-brand-strong' : 'text-ink')}>{g.label}</p>
                      <p className="text-[12px] text-muted">{g.takeaway ? 'Takeaway' : `${g.orders.length} order${g.orders.length === 1 ? '' : 's'}`}</p>
                    </div>
                    <span className="tabular shrink-0 text-[14px] font-semibold text-ink">{formatMoney(total)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div ref={billRef} className="min-w-0 scroll-mt-24">
        <Card>
          {!active ? (
            <EmptyState icon={Receipt} title="Select a bill" description="Choose a table or takeaway order to settle it." />
          ) : (
            <div className="p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <h2 className="font-display text-[20px] font-bold text-ink">{active.label}</h2>
                  <p className="text-[13px] leading-relaxed text-muted">
                    {active.takeaway ? 'Takeaway orders are billed individually.' : 'Tick the orders to include. More than one creates a combined table bill.'}
                  </p>
                </div>
                <Badge tone={billType === 'combined_table' ? 'violet' : 'info'} className="self-start">
                  {billType === 'combined_table' ? 'Combined table bill' : 'Individual bill'}
                </Badge>
              </div>
              {!active.takeaway && active.orders.length > 1 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setSelectedIds(active.orders.map((o) => o.id))}>Select all</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Clear</Button>
                  <span className="ml-auto self-center text-[12.5px] text-muted">{selectedOrders.length} of {active.orders.length} selected</span>
                </div>
              )}
              <ul className="mt-4 flex flex-col gap-3">
                {active.orders.map((o) => {
                  const checked = selectedIds.includes(o.id);
                  return (
                    <li key={o.id} className={cn('rounded-2xl border p-3.5 transition-colors sm:p-4', checked ? 'border-brand/40 bg-brand-soft/40' : 'border-line')}>
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 size-5 shrink-0 accent-[var(--brand)]"
                          checked={checked}
                          onChange={(e) => setSelectedIds((ids) => (e.target.checked ? [...ids, o.id] : ids.filter((x) => x !== o.id)))}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                            <p className="font-semibold text-ink">
                              {o.number} <span className="whitespace-nowrap font-normal text-muted">· {formatTime(o.createdAt)}</span>
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              <OrderOriginBadges order={o} />
                              <StatusBadge meta={ORDER_STATUS[o.status]} />
                            </div>
                          </div>
                          <div className="mt-3"><OrderLines lines={o.lines} dense /></div>
                          <div className="mt-3 flex flex-col gap-1 border-t border-dashed border-line pt-2.5 text-[13px]">
                            {o.serviceCharge > 0 && (
                              <div className="flex justify-between text-muted"><span>Service charge</span><span className="tabular">{formatMoney(o.serviceCharge)}</span></div>
                            )}
                            <div className="flex justify-between font-semibold text-ink"><span>Order total</span><span className="tabular">{formatMoney(o.total)}</span></div>
                          </div>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4 sm:p-5 lg:col-start-2 2xl:sticky 2xl:top-24 2xl:col-start-auto">
        <h2 className="text-[15px] font-semibold text-ink">Payment</h2>
        <dl className="mt-4 flex flex-col gap-1.5 text-[14px]">
          <div className="flex justify-between gap-3 text-muted"><dt>Subtotal</dt><dd className="tabular">{formatMoney(bill.subtotal)}</dd></div>
          <div className="flex justify-between gap-3 text-muted"><dt>Service charge</dt><dd className="tabular">{formatMoney(bill.serviceCharge)}</dd></div>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 border-t border-line pt-3">
            <dt className="font-semibold text-ink">Total due</dt>
            <dd className="tabular font-display text-[24px] font-bold text-ink sm:text-[26px]">{formatMoney(bill.totalDue)}</dd>
          </div>
        </dl>
        <fieldset className="mt-5">
          <legend className="mb-2 text-[13px] font-medium text-ink-2">Method</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {METHODS.map((m) => (
              <div
                key={m.id}
                aria-disabled={!m.active}
                className={cn(
                  'flex min-h-12 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold sm:flex-col sm:justify-center sm:gap-1.5 sm:px-2 sm:py-3 sm:text-center sm:text-[12px]',
                  m.active ? 'border-brand bg-brand-soft text-brand-strong' : 'cursor-not-allowed border-line text-muted opacity-70'
                )}
              >
                <m.icon className="size-5 shrink-0" aria-hidden />
                <span className="flex-1 sm:flex-none">{m.label}</span>
                {!m.active && <span className="text-[11px] font-medium sm:text-[10.5px]">Coming soon</span>}
              </div>
            ))}
          </div>
        </fieldset>
        <div className="mt-5">
          <Input
            label="Cash received"
            type="number"
            inputMode="numeric"
            min={0}
            prefix="PKR"
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            disabled={!selectedOrders.length || !canCollect}
            error={amount > 0 && shortBy > 0 ? `Short by ${formatMoney(shortBy)}. An underpayment can’t be recorded as paid.` : null}
          />
          {quick.length > 0 && canCollect && (
            <div className="mt-2 grid grid-cols-2 gap-2 min-[380px]:grid-cols-4">
              {quick.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setReceived(String(v))}
                  className={cn('tabular h-10 rounded-lg border px-2 text-[13px] font-semibold transition-colors', amount === v ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line bg-surface text-ink-2 hover:bg-surface-2')}
                >
                  {v === bill.totalDue ? 'Exact' : formatMoney(v).replace('PKR ', '')}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={cn('mt-5 flex flex-wrap items-center justify-between gap-x-3 rounded-2xl px-4 py-3.5', amount >= bill.totalDue && bill.totalDue > 0 ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted')}>
          <span className="text-[13.5px] font-semibold">Change due</span>
          <span className="tabular font-display text-[22px] font-bold">{formatMoney(amount >= bill.totalDue ? change : 0)}</span>
        </div>
        {canCollect ? (
          <Button block size="lg" className="mt-5" icon={Wallet} loading={busy} disabled={!selectedOrders.length || amount < bill.totalDue || bill.totalDue === 0} onClick={pay}>
            Record cash payment
          </Button>
        ) : (
          <p className="mt-5 rounded-xl bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">You can view bills but not collect payments.</p>
        )}
      </Card>
    </div>
  );
}
