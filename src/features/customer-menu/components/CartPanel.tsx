import React from 'react';
import { ArrowRight, ShoppingBag } from 'lucide-react';
import type { Restaurant } from '@/src/types/domain';
import { Button } from '@/src/components/ui/Button';
import { FoodImage } from '@/src/components/shared/Brand';
import { formatMoney } from '@/src/utils/format';
import { Stepper, type PricedLine } from './GuestSheets';

/** Desktop-only sticky order summary shown beside the menu. */
export function CartPanel({
  lines,
  restaurant,
  onQty,
  onCheckout,
}: {
  lines: PricedLine[];
  restaurant: Restaurant;
  onQty: (key: string, qty: number) => void;
  onCheckout: () => void;
}) {
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const service = Math.round((subtotal * restaurant.settings.serviceChargePercent) / 100);
  const count = lines.reduce((s, l) => s + l.item.quantity, 0);

  return (
    <aside aria-label="Your order" className="flex max-h-[calc(100dvh-7rem)] flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-md">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="text-[17px] font-bold text-ink">Your order</h2>
        {count > 0 && <span className="tabular rounded-full bg-brand-soft px-2.5 py-0.5 text-[12.5px] font-bold text-brand-strong">{count} item{count === 1 ? '' : 's'}</span>}
      </div>

      {lines.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-muted">
            <ShoppingBag className="size-6" aria-hidden />
          </span>
          <p className="mt-4 font-semibold text-ink">Nothing here yet</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">Add dishes from the menu. Your order goes straight to the restaurant when you place it.</p>
        </div>
      ) : (
        <>
          <ul className="thin-scroll min-h-0 flex-1 divide-y divide-line overflow-y-auto px-5">
            {lines.map((l) => (
              <li key={l.item.key} className="flex gap-3 py-3.5">
                <FoodImage src={l.product?.image} alt="" className="size-14 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold leading-snug text-ink">{l.title}</p>
                  {l.options && <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{l.options}</p>}
                  {l.problem && <p className="mt-1 text-[12px] font-semibold text-danger">{l.problem}</p>}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="origin-left scale-90">
                      <Stepper value={l.item.quantity} min={0} onChange={(v) => onQty(l.item.key, v)} label={`Quantity of ${l.title}`} />
                    </div>
                    <span className="tabular text-[14px] font-semibold text-ink">{formatMoney(l.total)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-line bg-surface-2/60 px-5 py-4">
            <dl className="flex flex-col gap-1 text-[13.5px]">
              <div className="flex justify-between text-muted"><dt>Subtotal</dt><dd className="tabular">{formatMoney(subtotal)}</dd></div>
              {service > 0 && <div className="flex justify-between text-muted"><dt>Service ({restaurant.settings.serviceChargePercent}%)</dt><dd className="tabular">{formatMoney(service)}</dd></div>}
              <div className="mt-1 flex justify-between text-[16px] font-bold text-ink"><dt>Total</dt><dd className="tabular">{formatMoney(subtotal + service)}</dd></div>
            </dl>
            <Button block size="lg" className="mt-4" iconRight={ArrowRight} onClick={onCheckout} disabled={lines.some((l) => l.problem)}>
              Review & place order
            </Button>
            <p className="mt-2 text-center text-[11.5px] text-muted">Pay with cash at the counter</p>
          </div>
        </>
      )}
    </aside>
  );
}
