import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, CirclePause, CirclePlay, ExternalLink, MapPin, MoreHorizontal, Pencil, Plus, Phone, Mail } from 'lucide-react';
import { Badge, Card, EmptyState, PageHeader, Segmented } from '@/src/components/ui/Display';
import { Button, IconButton } from '@/src/components/ui/Button';
import { SearchInput } from '@/src/components/ui/Field';
import { ConfirmDialog, Drawer } from '@/src/components/ui/Overlay';
import { Menu } from '@/src/components/ui/Menu';
import { FoodImage } from '@/src/components/shared/Brand';
import { useToast } from '@/src/components/feedback/Toast';
import { useDatabase } from '@/src/hooks/useData';
import { RESTAURANT_STATUS } from '@/src/constants/status';
import type { Restaurant } from '@/src/types/domain';
import { filterRecords, searchRecords } from '@/src/services/storage/collection';
import { formatDate, formatMoney, formatRelative } from '@/src/utils/format';
import { tenantStats, type TenantStats } from '../selectors';
import { setRestaurantStatus } from '../services/tenantService';
import { RestaurantFormDialog } from '../components/RestaurantFormDialog';

type Filter = 'all' | 'active' | 'suspended';

export default function RestaurantsPage() {
  const db = useDatabase();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Restaurant | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Restaurant | null>(null);
  const [detail, setDetail] = useState<TenantStats | null>(null);

  useEffect(() => {
    if (params.get('new')) {
      setEditing(null);
      setFormOpen(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const stats = useMemo(() => tenantStats(db), [db]);
  const rows = useMemo(
    () =>
      filterRecords(
        searchRecords(stats, query, [(s) => s.restaurant.name, (s) => s.restaurant.city, (s) => s.restaurant.ownerName, (s) => s.restaurant.slug]),
        [filter !== 'all' && ((s) => s.restaurant.status === filter)]
      ),
    [stats, query, filter]
  );
  const detailLive = detail ? stats.find((s) => s.restaurant.id === detail.restaurant.id) ?? null : null;

  const toggleStatus = () => {
    if (!statusTarget) return;
    const next = statusTarget.status === 'active' ? 'suspended' : 'active';
    try {
      setRestaurantStatus(statusTarget.id, next);
      toast.success(next === 'active' ? 'Restaurant activated' : 'Restaurant suspended', statusTarget.name);
      setStatusTarget(null);
    } catch (err) {
      toast.fromError(err);
    }
  };

  return (
    <>
      <PageHeader
        title="Restaurants"
        description="Every tenant on the platform. Each restaurant’s operational data stays inside its own workspace."
        actions={<Button icon={Plus} onClick={() => { setEditing(null); setFormOpen(true); }}>New restaurant</Button>}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={query} onChange={setQuery} placeholder="Search name, city, owner…" className="sm:w-80" />
        <Segmented
          label="Filter by status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: stats.length },
            { value: 'active', label: 'Active', count: stats.filter((s) => s.restaurant.status === 'active').length },
            { value: 'suspended', label: 'Suspended', count: stats.filter((s) => s.restaurant.status === 'suspended').length },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={Building2} title="No restaurants match" description="Try a different search or filter." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((s) => {
            const r = s.restaurant;
            return (
              <Card key={r.id} as="article" className="group flex flex-col overflow-hidden transition-shadow hover:shadow-md">
                <button type="button" onClick={() => setDetail(s)} className="relative block h-28 overflow-hidden text-left" aria-label={`View ${r.name}`}>
                  <FoodImage src={r.coverImage} alt="" className="size-full transition-transform duration-500 group-hover:scale-[1.03]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <span className="absolute left-4 top-4 size-3 rounded-full ring-2 ring-white/70" style={{ background: r.accentColor }} aria-hidden />
                </button>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-[17px] font-bold text-ink">{r.name}</h2>
                      <p className="truncate text-[13px] text-muted">{r.cuisine || 'Restaurant'} · {r.city}</p>
                    </div>
                    <Menu
                      trigger={(p) => <IconButton {...p} icon={MoreHorizontal} label={`Actions for ${r.name}`} size="sm" />}
                      items={[
                        { label: 'View details', icon: ExternalLink, onSelect: () => setDetail(s) },
                        { label: 'Edit details', icon: Pencil, onSelect: () => { setEditing(r); setFormOpen(true); } },
                        'separator',
                        r.status === 'active'
                          ? { label: 'Suspend', icon: CirclePause, tone: 'danger', onSelect: () => setStatusTarget(r) }
                          : { label: 'Activate', icon: CirclePlay, onSelect: () => setStatusTarget(r) },
                      ]}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone={RESTAURANT_STATUS[r.status].tone} dot>{RESTAURANT_STATUS[r.status].label}</Badge>
                    <Badge>{r.commercial.planLabel}</Badge>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-3 text-center">
                    {[
                      ['Tables', s.tables],
                      ['Staff', s.staff],
                      ['Orders · 30d', s.orders30d],
                    ].map(([label, value]) => (
                      <div key={label as string}>
                        <dd className="tabular font-display text-[17px] font-bold text-ink">{value}</dd>
                        <dt className="text-[11.5px] text-muted">{label}</dt>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-4 text-[12.5px] text-muted">Owner · <span className="font-medium text-ink-2">{r.ownerName}</span></p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <RestaurantFormDialog open={formOpen} onClose={() => setFormOpen(false)} restaurant={editing} />

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        onConfirm={toggleStatus}
        tone={statusTarget?.status === 'active' ? 'danger' : 'primary'}
        title={statusTarget?.status === 'active' ? `Suspend ${statusTarget?.name}?` : `Activate ${statusTarget?.name}?`}
        description={
          statusTarget?.status === 'active'
            ? 'Staff will be signed out on their next action, and every table QR code will stop accepting orders until you reactivate. No data is deleted.'
            : 'Staff can sign in again and table QR codes will accept orders.'
        }
        confirmLabel={statusTarget?.status === 'active' ? 'Suspend restaurant' : 'Activate restaurant'}
      />

      <Drawer open={Boolean(detailLive)} onClose={() => setDetail(null)} title={detailLive?.restaurant.name ?? ''} description={detailLive ? `Tenant ${detailLive.restaurant.businessId}` : undefined}>
        {detailLive && (
          <div className="flex flex-col gap-5 p-5">
            <FoodImage src={detailLive.restaurant.coverImage} alt="" className="h-40 w-full rounded-2xl" />
            <div className="flex flex-wrap gap-2">
              <Badge tone={RESTAURANT_STATUS[detailLive.restaurant.status].tone} dot>{RESTAURANT_STATUS[detailLive.restaurant.status].label}</Badge>
              <Badge>/{detailLive.restaurant.slug}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              {[
                ['Sales · 30 days', formatMoney(detailLive.revenue30d)],
                ['Orders · 30 days', String(detailLive.orders30d)],
                ['Menu products', String(detailLive.products)],
                ['Tables / QR codes', String(detailLive.tables)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-line p-3.5">
                  <dt className="text-[12px] text-muted">{k}</dt>
                  <dd className="tabular mt-1 font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <section>
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted">Contact</h3>
              <ul className="mt-2 flex flex-col gap-2 text-[14px] text-ink-2">
                <li className="flex items-center gap-2"><MapPin className="size-4 text-muted" aria-hidden />{detailLive.restaurant.address || '—'}</li>
                <li className="flex items-center gap-2"><Phone className="size-4 text-muted" aria-hidden />{detailLive.restaurant.phone || '—'}</li>
                <li className="flex items-center gap-2"><Mail className="size-4 text-muted" aria-hidden />{detailLive.restaurant.ownerName} · {detailLive.restaurant.ownerEmail}</li>
              </ul>
            </section>
            <section>
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted">Commercial</h3>
              <p className="mt-2 text-[14px] text-ink-2">
                {detailLive.restaurant.commercial.planLabel} · credit {formatMoney(detailLive.restaurant.commercial.creditBalance)} · due {formatDate(detailLive.restaurant.commercial.dueDate)}
              </p>
              <p className="mt-1 text-[12.5px] text-muted">Commercial policy is a proposed model (PRD OD-10) and does not enforce suspension automatically.</p>
            </section>
            <p className="text-[12.5px] text-muted">Created {formatRelative(detailLive.restaurant.createdAt)} · last order {detailLive.lastOrderAt ? formatRelative(detailLive.lastOrderAt) : 'never'}</p>
            <div className="flex gap-2">
              <Button variant="secondary" icon={Pencil} onClick={() => { setEditing(detailLive.restaurant); setFormOpen(true); }}>Edit</Button>
              <Button
                variant={detailLive.restaurant.status === 'active' ? 'outline-danger' : 'primary'}
                icon={detailLive.restaurant.status === 'active' ? CirclePause : CirclePlay}
                onClick={() => setStatusTarget(detailLive.restaurant)}
              >
                {detailLive.restaurant.status === 'active' ? 'Suspend' : 'Activate'}
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
