import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, CheckCircle2, CreditCard, Globe, Printer, Receipt, ReceiptText, Wallet } from 'lucide-react';
import { usePortal } from '@/src/app/layouts/PortalShell';
import { useDatabase, useDebounced } from '@/src/hooks/useData';
import { Badge, Card, EmptyState, PageHeader, Pagination, Segmented, StatusBadge } from '@/src/components/ui/Display';
import { Button } from '@/src/components/ui/Button';
import { Input, SearchInput } from '@/src/components/ui/Field';
import { Dialog } from '@/src/components/ui/Overlay';
import { useToast } from '@/src/components/feedback/Toast';
import { can } from '@/src/services/access/accessControl';
import { listScoped, paginate, searchRecords } from '@/src/services/storage/collection';
import { ORDER_STATUS } from '@/src/constants/status';
import type { Order, Payment } from '@/src/types/domain';
import { cn, formatDateTime, formatMoney, formatTime } from '@/src/utils/format';
import { changeFor, isBillable, logReceiptReprint, recordCashPayment, summarizeBill } from './services/billingService';
import { OrderLines } from '@/src/features/orders/components/OrderParts';
import { PrintableReceipt, ReceiptView } from './components/Receipt';

type View = 'bills' | 'receipts';

const METHODS = [
  { id: 'cash', label: 'Cash at counter', icon: Banknote, active: true },
  { id: 'online', label: 'Online payment', icon: Globe, active: false },
  { id: 'card', label: 'Credit card', icon: CreditCard, active: false },
] as const;

