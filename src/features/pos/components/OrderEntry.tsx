import React, { useMemo, useState } from 'react';
import { Banknote, ChefHat, CreditCard, Globe, Minus, Plus, Search, ShoppingBag, Trash2, UtensilsCrossed, X } from 'lucide-react';
import type { DiningTable, OrderType, Product, Restaurant } from '@/src/types/domain';
import { Button } from '@/src/components/ui/Button';
import { Input, Textarea } from '@/src/components/ui/Field';
import { Badge, Segmented } from '@/src/components/ui/Display';
import { Dialog } from '@/src/components/ui/Overlay';
import { FoodImage } from '@/src/components/shared/Brand';
import { TABLE_STATUS } from '@/src/constants/status';
import { cn, formatMoney } from '@/src/utils/format';
import { ProductSheet, priceCart, type PricedLine } from '@/src/features/customer-menu/components/GuestSheets';
import { lineKey, type CartItem } from '@/src/features/customer-menu/services/guestSession';
import { changeFor } from '../services/billingService';
import { serviceChargeFor } from '../services/posService';

export interface PosDraft {
  type: OrderType;
  tableId: string | null;
  cart: CartItem[];
  note: string;
}

interface Props {
  restaurant: Restaurant;
  products: Product[];
  categories: Array<{ id: string; name: string }>;
  tables: DiningTable[];
  draft: PosDraft;
  onDraft: (d: PosDraft) => void;
  canCollect: boolean;
  busy: 'later' | 'now' | null;
  onSubmit: (payNow: { amountReceived: number } | null) => Promise<boolean>;
}

function QtyControl({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-line bg-surface" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} aria-label={value === 1 ? 'Remove item' : 'Decrease quantity'} className="flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2">
        {value === 1 ? <Trash2 className="size-3.5" /> : <Minus className="size-3.5" />}
      </button>
      <span className="tabular w-7 text-center text-[14px] font-semibold text-ink">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(50, value + 1))} aria-label="Increase quantity" className="flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2">
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

const METHODS = [
  { id: 'cash', label: 'Cash', icon: Banknote, active: true },
  { id: 'online', label: 'Online', icon: Globe, active: false },
  { id: 'card', label: 'Card', icon: CreditCard, active: false },
] as const;

function PayNowDialog({
  open,
  total,
  onClose,
  onConfirm,
  busy,
}: {
  open: boolean;
  total: number;
  onClose: () => void;
  onConfirm: (amount: number) => void;
  busy: boolean;
}) {
  const [received, setReceived] = useState('');
  const amount = Number(received) || 0;
  const { change, shortBy } = changeFor(total, amount);
  const quick = [...new Set([total, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000])];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Pay now"
      description="Cash is recorded and the order goes to the kitchen in one step."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Back</Button>
          <Button icon={ChefHat} loading={busy} disabled={amount < total} onClick={() => onConfirm(amount)}>
            Confirm & send to kitchen
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between rounded-2xl bg-surface-2 px-4 py-3.5">
          <span className="text-[14px] font-semibold text-ink-2">Total due</span>
          <span className="tabular font-display text-[26px] font-bold text-ink">{formatMoney(total)}</span>
        </div>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment method">
          {METHODS.map((m) => (
            <div
              key={m.id}
              role="radio"
              aria-checked={m.active}
              aria-disabled={!m.active}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center text-[12.5px] font-semibold',
                m.active ? 'border-brand bg-brand-soft text-brand-strong' : 'cursor-not-allowed border-line text-muted opacity-70'
              )}
            >
              <m.icon className="size-5" aria-hidden />
              {m.label}
              {!m.active && <span className="text-[10.5px] font-medium">Coming soon</span>}
            </div>
          ))}
        </div>
        <div>
          <Input
            label="Cash received"
            type="number"
            inputMode="numeric"
            min={0}
            prefix="PKR"
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            data-autofocus
            error={amount > 0 && shortBy > 0 ? `Short by ${formatMoney(shortBy)}. An underpayment can’t be recorded.` : null}
          />
          <div className="mt-2 grid grid-cols-4 gap-2">
            {quick.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setReceived(String(v))}
                className={cn('tabular h-10 rounded-lg border text-[13px] font-semibold', amount === v ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line bg-surface text-ink-2 hover:bg-surface-2')}
              >
                {v === total ? 'Exact' : formatMoney(v).replace('PKR ', '')}
              </button>
            ))}
          </div>
        </div>
        <div className={cn('flex items-center justify-between rounded-2xl px-4 py-3.5', amount >= total ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted')}>
          <span className="text-[14px] font-semibold">Change due</span>
          <span className="tabular font-display text-[22px] font-bold">{formatMoney(amount >= total ? change : 0)}</span>
        </div>
      </div>
    </Dialog>
  );
}

