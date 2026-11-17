import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, Plus, Printer, ReceiptText, Wallet } from 'lucide-react';
import { usePortal } from '@/src/app/layouts/PortalShell';
import { useDatabase, useDebounced, useNow } from '@/src/hooks/useData';
import { Badge, Card, EmptyState, PageHeader, Pagination, Segmented } from '@/src/components/ui/Display';
import { Button } from '@/src/components/ui/Button';
import { SearchInput } from '@/src/components/ui/Field';
import { Dialog } from '@/src/components/ui/Overlay';
import { useToast } from '@/src/components/feedback/Toast';
import { can } from '@/src/services/access/accessControl';
import { listScoped, paginate, searchRecords } from '@/src/services/storage/collection';
import type { Payment } from '@/src/types/domain';
import { randomToken } from '@/src/utils/crypto';
import { formatDateTime, formatMoney } from '@/src/utils/format';
import { createPosOrder } from './services/posService';
import { isBillable, logReceiptReprint } from './services/billingService';
import { OrderEntry, type PosDraft } from './components/OrderEntry';
import { OpenBills } from './components/OpenBills';
import { OrderTracker } from './components/OrderTracker';
import { PrintableReceipt, ReceiptView } from './components/Receipt';

type Tab = 'order' | 'bills' | 'track' | 'receipts';

const EMPTY_DRAFT: PosDraft = { type: 'dine_in', tableId: null, cart: [], note: '' };

