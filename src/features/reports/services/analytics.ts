/**
 * Pure report selectors. Every number shown on dashboards and reports is
 * computed here from stored orders, payments, tables and activity logs —
 * nothing is randomly generated at render time.
 */
import { ACTIVE_ORDER_STATUSES } from '@/src/constants/status';
import type { ActivityLog, Category, DiningTable, Order, OrderStatus, Payment, Product, StaffMember } from '@/src/types/domain';
import { startOfDay } from '@/src/utils/format';

export type RangeKey = 'today' | '7d' | '30d' | 'all';

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  all: 'All time',
};

export function rangeStart(range: RangeKey, now = new Date()): number {
  if (range === 'all') return 0;
  const start = startOfDay(now);
  if (range === '7d') start.setDate(start.getDate() - 6);
  if (range === '30d') start.setDate(start.getDate() - 29);
  return start.getTime();
}

export const inRange = (iso: string, from: number) => new Date(iso).getTime() >= from;

export interface SalesSummary {
  revenue: number;
  paidOrders: number;
  orders: number;
  averageTicket: number;
  rejected: number;
  serviceCharge: number;
}

export function salesSummary(orders: Order[], payments: Payment[], from: number): SalesSummary {
  const ordersIn = orders.filter((o) => inRange(o.createdAt, from));
  const paymentsIn = payments.filter((p) => inRange(p.paidAt, from));
  const revenue = paymentsIn.reduce((s, p) => s + p.totalDue, 0);
  const paidOrders = paymentsIn.reduce((s, p) => s + p.orderIds.length, 0);
  return {
    revenue,
    paidOrders,
    orders: ordersIn.length,
    averageTicket: paidOrders ? Math.round(revenue / paidOrders) : 0,
    rejected: ordersIn.filter((o) => o.status === 'rejected').length,
    serviceCharge: paymentsIn.reduce((s, p) => s + p.serviceCharge, 0),
  };
}

export interface DayPoint {
  key: string;
  label: string;
  revenue: number;
  orders: number;
}

export function dailySeries(orders: Order[], payments: Payment[], days: number, now = new Date()): DayPoint[] {
  const points: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = startOfDay(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    points.push({
      key,
      label: new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric' }).format(d),
      revenue: 0,
      orders: 0,
    });
  }
  const index = new Map(points.map((p) => [p.key, p]));
  const dayKey = (iso: string) => {
    const d = startOfDay(new Date(iso));
    return d.toISOString().slice(0, 10);
  };
  payments.forEach((p) => {
    const pt = index.get(dayKey(p.paidAt));
    if (pt) pt.revenue += p.totalDue;
  });
  orders.forEach((o) => {
    const pt = index.get(dayKey(o.createdAt));
    if (pt) pt.orders += 1;
  });
  return points;
}

export function statusBreakdown(orders: Order[], from: number): Record<OrderStatus, number> {
  const counts = { pending_approval: 0, new: 0, preparing: 0, ready: 0, completed: 0, served: 0, rejected: 0 } as Record<OrderStatus, number>;
  orders.filter((o) => inRange(o.createdAt, from)).forEach((o) => (counts[o.status] += 1));
  return counts;
}

export interface ProductStat {
  productId: string;
  title: string;
  image: string;
  quantity: number;
  revenue: number;
}

export function popularProducts(orders: Order[], from: number, limit = 8): ProductStat[] {
  const map = new Map<string, ProductStat>();
  orders
    .filter((o) => o.status !== 'rejected' && inRange(o.createdAt, from))
    .forEach((o) =>
      o.lines.forEach((l) => {
        const s = map.get(l.productId) ?? { productId: l.productId, title: l.title, image: l.image, quantity: 0, revenue: 0 };
        s.quantity += l.quantity;
        s.revenue += l.lineTotal;
        map.set(l.productId, s);
      })
    );
  return [...map.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, limit);
}

