import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChefHat, ClipboardList, Flame, LayoutGrid, Receipt, TimerReset, Wallet } from 'lucide-react';
import { usePortal } from '@/src/app/layouts/PortalShell';
import { useDatabase, useNow } from '@/src/hooks/useData';
import { Card, CardHeader, EmptyState, PageHeader, StatCard, StatusBadge } from '@/src/components/ui/Display';
import { FoodImage } from '@/src/components/shared/Brand';
import { ORDER_STATUS } from '@/src/constants/status';
import { can } from '@/src/services/access/accessControl';
import { listScoped } from '@/src/services/storage/collection';
import { formatCompactMoney, formatMoney, formatRelative, formatTime } from '@/src/utils/format';
import { dailySeries, liveOrderCounts, popularProducts, rangeStart, salesSummary } from '@/src/features/reports/services/analytics';

function greeting(now: number) {
  const h = new Date(now).getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function pctChange(curr: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

export default function DashboardPage() {
  const ctx = usePortal();
  const db = useDatabase();
  const now = useNow(60_000);

  const data = useMemo(() => {
    const orders = listScoped(db, 'orders', ctx.scope);
    const payments = listScoped(db, 'payments', ctx.scope);
    const tables = listScoped(db, 'tables', ctx.scope);
    const todayFrom = rangeStart('today', new Date(now));
    const yesterdayFrom = todayFrom - 86_400_000;
    const today = salesSummary(orders, payments, todayFrom);
    const yesterday = salesSummary(
      orders.filter((o) => new Date(o.createdAt).getTime() < todayFrom),
      payments.filter((p) => new Date(p.paidAt).getTime() < todayFrom),
      yesterdayFrom
    );
    return {
      orders,
      payments,
      tables,
      today,
      yesterday,
      live: liveOrderCounts(orders),
      series: dailySeries(orders, payments, 7, new Date(now)),
      popular: popularProducts(orders, rangeStart('7d', new Date(now)), 5),
    };
  }, [db, ctx.scope, now]);

  const occupied = data.tables.filter((t) => t.status === 'occupied').length;
  const cleaning = data.tables.filter((t) => t.status === 'cleaning').length;
  const pending = data.live.pendingApproval + data.live.kitchenNew;
  const maxRev = Math.max(1, ...data.series.map((p) => p.revenue));
  const liveOrders = data.orders.filter((o) => ['pending_approval', 'new', 'preparing', 'ready', 'completed'].includes(o.status)).slice(0, 6);

  return (
    <>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(now))}
        title={`${greeting(now)}, ${ctx.user.name.split(' ')[0]}`}
        description={`Here’s how ${ctx.restaurant.name} is doing today.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today’s sales"
          value={formatCompactMoney(data.today.revenue)}
          icon={Wallet}
          tone="brand"
          trend={pctChange(data.today.revenue, data.yesterday.revenue) !== null ? { value: pctChange(data.today.revenue, data.yesterday.revenue)!, label: 'vs yesterday' } : null}
          hint={pctChange(data.today.revenue, data.yesterday.revenue) === null ? `${data.today.paidOrders} paid orders` : undefined}
        />
        <StatCard
          label="Today’s orders"
          value={data.today.orders}
          icon={ClipboardList}
          tone="info"
          trend={pctChange(data.today.orders, data.yesterday.orders) !== null ? { value: pctChange(data.today.orders, data.yesterday.orders)!, label: 'vs yesterday' } : null}
        />
        <StatCard label="Active tables" value={`${occupied}/${data.tables.length}`} icon={LayoutGrid} tone="success" hint={cleaning ? `${cleaning} being cleaned` : 'Occupied now'} />
        <StatCard label="Pending orders" value={pending} icon={TimerReset} tone={pending ? 'warning' : 'neutral'} hint={`${data.live.pendingApproval} awaiting approval · ${data.live.kitchenNew} new in kitchen`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <Card className="pb-5">
          <CardHeader title="Sales this week" description="Cash payments recorded per day" />
          <div className="mt-6 flex h-48 items-end gap-2 px-5 sm:gap-4" role="img" aria-label={`Sales by day: ${data.series.map((p) => `${p.label} ${formatMoney(p.revenue)}`).join(', ')}`}>
            {data.series.map((p, i) => {
              const isToday = i === data.series.length - 1;
              return (
                <div key={p.key} className="group flex flex-1 flex-col items-center gap-2">
                  <span className="tabular text-[11px] font-semibold text-muted opacity-0 transition-opacity group-hover:opacity-100 sm:text-[11.5px]">{formatCompactMoney(p.revenue).replace('PKR ', '')}</span>
                  <div
                    className={`w-full max-w-12 rounded-lg transition-all duration-500 ${isToday ? 'bg-brand' : 'bg-brand/25 group-hover:bg-brand/45'}`}
                    style={{ height: `${Math.max(4, (p.revenue / maxRev) * 150)}px` }}
                  />
                  <span className={`text-[11.5px] ${isToday ? 'font-semibold text-ink' : 'text-muted'}`}>{p.label}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Kitchen status"
            icon={ChefHat}
            action={can(ctx.user, 'kitchen.view') ? <Link to="/portal/kitchen" className="text-[13px] font-semibold text-brand-strong hover:underline">Open KDS</Link> : undefined}
          />
          <div className="grid grid-cols-2 gap-3 p-5">
            {[
              { label: 'Awaiting approval', value: data.live.pendingApproval, cls: 'bg-warning-soft text-warning' },
              { label: 'New', value: data.live.kitchenNew, cls: 'bg-info-soft text-info' },
              { label: 'Preparing', value: data.live.preparing, cls: 'bg-violet-soft text-violet' },
              { label: 'Ready / to serve', value: data.live.ready + data.live.toServe, cls: 'bg-success-soft text-success' },
            ].map((s) => (
              <div key={s.label} className={`rounded-2xl p-4 ${s.cls}`}>
                <p className="tabular font-display text-[26px] font-bold leading-none">{s.value}</p>
                <p className="mt-1.5 text-[12.5px] font-semibold opacity-90">{s.label}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Popular this week" icon={Flame} />
          {data.popular.length ? (
            <ol className="flex flex-col gap-1 p-3">
              {data.popular.map((p, i) => (
                <li key={p.productId} className="flex items-center gap-3 rounded-xl p-2">
                  <span className="tabular w-5 text-center text-[13px] font-bold text-muted">{i + 1}</span>
                  <FoodImage src={p.image} alt="" className="size-10 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ink">{p.title}</p>
                    <p className="tabular text-[12px] text-muted">{p.quantity} sold · {formatMoney(p.revenue)}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState compact icon={Flame} title="No sales yet this week" />
          )}
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader
            title="Live orders"
            icon={ClipboardList}
            action={can(ctx.user, 'orders.view') ? <Link to="/portal/orders" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-strong hover:underline">All <ArrowRight className="size-3.5" /></Link> : undefined}
          />
          {liveOrders.length ? (
            <ul className="divide-y divide-line p-3">
              {liveOrders.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-ink">{o.number} <span className="font-normal text-muted">· {o.tableLabel}</span></p>
                    <p className="text-[12px] text-muted">{formatRelative(o.createdAt, now)} · {formatMoney(o.total)}</p>
                  </div>
                  <StatusBadge meta={ORDER_STATUS[o.status]} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={ClipboardList} title="No live orders" description="New QR orders appear here instantly." />
          )}
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader
            title="Recent transactions"
            icon={Receipt}
            action={can(ctx.user, 'cashier.view') ? <Link to="/portal/cashier" className="text-[13px] font-semibold text-brand-strong hover:underline">Cashier</Link> : undefined}
          />
          {data.payments.length ? (
            <ul className="divide-y divide-line p-3">
              {data.payments.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-2 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
                    <Wallet className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ink">{p.receiptNumber}</p>
                    <p className="truncate text-[12px] text-muted">{p.tableLabel} · {formatTime(p.paidAt)} · {p.cashier.name}</p>
                  </div>
                  <span className="tabular text-[14px] font-semibold text-ink">{formatMoney(p.totalDue)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={Receipt} title="No payments yet" />
          )}
        </Card>
      </div>
    </>
  );
}