function OrderPanel({
  restaurant,
  draft,
  onDraft,
  lines,
  tableLabel,
  canCollect,
  busy,
  onPayLater,
  onPayNow,
  onClose,
}: {
  restaurant: Restaurant;
  draft: PosDraft;
  onDraft: (d: PosDraft) => void;
  lines: PricedLine[];
  tableLabel: string | null;
  canCollect: boolean;
  busy: 'later' | 'now' | null;
  onPayLater: () => void;
  onPayNow: () => void;
  onClose?: () => void;
}) {
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const service = serviceChargeFor(draft.type, subtotal, restaurant.settings.serviceChargePercent);
  const count = lines.reduce((s, l) => s + l.item.quantity, 0);
  const blocked = lines.some((l) => l.problem);
  const missingTable = draft.type === 'dine_in' && !draft.tableId;
  const setQty = (key: string, qty: number) =>
    onDraft({ ...draft, cart: qty <= 0 ? draft.cart.filter((c) => c.key !== key) : draft.cart.map((c) => (c.key === key ? { ...c, quantity: qty } : c)) });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Current order</p>
          <p className="mt-0.5 truncate font-display text-[17px] font-bold text-ink">
            {draft.type === 'takeaway' ? 'Takeaway' : tableLabel ?? 'Dine-in · choose a table'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {count > 0 && (
            <Button size="sm" variant="ghost" onClick={() => onDraft({ ...draft, cart: [], note: '' })}>
              Clear
            </Button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close order" className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
              <X className="size-[18px]" />
            </button>
          )}
        </div>
      </div>

      {lines.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-muted">
            <ShoppingBag className="size-5" aria-hidden />
          </span>
          <p className="mt-3 font-semibold text-ink">No items yet</p>
          <p className="mt-1 text-[13px] text-muted">Tap products to add them to this order.</p>
        </div>
      ) : (
        <ul className="thin-scroll min-h-0 flex-1 divide-y divide-line overflow-y-auto px-4">
          {lines.map((l) => (
            <li key={l.item.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 py-3">
              <div className="min-w-0">
                <p className="break-words text-[14px] font-semibold leading-snug text-ink">{l.title}</p>
                {l.options && <p className="mt-0.5 text-[12px] text-muted">{l.options}</p>}
                {l.problem && <p className="mt-0.5 text-[12px] font-semibold text-danger">{l.problem}</p>}
              </div>
              <span className="tabular text-right text-[14px] font-semibold text-ink">{formatMoney(l.total)}</span>
              <QtyControl value={l.item.quantity} onChange={(v) => setQty(l.item.key, v)} label={`Quantity of ${l.title}`} />
              <span className="tabular self-center text-right text-[12px] text-muted">{formatMoney(l.unit)} each</span>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-line bg-surface-2/60 px-4 pb-4 pt-3">
        {lines.length > 0 && (
          <Textarea
            aria-label="Kitchen note"
            placeholder="Kitchen note (optional)"
            rows={1}
            maxLength={240}
            value={draft.note}
            onChange={(e) => onDraft({ ...draft, note: e.target.value })}
            className="min-h-[42px] py-2 text-[13.5px]"
          />
        )}
        <dl className="mt-3 flex flex-col gap-1 text-[13.5px]">
          <div className="flex justify-between text-muted"><dt>Subtotal</dt><dd className="tabular">{formatMoney(subtotal)}</dd></div>
          {service > 0 && (
            <div className="flex justify-between text-muted"><dt>Service ({restaurant.settings.serviceChargePercent}%)</dt><dd className="tabular">{formatMoney(service)}</dd></div>
          )}
          <div className="mt-1 flex items-baseline justify-between"><dt className="font-semibold text-ink">Total</dt><dd className="tabular font-display text-[24px] font-bold text-ink">{formatMoney(subtotal + service)}</dd></div>
        </dl>
        {missingTable && lines.length > 0 && <p className="mt-2 rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] font-medium text-warning">Choose a table for this dine-in order.</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={ChefHat} loading={busy === 'later'} disabled={!lines.length || blocked || missingTable || busy !== null} onClick={onPayLater}>
            Pay later
          </Button>
          <Button
            icon={Banknote}
            loading={busy === 'now'}
            disabled={!lines.length || blocked || missingTable || busy !== null || !canCollect}
            title={!canCollect ? 'You don’t have permission to collect payments' : undefined}
            onClick={onPayNow}
          >
            Pay now
          </Button>
        </div>
        <p className="mt-2 text-center text-[11.5px] text-muted">Both options send the order straight to the kitchen.</p>
      </div>
    </div>
  );
}

export function OrderEntry({ restaurant, products, categories, tables, draft, onDraft, canCollect, busy, onSubmit }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [optionsFor, setOptionsFor] = useState<Product | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const lines = useMemo(() => priceCart(draft.cart, products), [draft.cart, products]);
  const qtyByProduct = useMemo(() => {
    const m = new Map<string, number>();
    draft.cart.forEach((c) => m.set(c.productId, (m.get(c.productId) ?? 0) + c.quantity));
    return m;
  }, [draft.cart]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => (category === 'all' || p.categoryId === category) && (!q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)));
  }, [products, category, query]);

  const table = tables.find((t) => t.id === draft.tableId) ?? null;
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const total = subtotal + serviceChargeFor(draft.type, subtotal, restaurant.settings.serviceChargePercent);
  const count = draft.cart.reduce((s, c) => s + c.quantity, 0);

  const add = (item: Omit<CartItem, 'key'>) => {
    const key = lineKey(item.productId, item.variantId, item.addonIds, item.note);
    const existing = draft.cart.find((c) => c.key === key);
    onDraft({
      ...draft,
      cart: existing
        ? draft.cart.map((c) => (c.key === key ? { ...c, quantity: Math.min(50, c.quantity + item.quantity) } : c))
        : [...draft.cart, { ...item, key }],
    });
  };
  const tap = (p: Product) => {
    if (!p.isAvailable) return;
    if (p.variants.length || p.addons.length) setOptionsFor(p);
    else add({ productId: p.id, addonIds: [], quantity: 1 });
  };

  const submit = async (payNow: { amountReceived: number } | null) => {
    const ok = await onSubmit(payNow);
    if (ok) {
      setPayOpen(false);
      setMobileOpen(false);
    }
  };

  const panelProps = {
    restaurant,
    draft,
    onDraft,
    lines,
    tableLabel: table?.label ?? null,
    canCollect,
    busy,
    onPayLater: () => void submit(null),
    onPayNow: () => setPayOpen(true),
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px]">
      <section aria-label="Menu" className="flex min-w-0 flex-col gap-4 pb-24 lg:pb-0">
        {/* Order type + table */}
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 shadow-sm sm:p-4">
          <Segmented<OrderType>
            label="Order type"
            value={draft.type}
            onChange={(type) => onDraft({ ...draft, type, tableId: type === 'takeaway' ? null : draft.tableId })}
            options={[
              { value: 'dine_in', label: 'Dine-in', icon: UtensilsCrossed },
              { value: 'takeaway', label: 'Takeaway', icon: ShoppingBag },
            ]}
            className="w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none"
          />
          {draft.type === 'dine_in' ? (
            <div>
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">Table</p>
              {tables.length === 0 ? (
                <p className="text-[13px] text-muted">No tables yet. Add tables in Tables & QR, or use Takeaway.</p>
              ) : (
                <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="radiogroup" aria-label="Table">
                  {tables.map((t) => {
                    const selected = draft.tableId === t.id;
                    const cleaning = t.status === 'cleaning';
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={cleaning}
                        title={cleaning ? `${t.label} is being cleaned` : `${t.label} · ${TABLE_STATUS[t.status].label}`}
                        onClick={() => onDraft({ ...draft, tableId: selected ? null : t.id })}
                        className={cn(
                          'flex h-14 min-w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-xl border px-2 transition-colors disabled:cursor-not-allowed disabled:opacity-45',
                          selected ? 'border-brand bg-brand text-brand-ink shadow-sm' : 'border-line bg-surface hover:border-line-strong'
                        )}
                      >
                        <span className={cn('font-display text-[16px] font-bold leading-none', selected ? '' : 'text-ink')}>{t.number}</span>
                        <span className={cn('mt-1 flex items-center gap-1 text-[10.5px] font-semibold', selected ? 'opacity-90' : 'text-muted')}>
                          <span
                            className={cn('size-1.5 rounded-full', t.status === 'available' ? 'bg-success' : t.status === 'occupied' ? 'bg-brand' : 'bg-info', selected && 'bg-current')}
                            aria-hidden
                          />
                          {TABLE_STATUS[t.status].label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <p className="flex items-center gap-2 text-[13px] text-muted">
              <ShoppingBag className="size-4" aria-hidden /> Takeaway orders get their own order number and aren’t linked to a table.
            </p>
          )}
        </div>

        {/* Search + categories */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products"
              aria-label="Search products"
              className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-[15px] text-ink shadow-sm outline-none placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand/15 sm:text-sm"
            />
          </div>
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
            {[{ id: 'all', name: 'All' }, ...categories].map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
                className={cn(
                  'h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
                  category === c.id ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-2 hover:border-line-strong'
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Products */}
        {visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong py-12 text-center text-[14px] text-muted">No products match.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => {
              const qty = qtyByProduct.get(p.id) ?? 0;
              return (
                <li key={p.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => tap(p)}
                    disabled={!p.isAvailable}
                    aria-label={`${p.title}, ${formatMoney(p.price)}${p.isAvailable ? '' : ', sold out'}${qty ? `, ${qty} in order` : ''}`}
                    className={cn(
                      'group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-surface text-left shadow-sm transition-all active:scale-[0.98] disabled:cursor-not-allowed',
                      qty ? 'border-brand ring-2 ring-brand/25' : 'border-line hover:border-line-strong hover:shadow-md'
                    )}
                  >
                    <FoodImage src={p.image} alt="" className={cn('aspect-[4/3] w-full', !p.isAvailable && 'grayscale opacity-60')} />
                    {qty > 0 && (
                      <span className="tabular absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-brand-ink shadow-sm">{qty}</span>
                    )}
                    {!p.isAvailable && <Badge tone="danger" className="absolute left-2 top-2 bg-surface/95">Sold out</Badge>}
                    <div className="flex flex-1 flex-col p-2.5 sm:p-3">
                      <span className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-ink">{p.title}</span>
                      <span className="mt-auto flex items-center justify-between gap-1 pt-1.5">
                        <span className="tabular text-[14px] font-bold text-ink">{formatMoney(p.price)}</span>
                        {(p.variants.length > 0 || p.addons.length > 0) && <span className="text-[11px] font-medium text-muted">Options</span>}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Desktop order panel */}
      <aside aria-label="Current order" className="hidden lg:block">
        <div className="sticky top-24 h-[calc(100dvh-13rem)] min-h-[440px] overflow-hidden rounded-2xl border border-line bg-surface shadow-md">
          <OrderPanel {...panelProps} />
        </div>
      </aside>

      {/* Mobile / tablet order bar + sheet */}
      <div className={cn('safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 px-4 pt-3 backdrop-blur-md lg:hidden', count === 0 && 'hidden')}>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="mx-auto flex h-14 w-full max-w-xl items-center gap-3 rounded-2xl bg-brand px-4 text-brand-ink shadow-lg"
        >
          <span className="tabular flex size-8 items-center justify-center rounded-lg bg-black/15 text-[14px] font-bold">{count}</span>
          <span className="min-w-0 flex-1 truncate text-left text-[15px] font-semibold">
            {draft.type === 'takeaway' ? 'Takeaway' : table?.label ?? 'Choose a table'} · Review order
          </span>
          <span className="tabular text-[15px] font-bold">{formatMoney(total)}</span>
        </button>
      </div>
      <Dialog open={mobileOpen} onClose={() => setMobileOpen(false)} size="md" title={draft.type === 'takeaway' ? 'Takeaway order' : table?.label ?? 'Dine-in order'}>
        <div className="-mx-5 -my-5 sm:-mx-6">
          <OrderPanel {...panelProps} />
        </div>
      </Dialog>

      <ProductSheet product={optionsFor} onClose={() => setOptionsFor(null)} onAdd={add} />
      <PayNowDialog key={payOpen ? 'pay-open' : 'pay-closed'} open={payOpen} total={total} onClose={() => setPayOpen(false)} onConfirm={(amount) => void submit({ amountReceived: amount })} busy={busy === 'now'} />
    </div>
  );
}
