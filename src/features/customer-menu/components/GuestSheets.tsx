import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, ChefHat, Clock3, CreditCard, Globe, Minus, Plus, ShoppingBag, Trash2, UtensilsCrossed, XCircle } from 'lucide-react';
import type { Order, Product, Restaurant } from '@/src/types/domain';
import { Dialog } from '@/src/components/ui/Overlay';
import { Button } from '@/src/components/ui/Button';
import { Textarea } from '@/src/components/ui/Field';
import { Badge, EmptyState } from '@/src/components/ui/Display';
import { FoodImage } from '@/src/components/shared/Brand';
import { ORDER_STATUS } from '@/src/constants/status';
import { cn, formatMoney, formatTime } from '@/src/utils/format';
import type { CartItem } from '../services/guestSession';

export function Stepper({ value, onChange, min = 1, max = 50, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="inline-flex items-center rounded-full border border-line bg-surface" role="group" aria-label={label}>
      <button type="button" aria-label={value === 1 && min === 0 ? 'Remove item' : 'Decrease quantity'} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="flex size-10 items-center justify-center rounded-full text-ink hover:bg-surface-2 disabled:opacity-40">
        {value === 1 && min === 0 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
      </button>
      <span className="tabular w-8 text-center text-[15px] font-semibold text-ink" aria-live="polite">{value}</span>
      <button type="button" aria-label="Increase quantity" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="flex size-10 items-center justify-center rounded-full text-ink hover:bg-surface-2 disabled:opacity-40">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function ProductSheet({ product, onClose, onAdd }: { product: Product | null; onClose: () => void; onAdd: (item: Omit<CartItem, 'key'>) => void }) {
  const [variantId, setVariantId] = useState<string | undefined>();
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (product) {
      setVariantId(product.variants[0]?.id);
      setAddonIds([]);
      setQty(1);
      setNote('');
    }
  }, [product]);

  if (!product) return <Dialog open={false} onClose={onClose} title="" />;
  const variant = product.variants.find((v) => v.id === variantId);
  const unit = product.price + (variant?.price ?? 0) + product.addons.filter((a) => addonIds.includes(a.id)).reduce((s, a) => s + a.price, 0);

  return (
    <Dialog
      open={Boolean(product)}
      onClose={onClose}
      size="md"
      title={product.title}
      footer={
        product.isAvailable ? (
          <div className="flex w-full items-center gap-3">
            <Stepper value={qty} onChange={(v) => setQty(Math.max(1, v))} label="Quantity" />
            <Button
              block
              size="lg"
              icon={ShoppingBag}
              onClick={() => {
                onAdd({ productId: product.id, variantId, addonIds, quantity: qty, note: note.trim() || undefined });
                onClose();
              }}
            >
              Add · {formatMoney(unit * qty)}
            </Button>
          </div>
        ) : (
          <p className="w-full text-center text-[14px] font-semibold text-danger">Sold out right now</p>
        )
      }
    >
      <div className="-mx-5 -mt-5 mb-5 sm:-mx-6">
        <FoodImage src={product.image} alt={product.title} className="aspect-[16/10] w-full" loading="eager" />
      </div>
      <p className="text-[14.5px] leading-relaxed text-muted">{product.description}</p>
      <p className="tabular mt-3 font-display text-[22px] font-bold text-ink">{formatMoney(product.price)}</p>

      {product.variants.length > 0 && (
        <fieldset className="mt-6">
          <legend className="mb-2.5 flex w-full items-center justify-between text-[14px] font-semibold text-ink">
            Choose one <Badge tone="brand">Required</Badge>
          </legend>
          <div className="flex flex-col gap-2">
            {product.variants.map((v) => (
              <label key={v.id} className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 transition-colors', variantId === v.id ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-2')}>
                <input type="radio" name="variant" className="size-[18px] accent-[var(--brand)]" checked={variantId === v.id} onChange={() => setVariantId(v.id)} />
                <span className="flex-1 text-[14.5px] text-ink">{v.name}</span>
                <span className="tabular text-[13.5px] text-muted">{v.price ? `+${formatMoney(v.price)}` : 'Included'}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {product.addons.length > 0 && (
        <fieldset className="mt-6">
          <legend className="mb-2.5 flex w-full items-center justify-between text-[14px] font-semibold text-ink">
            Add extras <span className="text-[12.5px] font-normal text-muted">Optional</span>
          </legend>
          <div className="flex flex-col gap-2">
            {product.addons.map((a) => {
              const on = addonIds.includes(a.id);
              return (
                <label key={a.id} className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 transition-colors', on ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-2')}>
                  <input type="checkbox" className="size-[18px] accent-[var(--brand)]" checked={on} onChange={(e) => setAddonIds((ids) => (e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id)))} />
                  <span className="flex-1 text-[14.5px] text-ink">{a.name}</span>
                  <span className="tabular text-[13.5px] text-muted">+{formatMoney(a.price)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {product.isAvailable && (
        <div className="mt-6">
          <Textarea label="Note for the kitchen" placeholder="e.g. No onions, extra crispy" rows={2} maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
    </Dialog>
  );
}

export interface PricedLine {
  item: CartItem;
  product?: Product;
  title: string;
  options: string;
  unit: number;
  total: number;
  problem?: string;
}

export function priceCart(cart: CartItem[], products: Product[]): PricedLine[] {
  return cart.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product) return { item, title: 'Item no longer on the menu', options: '', unit: 0, total: 0, problem: 'Removed from the menu' };
    const variant = item.variantId ? product.variants.find((v) => v.id === item.variantId) : undefined;
    const addons = product.addons.filter((a) => item.addonIds.includes(a.id));
    const missingOption = (item.variantId && !variant) || addons.length !== item.addonIds.length;
    const unit = product.price + (variant?.price ?? 0) + addons.reduce((s, a) => s + a.price, 0);
    return {
      item,
      product,
      title: product.title,
      options: [variant?.name, ...addons.map((a) => `+ ${a.name}`), item.note ? `“${item.note}”` : ''].filter(Boolean).join(' · '),
      unit,
      total: unit * item.quantity,
      problem: !product.isAvailable ? 'Sold out — remove to continue' : missingOption ? 'Options changed — remove and re-add' : undefined,
    };
  });
}

const METHODS = [
  { id: 'cash_at_counter', label: 'Cash at counter', hint: 'Pay at the counter after your meal', icon: Banknote, available: true },
  { id: 'online_payment', label: 'Online payment', hint: 'Coming soon', icon: Globe, available: false },
  { id: 'credit_card', label: 'Credit / debit card', hint: 'Coming soon', icon: CreditCard, available: false },
] as const;

export function CartSheet({
  open,
  onClose,
  lines,
  restaurant,
  onQty,
  note,
  onNote,
  onSubmit,
  submitting,
  error,
}: {
  open: boolean;
  onClose: () => void;
  lines: PricedLine[];
  restaurant: Restaurant;
  onQty: (key: string, qty: number) => void;
  note: string;
  onNote: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const service = Math.round((subtotal * restaurant.settings.serviceChargePercent) / 100);
  const blocked = lines.some((l) => l.problem);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Your order"
      description={lines.length ? `${lines.reduce((s, l) => s + l.item.quantity, 0)} items` : undefined}
      footer={
        lines.length ? (
          <Button block size="lg" onClick={onSubmit} loading={submitting} disabled={blocked}>
            Place order · {formatMoney(subtotal + service)}
          </Button>
        ) : undefined
      }
    >
      {lines.length === 0 ? (
        <EmptyState compact icon={ShoppingBag} title="Your cart is empty" description="Add something tasty from the menu." />
      ) : (
        <div className="flex flex-col gap-5">
          {error && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] font-medium text-danger">{error}</p>}
          <ul className="flex flex-col divide-y divide-line">
            {lines.map((l) => (
              <li key={l.item.key} className="flex gap-3 py-3 first:pt-0">
                <FoodImage src={l.product?.image} alt="" className="size-16 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug text-ink">{l.title}</p>
                  {l.options && <p className="mt-0.5 text-[12.5px] text-muted">{l.options}</p>}
                  {l.problem && <p className="mt-1 text-[12.5px] font-semibold text-danger">{l.problem}</p>}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Stepper value={l.item.quantity} min={0} onChange={(v) => onQty(l.item.key, v)} label={`Quantity of ${l.title}`} />
                    <span className="tabular font-semibold text-ink">{formatMoney(l.total)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Textarea label="Note for the restaurant" rows={2} maxLength={240} placeholder="Allergies, timing, anything else?" value={note} onChange={(e) => onNote(e.target.value)} />
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-ink-2">Payment</legend>
            <div className="flex flex-col gap-2">
              {METHODS.map((m) => (
                <label
                  key={m.id}
                  className={cn(
                    'flex min-h-14 items-center gap-3 rounded-xl border px-4 py-2.5',
                    m.available ? 'cursor-pointer border-brand bg-brand-soft' : 'cursor-not-allowed border-line opacity-60'
                  )}
                >
                  <input type="radio" name="payment" className="size-[18px] accent-[var(--brand)]" checked={m.available} disabled={!m.available} readOnly />
                  <m.icon className="size-5 text-ink-2" aria-hidden />
                  <span className="flex-1">
                    <span className="block text-[14px] font-medium text-ink">{m.label}</span>
                    <span className="block text-[12px] text-muted">{m.hint}</span>
                  </span>
                  {!m.available && <Badge>Soon</Badge>}
                </label>
              ))}
            </div>
          </fieldset>
          <dl className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 p-4 text-[14px]">
            <div className="flex justify-between text-muted"><dt>Subtotal</dt><dd className="tabular">{formatMoney(subtotal)}</dd></div>
            {service > 0 && <div className="flex justify-between text-muted"><dt>Service charge ({restaurant.settings.serviceChargePercent}%)</dt><dd className="tabular">{formatMoney(service)}</dd></div>}
            <div className="mt-1 flex justify-between border-t border-line pt-2 text-[16px] font-bold text-ink"><dt>Estimated total</dt><dd className="tabular">{formatMoney(subtotal + service)}</dd></div>
          </dl>
          <p className="text-center text-[12px] text-muted">Prices are confirmed by the restaurant when your order is placed.</p>
        </div>
      )}
    </Dialog>
  );
}

const GUEST_STEPS: Array<{ status: Order['status'][]; label: string; icon: typeof Clock3 }> = [
  { status: ['pending_approval'], label: 'Sent', icon: Clock3 },
  { status: ['new', 'preparing'], label: 'In the kitchen', icon: ChefHat },
  { status: ['ready', 'completed'], label: 'Almost there', icon: UtensilsCrossed },
  { status: ['served'], label: 'Served', icon: CheckCircle2 },
];

export function OrdersSheet({ open, onClose, orders }: { open: boolean; onClose: () => void; orders: Order[] }) {
  const sorted = useMemo(() => [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [orders]);
  return (
    <Dialog open={open} onClose={onClose} size="md" title="Your orders" description="Live status from the restaurant. Pay at the counter when you’re done.">
      {sorted.length === 0 ? (
        <EmptyState compact icon={ShoppingBag} title="No orders yet" />
      ) : (
        <ul className="flex flex-col gap-4">
          {sorted.map((o) => {
            const step = GUEST_STEPS.findIndex((s) => s.status.includes(o.status));
            return (
              <li key={o.id} className="rounded-2xl border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">Order {o.number}</p>
                    <p className="text-[12.5px] text-muted">Placed {formatTime(o.createdAt)} · {formatMoney(o.total)}</p>
                  </div>
                  <Badge tone={o.paymentStatus === 'paid' ? 'success' : o.status === 'rejected' ? 'danger' : ORDER_STATUS[o.status].tone} dot>
                    {o.paymentStatus === 'paid' ? 'Paid' : o.status === 'pending_approval' ? 'Waiting for staff' : ORDER_STATUS[o.status].label}
                  </Badge>
                </div>
                {o.status === 'rejected' ? (
                  <p className="mt-3 flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
                    <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    Sorry, this order couldn’t be accepted: {o.rejection?.reason}. Please ask a staff member.
                  </p>
                ) : (
                  <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label="Order progress">
                    {GUEST_STEPS.map((s, i) => {
                      const done = i <= step;
                      return (
                        <li key={s.label} className="flex flex-col items-center gap-1.5 text-center">
                          <span className={cn('h-1.5 w-full rounded-full', done ? 'bg-brand' : 'bg-surface-3')} aria-hidden />
                          <s.icon className={cn('size-4', done ? 'text-brand-strong' : 'text-muted')} aria-hidden />
                          <span className={cn('text-[11px] leading-tight', done ? 'font-semibold text-ink' : 'text-muted')}>{s.label}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
                <ul className="mt-4 flex flex-col gap-1 border-t border-line pt-3 text-[13px] text-ink-2">
                  {o.lines.map((l) => (
                    <li key={l.id} className="flex justify-between gap-2">
                      <span>{l.quantity} × {l.title}</span>
                      <span className="tabular text-muted">{formatMoney(l.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
