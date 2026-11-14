import type { Database, Restaurant } from '@/src/types/domain';

export interface TenantStats {
  restaurant: Restaurant;
  staff: number;
  tables: number;
  products: number;
  orders30d: number;
  revenue30d: number;
  lastOrderAt?: string;
}

export function tenantStats(db: Database, now = Date.now()): TenantStats[] {
  const from = now - 30 * 86_400_000;
  return db.restaurants.map((r) => {
    const mine = <T extends { restaurantId: string; businessId: string }>(list: T[]) =>
      list.filter((x) => x.restaurantId === r.id && x.businessId === r.businessId);
    const orders = mine(db.orders);
    const payments = mine(db.payments).filter((p) => new Date(p.paidAt).getTime() >= from);
    return {
      restaurant: r,
      staff: mine(db.staff).length,
      tables: mine(db.tables).length,
      products: mine(db.products).length,
      orders30d: orders.filter((o) => new Date(o.createdAt).getTime() >= from).length,
      revenue30d: payments.reduce((s, p) => s + p.totalDue, 0),
      lastOrderAt: orders[0]?.createdAt,
    };
  });
}

export function registrationsByMonth(db: Database, months = 6, now = new Date()) {
  const out: Array<{ key: string; label: string; count: number }> = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(d),
      count: 0,
    });
  }
  db.restaurants.forEach((r) => {
    const d = new Date(r.createdAt);
    const row = out.find((m) => m.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (row) row.count += 1;
  });
  return out;
}
