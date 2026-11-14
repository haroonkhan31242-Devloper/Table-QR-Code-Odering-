import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, CircleCheck, CirclePause, ClipboardList, History, Plus, QrCode, Users, Wallet } from 'lucide-react';
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard } from '@/src/components/ui/Display';
import { FoodImage } from '@/src/components/shared/Brand';
import { useDatabase } from '@/src/hooks/useData';
import { RESTAURANT_STATUS } from '@/src/constants/status';
import { formatCompactMoney, formatNumber, formatRelative } from '@/src/utils/format';
import { ActivityList } from '@/src/features/reports/components/ActivityList';
import { registrationsByMonth, tenantStats } from '../selectors';

export default function AdminOverviewPage() {
  const db = useDatabase();
  const stats = useMemo(() => tenantStats(db), [db]);
  const months = useMemo(() => registrationsByMonth(db), [db]);
  const platformLogs = useMemo(() => db.activity.filter((a) => a.businessId === 'platform').slice(0, 6), [db]);

  const active = db.restaurants.filter((r) => r.status === 'active').length;
  const suspended = db.restaurants.length - active;
  const gmv30 = stats.reduce((s, t) => s + t.revenue30d, 0);
  const orders30 = stats.reduce((s, t) => s + t.orders30d, 0);
  const maxMonth = Math.max(1, ...months.map((m) => m.count));

  return (
    <>
      <PageHeader
        eyebrow="Platform overview"
        title="Good to see you"
        description="Health of every restaurant on TableCraft, calculated from data stored in this browser."
        actions={
          <Link to="/admin/restaurants?new=1" className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-brand px-4 text-sm font-semibold text-brand-ink shadow-sm hover:bg-brand-hover">
            <Plus className="size-4" aria-hidden /> New restaurant
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Restaurants" value={db.restaurants.length} icon={Building2} hint={`${db.staff.length} staff accounts`} />
        <StatCard label="Active" value={active} icon={CircleCheck} tone="success" hint="Accepting orders" />
        <StatCard label="Suspended" value={suspended} icon={CirclePause} tone={suspended ? 'danger' : 'neutral'} hint="Sign-in & QR blocked" />
        <StatCard label="Platform sales · 30 days" value={formatCompactMoney(gmv30)} icon={Wallet} tone="info" hint={`${formatNumber(orders30)} orders`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Restaurants"
            description="Last 30 days per tenant"
            action={
              <Link to="/admin/restaurants" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-strong hover:underline">
                Manage <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          <ul className="mt-3 divide-y divide-line px-2 pb-2">
            {stats.map((t) => (
              <li key={t.restaurant.id} className="flex items-center gap-3.5 rounded-xl px-3 py-3 transition-colors hover:bg-surface-2">
                <FoodImage src={t.restaurant.logoImage || t.restaurant.coverImage} alt="" className="size-11 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-ink">{t.restaurant.name}</p>
                    <Badge tone={RESTAURANT_STATUS[t.restaurant.status].tone} dot>
                      {RESTAURANT_STATUS[t.restaurant.status].label}
                    </Badge>
                  </div>
                  <p className="truncate text-[12.5px] text-muted">
                    {t.restaurant.city} · {t.tables} tables · {t.staff} staff · {t.lastOrderAt ? `last order ${formatRelative(t.lastOrderAt)}` : 'no orders yet'}
                  </p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="tabular text-[14px] font-semibold text-ink">{formatCompactMoney(t.revenue30d)}</p>
                  <p className="tabular text-[12px] text-muted">{t.orders30d} orders</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="pb-5">
            <CardHeader title="Registrations" description="New restaurants per month" />
            <div className="mt-5 flex h-36 items-end gap-3 px-5" role="img" aria-label={`Registrations: ${months.map((m) => `${m.label} ${m.count}`).join(', ')}`}>
              {months.map((m) => (
                <div key={m.key} className="flex flex-1 flex-col items-center gap-2">
                  <span className="tabular text-[12px] font-semibold text-ink-2">{m.count}</span>
                  <div className="w-full rounded-lg bg-brand/85 transition-all" style={{ height: `${Math.max(6, (m.count / maxMonth) * 88)}px`, opacity: m.count ? 1 : 0.25 }} />
                  <span className="text-[11.5px] text-muted">{m.label}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Platform footprint" />
            <dl className="grid grid-cols-2 gap-3 p-5">
              {[
                { icon: QrCode, label: 'Active table QR codes', value: db.tables.filter((t) => t.qrToken).length },
                { icon: ClipboardList, label: 'Orders recorded', value: db.orders.length },
                { icon: Users, label: 'Staff accounts', value: db.staff.length },
                { icon: History, label: 'Audit entries', value: db.activity.length },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-xl bg-surface-2 p-3.5">
                  <Icon className="size-4 text-muted" aria-hidden />
                  <dd className="tabular mt-2 font-display text-xl font-bold text-ink">{formatNumber(value)}</dd>
                  <dt className="text-[12px] text-muted">{label}</dt>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Recent platform activity"
          action={
            <Link to="/admin/activity" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-strong hover:underline">
              View all <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          }
        />
        <div className="px-5 pb-3">
          {platformLogs.length ? <ActivityList items={platformLogs} /> : <EmptyState compact icon={History} title="No platform activity yet" />}
        </div>
      </Card>
    </>
  );
}