export default function CashierPage() {
  const ctx = usePortal();
  const db = useDatabase();
  const toast = useToast();
  const [view, setView] = useState<View>('bills');
  const [tableId, setTableId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{ payment: Payment; original?: boolean } | null>(null);
  const [printing, setPrinting] = useState<{ payment: Payment; reprint?: number } | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(query);
  const billRef = useRef<HTMLDivElement>(null);

  const canCollect = can(ctx.user, 'cashier.collect');
  const canReprint = can(ctx.user, 'cashier.reprint');

  const orders = useMemo(() => listScoped(db, 'orders', ctx.scope), [db, ctx.scope]);
  const payments = useMemo(() => listScoped(db, 'payments', ctx.scope), [db, ctx.scope]);
  const billable = useMemo(() => orders.filter(isBillable), [orders]);
  const tables = useMemo(() => {
    const map = new Map<string, { id: string; label: string; orders: Order[] }>();
    billable.forEach((o) => {
      const t = map.get(o.tableId) ?? { id: o.tableId, label: o.tableLabel, orders: [] };
      t.orders.push(o);
      map.set(o.tableId, t);
    });
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [billable]);

  const activeTable = tables.find((t) => t.id === tableId) ?? null;

  // Keep selection valid as orders get paid elsewhere.
  useEffect(() => {
    if (tableId && !activeTable) {
      setTableId(null);
      setSelectedIds([]);
    } else if (activeTable) {
      setSelectedIds((ids) => ids.filter((id) => activeTable.orders.some((o) => o.id === id)));
    }
  }, [activeTable, tableId]);

  useEffect(() => {
    if (!printing) return;
    const t = window.setTimeout(() => {
      window.print();
      setPrinting(null);
    }, 120);
    return () => window.clearTimeout(t);
  }, [printing]);

  const selectTable = (id: string) => {
    const t = tables.find((x) => x.id === id);
    setTableId(id);
    setSelectedIds(t ? t.orders.map((o) => o.id) : []);
    setReceived('');
    // On stacked (phone/tablet) layouts, bring the opened bill into view.
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => billRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  const selectedOrders = activeTable ? activeTable.orders.filter((o) => selectedIds.includes(o.id)) : [];
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
      setReceipt({ payment, original: true });
      setReceived('');
    } catch (err) {
      toast.fromError(err, 'Payment not recorded');
    } finally {
      setBusy(false);
    }
  };

  const reprint = (p: Payment) => {
    try {
      const updated = logReceiptReprint(p.id);
      setPrinting({ payment: updated, reprint: updated.reprintCount });
      toast.info('Reprint logged', `${updated.receiptNumber} · reprint #${updated.reprintCount}`);
    } catch (err) {
      toast.fromError(err);
    }
  };

  const receiptRows = paginate(
    searchRecords(payments, q, [(p) => p.receiptNumber, (p) => p.tableLabel, (p) => p.orderNumbers.join(' '), (p) => p.cashier.name]),
    page,
    15
  );

  return (
    <>
      <PageHeader
        title="Cashier"
        description="Settle individual or combined table bills. Paying never changes a table’s status; staff free tables manually."
        actions={
          <Segmented
            label="Cashier view"
            value={view}
            onChange={setView}
            options={[
              { value: 'bills', label: 'Open bills', count: tables.length, icon: Wallet },
              { value: 'receipts', label: 'Receipts', count: payments.length, icon: ReceiptText },
            ]}
          />
        }
      />

      {view === 'bills' ? (
        <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6 2xl:grid-cols-[280px_minmax(0,1fr)_380px]">
          {/* Tables — horizontal chips on phones/tablets, vertical list on desktop */}
          <Card className="p-3 lg:sticky lg:top-24">
            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Unpaid tables</p>
              {tables.length > 0 && <span className="tabular rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-ink-2">{tables.length}</span>}
            </div>
            {tables.length === 0 ? (
              <EmptyState compact icon={CheckCircle2} title="All settled" description="Unpaid orders appear here once they pass approval." />
            ) : (
              <ul className="no-scrollbar -mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
                {tables.map((t) => {
                  const total = t.orders.reduce((s, o) => s + o.total, 0);
                  const active = t.id === tableId;
                  return (
                    <li key={t.id} className="shrink-0 snap-start lg:shrink">
                      <button
                        type="button"
                        onClick={() => selectTable(t.id)}
                        aria-pressed={active}
                        className={cn(
                          'flex min-h-14 w-full min-w-[9.5rem] items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors lg:min-w-0',
                          active ? 'bg-brand-soft ring-1 ring-brand/40' : 'ring-1 ring-line hover:bg-surface-2 lg:ring-0'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className={cn('truncate font-semibold', active ? 'text-brand-strong' : 'text-ink')}>{t.label}</p>
                          <p className="text-[12px] text-muted">{t.orders.length} order{t.orders.length === 1 ? '' : 's'}</p>
                        </div>
                        <span className="tabular shrink-0 text-[14px] font-semibold text-ink">{formatMoney(total)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Bill */}
          <div ref={billRef} className="min-w-0 scroll-mt-24">
          <Card>
            {!activeTable ? (
              <EmptyState icon={Receipt} title="Select a table" description="Choose a table to open its individual or combined bill." />
            ) : (
              <div className="p-4 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <h2 className="font-display text-[20px] font-bold text-ink">{activeTable.label}</h2>
                    <p className="text-[13px] leading-relaxed text-muted">Tick the orders to include. More than one creates a combined table bill.</p>
                  </div>
                  <Badge tone={billType === 'combined_table' ? 'violet' : 'info'} className="self-start">
                    {billType === 'combined_table' ? 'Combined table bill' : 'Individual bill'}
                  </Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setSelectedIds(activeTable.orders.map((o) => o.id))}>Select all</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Clear</Button>
                  <span className="ml-auto self-center text-[12.5px] text-muted">{selectedOrders.length} of {activeTable.orders.length} selected</span>
                </div>
                <ul className="mt-4 flex flex-col gap-3">
                  {activeTable.orders.map((o) => {
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
                              <StatusBadge meta={ORDER_STATUS[o.status]} />
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

          {/* Payment — under the bill on phones/laptops, own column on wide screens */}
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
                error={amount > 0 && shortBy > 0 ? `Short by ${formatMoney(shortBy)} — an underpayment can’t be recorded as paid.` : null}
              />
              {quick.length > 0 && canCollect && (
                <div className="mt-2 grid grid-cols-2 gap-2 min-[380px]:grid-cols-4">
                  {quick.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setReceived(String(v))}
                      className={cn(
                        'tabular h-10 rounded-lg border px-2 text-[13px] font-semibold transition-colors',
                        Number(received) === v ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line bg-surface text-ink-2 hover:bg-surface-2'
                      )}
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
      ) : (
        <Card className="p-4 sm:p-5">
          <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Receipt #, table, order or cashier" className="sm:w-80" />
          {receiptRows.items.length === 0 ? (
            <EmptyState compact icon={ReceiptText} title="No receipts found" />
          ) : (
            <>
              {/* Phones: cards */}
              <ul className="mt-4 flex flex-col gap-3 md:hidden">
                {receiptRows.items.map((p) => (
                  <li key={p.id} className="rounded-2xl border border-line p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{p.receiptNumber}</p>
                        <p className="break-words text-[12px] text-muted">{p.tableLabel} · {p.orderNumbers.join(', ')}</p>
                      </div>
                      <p className="tabular shrink-0 font-semibold text-ink">{formatMoney(p.totalDue)}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                      {p.billType === 'combined_table' ? <Badge tone="violet">Combined</Badge> : <Badge>Individual</Badge>}
                      <span>{formatDateTime(p.paidAt)} · {p.cashier.name}{p.reprintCount ? ` · ${p.reprintCount} reprint${p.reprintCount === 1 ? '' : 's'}` : ''}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setReceipt({ payment: p })}>View</Button>
                      {canReprint && <Button size="sm" variant="secondary" icon={Printer} onClick={() => reprint(p)}>Reprint</Button>}
                    </div>
                  </li>
                ))}
              </ul>
              {/* Tablet & desktop: table */}
              <div className="mt-4 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[640px] text-left text-[13.5px]">
                  <thead className="text-[12px] uppercase tracking-wider text-muted">
                    <tr className="border-b border-line">
                      <th className="py-2.5 pr-3 font-semibold">Receipt</th>
                      <th className="py-2.5 pr-3 font-semibold">Table</th>
                      <th className="py-2.5 pr-3 font-semibold">Type</th>
                      <th className="py-2.5 pr-3 font-semibold">Paid</th>
                      <th className="py-2.5 pr-3 text-right font-semibold">Total</th>
                      <th className="py-2.5 text-right font-semibold"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {receiptRows.items.map((p) => (
                      <tr key={p.id} className="hover:bg-surface-2/60">
                        <td className="py-3 pr-3">
                          <p className="font-semibold text-ink">{p.receiptNumber}</p>
                          <p className="text-[12px] text-muted">{p.orderNumbers.join(', ')}</p>
                        </td>
                        <td className="py-3 pr-3 text-ink-2">{p.tableLabel}</td>
                        <td className="py-3 pr-3">{p.billType === 'combined_table' ? <Badge tone="violet">Combined</Badge> : <Badge>Individual</Badge>}</td>
                        <td className="py-3 pr-3 text-ink-2">{formatDateTime(p.paidAt)}<br /><span className="text-[12px] text-muted">{p.cashier.name}{p.reprintCount ? ` · ${p.reprintCount} reprint${p.reprintCount === 1 ? '' : 's'}` : ''}</span></td>
                        <td className="tabular py-3 pr-3 text-right font-semibold text-ink">{formatMoney(p.totalDue)}</td>
                        <td className="py-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="ghost" onClick={() => setReceipt({ payment: p })}>View</Button>
                            {canReprint && <Button size="sm" variant="secondary" icon={Printer} onClick={() => reprint(p)}>Reprint</Button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <Pagination page={receiptRows.page} pageCount={receiptRows.pageCount} total={receiptRows.total} onPage={setPage} label="receipts" />
        </Card>
      )}

      <Dialog
        open={Boolean(receipt)}
        onClose={() => setReceipt(null)}
        size="sm"
        title="Receipt"
        description={receipt ? `${receipt.payment.receiptNumber} · ${receipt.payment.tableLabel}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReceipt(null)}>Close</Button>
            {receipt && (receipt.original || canReprint) && (
              <Button
                icon={Printer}
                onClick={() => {
                  if (receipt.original) {
                    // First print right after payment is the original; any later print is a logged reprint.
                    setPrinting({ payment: receipt.payment });
                    setReceipt({ payment: receipt.payment });
                  } else {
                    reprint(receipt.payment);
                  }
                }}
              >
                {receipt.original ? 'Print receipt' : 'Reprint'}
              </Button>
            )}
          </>
        }
      >
        {receipt && <ReceiptView payment={receipt.payment} restaurant={ctx.restaurant} />}
      </Dialog>

      {printing && <PrintableReceipt payment={printing.payment} restaurant={ctx.restaurant} reprint={printing.reprint} />}
    </>
  );
}
