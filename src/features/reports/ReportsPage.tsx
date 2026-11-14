import React, { useMemo, useState } from 'react';
import { Ban, ClipboardList, Download, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { usePortal } from '@/src/app/layouts/PortalShell';
import { useDatabase } from '@/src/hooks/useData';
import { Badge, BarList, Card, CardHeader, EmptyState, PageHeader, Segmented, StatCard } from '@/src/components/ui/Display';
import { Button } from '@/src/components/ui/Button';
import { FoodImage } from '@/src/components/shared/Brand';
import { listScoped } from '@/src/services/storage/collection';
import { ORDER_STATUS, TABLE_STATUS } from '@/src/constants/status';
import { ROLE_LABELS } from '@/src/constants/permissions';
import type { OrderStatus } from '@/src/types/domain';
import { formatCompactMoney, formatMoney, formatNumber, formatRelative } from '@/src/utils/format';
import {
  RANGE_LABELS,
  categoryPerformance,
  dailySeries,
  downloadText,
  paymentMethodTotals,
  popularProducts,
  rangeStart,
  salesSummary,
  staffActivity,
  statusBreakdown,
  tableActivity,
  toCsv,
  type RangeKey,
} from './services/analytics';

const SERIES_DAYS: Record<RangeKey, number> = { today: 1, '7d': 7, '30d': 30, all: 30 };

export default function ReportsPage() {
  const ctx = usePortal();
  const db = useDatabase();
  const [range, setRange] = useState<RangeKey>('7d');

  const r = useMemo(() => {
    const orders = listScoped(db, 'orders', ctx.scope);
    const payments = listScoped(db, 'payments', ctx.scope);
    const from = rangeStart(range);
    return {
      orders,
      payments,
      from,
      summary: salesSummary(orders, payments, from),
      series: dailySeries(orders, payments, SERIES_DAYS[range]),
      statuses: statusBreakdown(orders, from),
      methods: paymentMethodTotals(payments, from),
      popular: popularProducts(orders, from, 8),
      categories: categoryPerformance(orders, listScoped(db, 'products', ctx.scope), listScoped(db, 'categories', ctx.scope), from),
      tables: tableActivity(listScoped(db, 'tables', ctx.scope), orders, listScoped(db, 'activity', ctx.scope), from),
      staff: staffActivity(listScoped(db, 'staff', ctx.scope), listScoped(db, 'activity', ctx.scope), from),
    };
  }, [db, ctx.scope, range]);

  const maxRev = Math.max(1, ...r.series.map((p) => p.revenue));
  const totalStatus = Object.values(r.statuses).reduce((a, b) => a + b, 0);

  const exportSales = () => {
    const rows = r.payments
      .filter((p) => new Date(p.paidAt).getTime() >= r.from)
      .map((p) => ({
        receipt: p.receiptNumber,
        paid_at: p.paidAt,
        table: p.tableLabel,
        orders: p.orderNumbers.join(' '),
        bill_type: p.billType,
        subtotal: p.subtotal,
        service_charge: p.serviceCharge,
        total: p.totalDue,
        received: p.amountReceived,
        change: p.changeDue,
        cashier: p.cashier.name,
      }));
    downloadText(`${ctx.restaurant.slug}-sales-${range}.csv`, toCsv(rows));
  };

  return (
    <>
      <PageHeader
        title="Reports"
        description="Calculated from the orders, payments and activity stored for this restaurant."
        actions={
          <>
            <Segmented label="Date range" value={range} onChange={setRange} options={(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => ({ value: k, label: RANGE_LABELS[k] }))} />
            <Button variant="secondary" icon={Download} onClick={exportSales} disabled={!r.summary.paidOrders}>Export sales</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales" value={formatCompactMoney(r.summary.revenue)} icon={Wallet} hint={`incl. ${formatMoney(r.summary.serviceCharge)} service`} />
        <StatCard label="Orders placed" value={formatNumber(r.summary.orders)} icon={ClipboardList} tone="info" hint={`${r.summary.paidOrders} paid`} />
        <StatCard label="Average ticket" value={formatMoney(r.summary.averageTicket)} icon={TrendingUp} tone="success" />
        <StatCard label="Rejected" value={r.summary.rejected} icon={Ban} tone={r.summary.rejected ? 'danger' : 'neutral'} hint={r.summary.orders ? `${Math.round((r.summary.rejected / r.summary.orders) * 100)}% of orders` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="pb-5">
          <CardHeader title="Daily sales" description={range === 'all' ? 'Last 30 days' : RANGE_LABELS[range]} />
          {r.series.every((p) => p.revenue === 0) ? (
            <EmptyState compact icon={Wallet} title="No sales in this period" />
          ) : (
            <div className="mt-6 flex h-52 items-end gap-[3px] px-5 sm:gap-1.5" role="img" aria-label="Daily sales chart">
              {r.series.map((p) => (
                <div key={p.key} className="group relative flex h-full flex-1 flex-col justify-end">
                  <div className="w-full rounded-t-md bg-brand/80 transition-colors group-hover:bg-brand" style={{ height: `${Math.max(2, (p.revenue / maxRev) * 100)}%` }} />
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11.5px] font-semibold text-bg group-hover:block">
                    {p.label}: {formatMoney(p.revenue)} · {p.orders} orders
                  </div>
                </div>
              ))}
            </div>
          )}
          {r.series.length > 1 && (
            <div className="mt-2 flex justify-between px-5 text-[11.5px] text-muted">
              <span>{r.series[0].label}</span>
              <span>{r.series[r.series.length - 1].label}</span>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Payment methods" />
          <ul className="flex flex-col gap-2 p-5">
            {r.methods.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
                <div>
                  <p className="text-[14px] font-medium text-ink">{m.label}</p>
                  <p className="text-[12px] text-muted">{m.active ? `${m.count} payment${m.count === 1 ? '' : 's'}` : 'Not available yet'}</p>
                </div>
                {m.active ? <span className="tabular font-semibold text-ink">{formatMoney(m.amount)}</span> : <Badge>Coming soon</Badge>}
              </li>
            ))}
          </ul>
          <div className="px-5 pb-5">
            <p className="mb-3 text-[13px] font-semibold text-ink">Order status</p>
            {totalStatus === 0 ? (
              <p className="text-[13px] text-muted">No orders in this period.</p>
            ) : (
              <>
                <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  {(Object.keys(r.statuses) as OrderStatus[]).filter((s) => r.statuses[s]).map((s) => (
                    <div key={s} style={{ width: `${(r.statuses[s] / totalStatus) * 100}%`, background: `var(--${ORDER_STATUS[s].tone === 'neutral' ? 'muted' : ORDER_STATUS[s].tone})` }} />
                  ))}
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
                  {(Object.keys(r.statuses) as OrderStatus[]).filter((s) => r.statuses[s]).map((s) => (
                    <li key={s} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className="size-2 rounded-full" style={{ background: `var(--${ORDER_STATUS[s].tone === 'neutral' ? 'muted' : ORDER_STATUS[s].tone})` }} aria-hidden />
                        {ORDER_STATUS[s].label}
                      </span>
                      <span className="tabular font-semibold text-ink">{r.statuses[s]}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Popular products" description="By quantity sold" />
          {r.popular.length ? (
            <ol className="flex flex-col gap-1 p-3">
              {r.popular.map((p, i) => (
                <li key={p.productId} className="flex items-center gap-3 rounded-xl p-2">
                  <span className="tabular w-5 text-center text-[13px] font-bold text-muted">{i + 1}</span>
                  <FoodImage src={p.image} alt="" className="size-10 shrink-0 rounded-lg" />
                  <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{p.title}</p>
                  <div className="text-right">
                    <p className="tabular text-[14px] font-semibold text-ink">{p.quantity}</p>
                    <p className="tabular text-[11.5px] text-muted">{formatCompactMoney(p.revenue)}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState compact icon={Receipt} title="No items sold in this period" />
          )}
        </Card>
        <Card>
          <CardHeader title="Category performance" description="Revenue by category" />
          <div className="p-5">
            <BarList rows={r.categories.map((c) => ({ key: c.name, label: c.name, value: c.revenue, sub: `${c.quantity} items` }))} format={formatCompactMoney} />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Table activity" description="Orders and seatings recorded per table" />
          <div className="overflow-x-auto p-3">
            <table className="w-full min-w-[440px] text-[13.5px]">
              <thead className="text-left text-[12px] uppercase tracking-wider text-muted">
                <tr className="border-b border-line"><th className="px-2 py-2 font-semibold">Table</th><th className="px-2 py-2 font-semibold">Now</th><th className="px-2 py-2 text-right font-semibold">Seatings</th><th className="px-2 py-2 text-right font-semibold">Orders</th><th className="px-2 py-2 text-right font-semibold">Revenue</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.tables.map((t) => (
                  <tr key={t.id}>
                    <td className="px-2 py-2.5"><span className="font-medium text-ink">{t.label}</span> <span className="text-[12px] text-muted">{t.area}</span></td>
                    <td className="px-2 py-2.5"><Badge tone={TABLE_STATUS[t.status].tone} dot>{TABLE_STATUS[t.status].label}</Badge></td>
                    <td className="tabular px-2 py-2.5 text-right text-ink-2">{t.seatings}</td>
                    <td className="tabular px-2 py-2.5 text-right text-ink-2">{t.orders}</td>
                    <td className="tabular px-2 py-2.5 text-right font-semibold text-ink">{formatCompactMoney(t.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-2 pt-3 text-[12px] text-muted">Seatings count manual “Available → Occupied” changes logged in this period.</p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Staff activity" description="Logged actions in this period" />
          <div className="overflow-x-auto p-3">
            <table className="w-full min-w-[480px] text-[13.5px]">
              <thead className="text-left text-[12px] uppercase tracking-wider text-muted">
                <tr className="border-b border-line"><th className="px-2 py-2 font-semibold">Staff</th><th className="px-2 py-2 text-right font-semibold">Actions</th><th className="px-2 py-2 text-right font-semibold">Approvals</th><th className="px-2 py-2 text-right font-semibold">Kitchen</th><th className="px-2 py-2 text-right font-semibold">Payments</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.staff.map((s) => (
                  <tr key={s.id}>
                    <td className="px-2 py-2.5">
                      <p className="font-medium text-ink">{s.name}</p>
                      <p className="text-[12px] text-muted">{ROLE_LABELS[s.role]} · {s.lastActive ? formatRelative(s.lastActive) : 'no activity'}</p>
                    </td>
                    <td className="tabular px-2 py-2.5 text-right font-semibold text-ink">{s.actions}</td>
                    <td className="tabular px-2 py-2.5 text-right text-ink-2">{s.approvals}</td>
                    <td className="tabular px-2 py-2.5 text-right text-ink-2">{s.kitchen}</td>
                    <td className="tabular px-2 py-2.5 text-right text-ink-2">{s.payments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