export function categoryPerformance(orders: Order[], products: Product[], categories: Category[], from: number) {
  const productCat = new Map(products.map((p) => [p.id, p.categoryId]));
  const totals = new Map<string, { name: string; quantity: number; revenue: number }>();
  categories.forEach((c) => totals.set(c.id, { name: c.name, quantity: 0, revenue: 0 }));
  const other = { name: 'Removed items', quantity: 0, revenue: 0 };
  orders
    .filter((o) => o.status !== 'rejected' && inRange(o.createdAt, from))
    .forEach((o) =>
      o.lines.forEach((l) => {
        const t = totals.get(productCat.get(l.productId) ?? '') ?? other;
        t.quantity += l.quantity;
        t.revenue += l.lineTotal;
      })
    );
  const rows = [...totals.values()];
  if (other.quantity) rows.push(other);
  return rows.sort((a, b) => b.revenue - a.revenue);
}

/** Orders and paid revenue by channel: guest QR vs staff POS (dine-in / takeaway). */
export function channelBreakdown(orders: Order[], from: number) {
  const rows = [
    { id: 'qr', label: 'QR · dine-in', match: (o: Order) => o.source === 'qr' },
    { id: 'pos_dine_in', label: 'POS · dine-in', match: (o: Order) => o.source === 'pos' && o.type === 'dine_in' },
    { id: 'pos_takeaway', label: 'POS · takeaway', match: (o: Order) => o.source === 'pos' && o.type === 'takeaway' },
  ];
  const inPeriod = orders.filter((o) => o.status !== 'rejected' && inRange(o.createdAt, from));
  return rows.map((r) => {
    const list = inPeriod.filter(r.match);
    return {
      id: r.id,
      label: r.label,
      orders: list.length,
      revenue: list.filter((o) => o.paymentStatus === 'paid').reduce((s, o) => s + o.total, 0),
      unpaid: list.filter((o) => o.paymentStatus === 'unpaid').length,
    };
  });
}

export function paymentMethodTotals(payments: Payment[], from: number) {
  const cash = payments.filter((p) => inRange(p.paidAt, from));
  return [
    { id: 'cash_at_counter', label: 'Cash at counter', count: cash.length, amount: cash.reduce((s, p) => s + p.totalDue, 0), active: true },
    { id: 'online_payment', label: 'Online payment', count: 0, amount: 0, active: false },
    { id: 'credit_card', label: 'Credit card', count: 0, amount: 0, active: false },
  ];
}

export function tableActivity(tables: DiningTable[], orders: Order[], activity: ActivityLog[], from: number) {
  return tables
    .map((t) => {
      const tOrders = orders.filter((o) => o.tableId === t.id && inRange(o.createdAt, from) && o.status !== 'rejected');
      const turns = activity.filter(
        (a) => a.category === 'table' && a.targetId === t.id && inRange(a.at, from) && a.details.includes('→ Occupied')
      ).length;
      return {
        id: t.id,
        label: t.label,
        area: t.area,
        status: t.status,
        orders: tOrders.length,
        revenue: tOrders.reduce((s, o) => s + o.total, 0),
        seatings: turns,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export function staffActivity(staff: StaffMember[], activity: ActivityLog[], from: number) {
  return staff
    .map((s) => {
      const logs = activity.filter((a) => a.actorId === s.id && inRange(a.at, from));
      return {
        id: s.id,
        name: s.name,
        role: s.role,
        actions: logs.filter((l) => l.category !== 'auth').length,
        approvals: logs.filter((l) => l.action === 'Order approved').length,
        payments: logs.filter((l) => l.category === 'payment').length,
        kitchen: logs.filter((l) => l.category === 'kitchen').length,
        lastActive: logs[0]?.at,
      };
    })
    .sort((a, b) => b.actions - a.actions);
}

export function liveOrderCounts(orders: Order[]) {
  const live = orders.filter((o) => ACTIVE_ORDER_STATUSES.includes(o.status));
  return {
    live: live.length,
    pendingApproval: live.filter((o) => o.status === 'pending_approval').length,
    kitchenNew: live.filter((o) => o.status === 'new').length,
    preparing: live.filter((o) => o.status === 'preparing').length,
    ready: live.filter((o) => o.status === 'ready').length,
    toServe: live.filter((o) => o.status === 'completed').length,
    unpaid: orders.filter((o) => o.paymentStatus === 'unpaid' && o.status !== 'rejected' && o.status !== 'pending_approval').length,
  };
}

export function toCsv(rows: Array<Record<string, string | number>>): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

export function downloadText(filename: string, content: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