export default function PosPage() {
  const ctx = usePortal();
  const db = useDatabase();
  const toast = useToast();
  const now = useNow(30_000);

  const canCreate = can(ctx.user, 'pos.order');
  const canCollect = can(ctx.user, 'cashier.collect');
  const canReprint = can(ctx.user, 'cashier.reprint');

  const [tab, setTab] = useState<Tab>(canCreate ? 'order' : 'bills');
  const [draft, setDraft] = useState<PosDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState<'later' | 'now' | null>(null);
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ payment: Payment; original?: boolean } | null>(null);
  const [printing, setPrinting] = useState<{ payment: Payment; reprint?: number } | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(query);
  // One idempotency key per draft: a retry after a failure can never double-create.
  const requestId = useRef(randomToken());

  const orders = useMemo(() => listScoped(db, 'orders', ctx.scope), [db, ctx.scope]);
  const payments = useMemo(() => listScoped(db, 'payments', ctx.scope), [db, ctx.scope]);
  const products = useMemo(() => {
    const cats = listScoped(db, 'categories', ctx.scope).filter((c) => c.isActive);
    const order = new Map(cats.map((c) => [c.id, c.sortOrder]));
    return listScoped(db, 'products', ctx.scope)
      .filter((p) => order.has(p.categoryId))
      .sort((a, b) => (order.get(a.categoryId)! - order.get(b.categoryId)!) || a.title.localeCompare(b.title));
  }, [db, ctx.scope]);
  const categories = useMemo(
    () => listScoped(db, 'categories', ctx.scope).filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({ id: c.id, name: c.name })),
    [db, ctx.scope]
  );
  const tables = useMemo(
    () => listScoped(db, 'tables', ctx.scope).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
    [db, ctx.scope]
  );

  // A chosen table can disappear or go into cleaning while the cashier works.
  useEffect(() => {
    if (!draft.tableId) return;
    const t = tables.find((x) => x.id === draft.tableId);
    if (!t || t.status === 'cleaning') setDraft((d) => ({ ...d, tableId: null }));
  }, [tables, draft.tableId]);

  useEffect(() => {
    if (!printing) return;
    const t = window.setTimeout(() => {
      window.print();
      setPrinting(null);
    }, 120);
    return () => window.clearTimeout(t);
  }, [printing]);

  const submit = async (payNow: { amountReceived: number } | null): Promise<boolean> => {
    setBusy(payNow ? 'now' : 'later');
    try {
      const { order, payment } = createPosOrder({
        type: draft.type,
        tableId: draft.type === 'dine_in' ? draft.tableId : null,
        lines: draft.cart.map((c) => ({ productId: c.productId, variantId: c.variantId, addonIds: c.addonIds, quantity: c.quantity, note: c.note })),
        note: draft.note,
        clientRequestId: requestId.current,
        payNow,
      });
      requestId.current = randomToken();
      setDraft({ ...EMPTY_DRAFT, type: draft.type });
      if (payment) {
        toast.success('Paid & sent to kitchen', `${order.number} · ${order.tableLabel} · change ${formatMoney(payment.changeDue)}`);
        setReceipt({ payment, original: true });
      } else {
        toast.success('Sent to kitchen', `${order.number} · ${order.tableLabel} · unpaid`);
      }
      return true;
    } catch (err) {
      toast.fromError(err, 'Order not created');
      return false;
    } finally {
      setBusy(null);
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

  const openBills = orders.filter(isBillable).length;
  const tracking = orders.filter((o) => o.source === 'pos' && o.status !== 'rejected' && (o.status !== 'served' || o.paymentStatus === 'unpaid')).length;
  const receiptRows = paginate(
    searchRecords(payments, q, [(p) => p.receiptNumber, (p) => p.tableLabel, (p) => p.orderNumbers.join(' '), (p) => p.cashier.name]),
    page,
    15
  );

  const tabs: Array<{ value: Tab; label: string; count?: number; icon: typeof Plus }> = [
    ...(canCreate ? [{ value: 'order' as Tab, label: 'New order', icon: Plus }] : []),
    { value: 'bills', label: 'Open bills', count: openBills, icon: Wallet },
    { value: 'track', label: 'Track orders', count: tracking, icon: ClipboardList },
    { value: 'receipts', label: 'Receipts', count: payments.length, icon: ReceiptText },
  ];

  return (
    <>
      <PageHeader
        title="POS"
        description="Ring up dine-in and takeaway orders, send them straight to the kitchen, and take cash now or later. Paying never frees a table."
        actions={<Segmented label="POS sections" value={tab} onChange={(v) => { setTab(v); if (v !== 'bills') setFocusOrderId(null); }} options={tabs} />}
      />

      {tab === 'order' && canCreate && (
        <OrderEntry
          restaurant={ctx.restaurant}
          products={products}
          categories={categories}
          tables={tables}
          draft={draft}
          onDraft={setDraft}
          canCollect={canCollect}
          busy={busy}
          onSubmit={submit}
        />
      )}

      {tab === 'bills' && (
        <OpenBills orders={orders} canCollect={canCollect} focusOrderId={focusOrderId} onPaid={(payment) => setReceipt({ payment, original: true })} />
      )}

      {tab === 'track' && (
        <OrderTracker
          orders={orders}
          now={now}
          canCreate={canCreate}
          canCollect={canCollect}
          onCollect={(orderId) => {
            setFocusOrderId(orderId);
            setTab('bills');
          }}
        />
      )}

      {tab === 'receipts' && (
        <Card className="p-4 sm:p-5">
          <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Receipt #, table, order or cashier" className="sm:w-80" />
          {receiptRows.items.length === 0 ? (
            <EmptyState compact icon={ReceiptText} title="No receipts found" />
          ) : (
            <>
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
                      <Badge tone={p.orderType === 'takeaway' ? 'violet' : 'neutral'}>{p.orderType === 'takeaway' ? 'Takeaway' : p.billType === 'combined_table' ? 'Combined' : 'Dine-in'}</Badge>
                      <span>{formatDateTime(p.paidAt)} · {p.cashier.name}{p.reprintCount ? ` · ${p.reprintCount} reprint${p.reprintCount === 1 ? '' : 's'}` : ''}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setReceipt({ payment: p })}>View</Button>
                      {canReprint && <Button size="sm" variant="secondary" icon={Printer} onClick={() => reprint(p)}>Reprint</Button>}
                    </div>
                  </li>
                ))}
              </ul>
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
                        <td className="py-3 pr-3 text-ink-2">{p.orderType === 'takeaway' ? '—' : p.tableLabel}</td>
                        <td className="py-3 pr-3">
                          <Badge tone={p.orderType === 'takeaway' ? 'violet' : p.billType === 'combined_table' ? 'info' : 'neutral'}>
                            {p.orderType === 'takeaway' ? 'Takeaway' : p.billType === 'combined_table' ? 'Combined' : 'Dine-in'}
                          </Badge>
                        </td>
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
                    // The first print right after payment is the original; later prints are logged reprints.
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
