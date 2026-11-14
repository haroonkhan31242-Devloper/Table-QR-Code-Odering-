import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardList, MapPin, Plus, QrCode, Search, Star, Store, XCircle } from 'lucide-react';
import { useDatabase } from '@/src/hooks/useData';
import { useTheme } from '@/src/app/providers/ThemeProvider';
import { resolveQr } from '@/src/services/qr/qrService';
import { errorMessage } from '@/src/services/storage/errors';
import { FoodImage, ThemeToggle } from '@/src/components/shared/Brand';
import { Badge } from '@/src/components/ui/Display';
import { Button } from '@/src/components/ui/Button';
import { Dialog } from '@/src/components/ui/Overlay';
import { useToast } from '@/src/components/feedback/Toast';
import type { Product } from '@/src/types/domain';
import { cn, formatMoney } from '@/src/utils/format';
import { customerOrders, submitCustomerOrder } from '@/src/features/orders/services/orderService';
import { lineKey, loadGuest, requestIdFor, saveGuest, type CartItem } from './services/guestSession';
import { CartSheet, OrdersSheet, ProductSheet, priceCart } from './components/GuestSheets';
import { CartPanel } from './components/CartPanel';
import { tenantThemeStyle } from './tenantTheme';

function QrProblem({ icon: Icon, title, text, restaurantName }: { icon: typeof XCircle; title: string; text: string; restaurantName?: string }) {
  return (
    <div className="grain flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-3xl border border-line bg-surface text-danger shadow-sm">
        <Icon className="size-7" aria-hidden />
      </span>
      {restaurantName && <p className="mt-6 text-[13px] font-semibold uppercase tracking-wider text-muted">{restaurantName}</p>}
      <h1 className="mt-2 text-[24px] font-bold text-ink">{title}</h1>
      <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted">{text}</p>
    </div>
  );
}

export default function CustomerMenuPage() {
  const { slug = '', token = '' } = useParams();
  const [params] = useSearchParams();
  const tableRef = params.get('table');
  const db = useDatabase();
  const { theme } = useTheme();
  const toast = useToast();

  const resolution = useMemo(() => resolveQr(db, slug, token, tableRef), [db, slug, token, tableRef]);
  const ok = resolution.status === 'ok' ? resolution : null;

  const [guest, setGuest] = useState(() => loadGuest(token));
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<string>('');
  const [productOpen, setProductOpen] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => saveGuest(token, guest), [token, guest]);

  // Apply the restaurant's accent to the whole document (portals included).
  useEffect(() => {
    if (!ok) return;
    const style = tenantThemeStyle(ok.restaurant.accentColor, theme === 'dark') as Record<string, string>;
    const root = document.documentElement;
    Object.entries(style).forEach(([k, v]) => root.style.setProperty(k, v));
    document.title = `${ok.restaurant.name} · ${ok.table.label}`;
    return () => Object.keys(style).forEach((k) => root.style.removeProperty(k));
  }, [ok?.restaurant.accentColor, ok?.restaurant.name, ok?.table.label, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  const products = ok?.products ?? [];
  const categories = ok?.categories ?? [];
  const lines = useMemo(() => priceCart(guest.cart, products), [guest.cart, products]);
  const itemCount = guest.cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = lines.reduce((s, l) => s + l.total, 0);
  const myOrders = useMemo(() => (ok ? customerOrders(db, ok.restaurant.id, guest.orderIds) : []), [db, ok, guest.orderIds]);
  const activeOrders = myOrders.filter((o) => o.status !== 'rejected' && (o.status !== 'served' || o.paymentStatus === 'unpaid'));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? products.filter((p) => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)) : products;
  }, [products, query]);

  // Scroll-spy for the category bar.
  useEffect(() => {
    if (!categories.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveCat(visible.target.getAttribute('data-cat') ?? '');
      },
      { rootMargin: '-120px 0px -60% 0px' }
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [categories, filtered]);

  if (resolution.status === 'invalid')
    return <QrProblem icon={QrCode} title="This QR code isn’t recognised" text="It may be damaged or from another venue. Please ask a member of staff for help." />;
  if (resolution.status === 'revoked')
    return <QrProblem icon={XCircle} restaurantName={resolution.restaurant.name} title="This table code was switched off" text="The restaurant has revoked this QR code. Please ask a member of staff for a new one." />;
  if (resolution.status === 'superseded')
    return <QrProblem icon={QrCode} restaurantName={resolution.restaurant.name} title="This QR code has been replaced" text="The table has a newer code. Please scan the current code on your table, or ask staff for help." />;
  if (resolution.status === 'table_removed')
    return <QrProblem icon={XCircle} restaurantName={resolution.restaurant.name} title="This table is no longer in use" text="Please ask a member of staff where to sit." />;
  if (resolution.status === 'suspended')
    return <QrProblem icon={Store} restaurantName={resolution.restaurant.name} title="Ordering is paused" text="This restaurant isn’t taking QR orders right now. Please order with a member of staff." />;
  if (!ok) return null;

  const { restaurant, table } = ok;

  const addToCart = (item: Omit<CartItem, 'key'>) => {
    const key = lineKey(item.productId, item.variantId, item.addonIds, item.note);
    setGuest((g) => {
      const existing = g.cart.find((c) => c.key === key);
      const cart = existing
        ? g.cart.map((c) => (c.key === key ? { ...c, quantity: Math.min(50, c.quantity + item.quantity) } : c))
        : [...g.cart, { ...item, key }];
      return { ...g, cart };
    });
    toast.success('Added to your order');
  };

  const quickAdd = (p: Product) => {
    if (p.variants.length || p.addons.length) setProductOpen(p);
    else addToCart({ productId: p.id, addonIds: [], quantity: 1 });
  };

  const setQty = (key: string, qty: number) =>
    setGuest((g) => ({ ...g, cart: qty <= 0 ? g.cart.filter((c) => c.key !== key) : g.cart.map((c) => (c.key === key ? { ...c, quantity: qty } : c)) }));

  const submit = () => {
    setSubmitError(null);
    setSubmitting(true);
    const requestId = requestIdFor(guest);
    // Persist the idempotency key first so a refresh / double tap re-uses it.
    const pending = { ...guest, pendingRequestId: requestId };
    setGuest(pending);
    saveGuest(token, pending);
    try {
      const order = submitCustomerOrder({
        slug,
        token,
        tableRef,
        clientRequestId: requestId,
        lines: guest.cart.map((c) => ({ productId: c.productId, variantId: c.variantId, addonIds: c.addonIds, quantity: c.quantity, note: c.note })),
        note,
        paymentMethod: 'cash_at_counter',
      });
      setGuest((g) => ({ cart: [], orderIds: g.orderIds.includes(order.id) ? g.orderIds : [...g.orderIds, order.id] }));
      setNote('');
      setCartOpen(false);
      setConfirmation(order.id);
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmed = confirmation ? myOrders.find((o) => o.id === confirmation) : null;
  const scrollTo = (id: string) => {
    const el = sectionRefs.current[id];
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 84, behavior: 'smooth' });
  };

  const popular = query ? [] : products.filter((p) => p.isPopular && p.isAvailable).slice(0, 6);

  return (
    <div className="min-h-dvh bg-bg pb-28 lg:pb-12">
      {/* Hero */}
      <header className="relative isolate overflow-hidden">
        <FoodImage src={restaurant.coverImage} alt="" className="absolute inset-0 -z-10 size-full" loading="eager" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/45 via-black/25 to-black/80" />
        <div className="mx-auto flex min-h-[15rem] max-w-7xl flex-col px-4 pb-5 pt-3 sm:min-h-[18rem] sm:px-6 lg:min-h-[20rem] lg:px-8 lg:pb-8">
          <div className="flex justify-end gap-2">
            {myOrders.length > 0 && (
              <button type="button" onClick={() => setOrdersOpen(true)} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-black/45 px-3 text-[13px] font-semibold text-white backdrop-blur-md hover:bg-black/60">
                <ClipboardList className="size-4" aria-hidden /> My orders
                {activeOrders.length > 0 && <span className="tabular rounded-full bg-white px-1.5 text-[11px] font-bold text-black">{activeOrders.length}</span>}
              </button>
            )}
            <ThemeToggle className="bg-black/45 text-white backdrop-blur-md hover:bg-black/60 hover:text-white" />
          </div>
          <div className="mt-auto flex items-end gap-4 text-white sm:gap-5">
            <FoodImage src={restaurant.logoImage} alt={`${restaurant.name} logo`} className="size-16 shrink-0 rounded-2xl border-2 border-white/80 shadow-lg sm:size-20 lg:size-24" />
            <div className="min-w-0 flex-1">
              <h1 className="text-balance text-[26px] font-bold leading-tight sm:text-[34px] lg:text-[42px]">{restaurant.name}</h1>
              <p className="mt-0.5 text-[13.5px] text-white/85 sm:text-[15px]">{restaurant.tagline || restaurant.cuisine}</p>
              <div className="mt-3 hidden flex-wrap items-center gap-2 sm:flex">
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand px-3 text-[13px] font-bold text-brand-ink">
                  <QrCode className="size-3.5" aria-hidden /> {table.label}
                </span>
                <span className="inline-flex h-8 items-center gap-1 rounded-full bg-white/15 px-3 text-[13px] font-medium backdrop-blur-md"><MapPin className="size-3.5" aria-hidden /> {restaurant.city}</span>
                {restaurant.settings.requireWaiterApproval && (
                  <span className="inline-flex h-8 items-center rounded-full bg-white/15 px-3 text-[13px] font-medium backdrop-blur-md">A waiter confirms each order</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Mobile info chips */}
        <div className="mt-4 flex flex-wrap items-center gap-2 sm:hidden">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand px-3 text-[13px] font-bold text-brand-ink">
            <QrCode className="size-3.5" aria-hidden /> {table.label}
          </span>
          <span className="inline-flex items-center gap-1 text-[13px] text-muted"><MapPin className="size-3.5" aria-hidden /> {restaurant.city}</span>
          {restaurant.settings.requireWaiterApproval && <Badge tone="info">A waiter confirms each order</Badge>}
        </div>
        {restaurant.description && <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-muted sm:mt-6 sm:text-[15px]">{restaurant.description}</p>}
      </div>

      {/* Sticky toolbar: categories + search */}
      <div className="sticky top-0 z-20 mt-4 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:px-6 md:flex-row md:items-center md:gap-4 lg:px-8">
          <div className="relative md:order-2 md:w-72 md:shrink-0">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the menu"
              aria-label="Search the menu"
              className="h-11 w-full rounded-full border border-line bg-surface pl-11 pr-4 text-[16px] text-ink shadow-sm outline-none placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand/15 md:text-[14.5px]"
            />
          </div>
          {!query && categories.length > 0 && (
            <nav
              aria-label="Menu categories"
              className="no-scrollbar -mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-28px),transparent)] sm:-mx-0 sm:px-0 md:order-1"
            >
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => scrollTo(c.id)}
                  aria-current={activeCat === c.id ? 'true' : undefined}
                  className={cn(
                    'h-10 shrink-0 rounded-full px-4 text-[14px] font-semibold transition-colors first:ml-0.5 last:mr-6',
                    activeCat === c.id ? 'bg-ink text-bg' : 'bg-surface text-ink-2 ring-1 ring-line hover:ring-line-strong'
                  )}
                >
                  {c.name}
                </button>
              ))}
            </nav>
          )}
          {query && <p className="text-[14px] text-muted md:order-1 md:flex-1">{filtered.length} result{filtered.length === 1 ? '' : 's'} for “{query}”</p>}
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <main className="min-w-0">
          {/* Popular strip */}
          {popular.length > 0 && (
            <section aria-labelledby="popular-heading" className="pt-7">
              <h2 id="popular-heading" className="flex items-center gap-2 text-[21px] font-bold text-ink sm:text-[24px]">
                <Star className="size-5 text-brand-strong" aria-hidden /> Popular right now
              </h2>
              <ul className="no-scrollbar -mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:-mx-0 sm:px-0">
                {popular.map((p) => (
                  <li key={p.id} className="w-56 shrink-0 snap-start sm:w-60">
                    <button type="button" onClick={() => setProductOpen(p)} className="group block w-full overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-sm transition-shadow hover:shadow-md">
                      <div className="overflow-hidden">
                        <FoodImage src={p.image} alt="" className="aspect-[4/3] w-full transition-transform duration-500 group-hover:scale-105" />
                      </div>
                      <div className="p-3">
                        <p className="line-clamp-1 text-[14.5px] font-semibold text-ink">{p.title}</p>
                        <p className="tabular mt-0.5 text-[14px] font-bold text-brand-strong">{formatMoney(p.price)}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <p className="font-semibold text-ink">{query ? `Nothing matches “${query}”` : 'The menu is being updated'}</p>
              <p className="mt-1 text-[14px] text-muted">{query ? 'Try another word.' : 'Please check back in a moment or ask a member of staff.'}</p>
            </div>
          )}

          {categories.map((c) => {
            const items = filtered.filter((p) => p.categoryId === c.id);
            if (!items.length) return null;
            return (
              <section key={c.id} data-cat={c.id} ref={(el) => { sectionRefs.current[c.id] = el; }} aria-labelledby={`cat-${c.id}`} className="scroll-mt-24 pt-9">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id={`cat-${c.id}`} className="text-[21px] font-bold text-ink sm:text-[24px]">{c.name}</h2>
                  <span className="text-[13px] text-muted">{items.length} item{items.length === 1 ? '' : 's'}</span>
                </div>
                {c.description && <p className="mt-0.5 text-[13.5px] text-muted">{c.description}</p>}
                <ul className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
                  {items.map((p) => (
                    <li key={p.id} className="min-w-0">
                      <article
                        className={cn(
                          'group relative flex h-full gap-3 rounded-2xl border border-line bg-surface p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:flex-col sm:gap-0 sm:overflow-hidden sm:p-0',
                          !p.isAvailable && 'opacity-60'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setProductOpen(p)}
                          className="flex min-w-0 flex-1 flex-row-reverse gap-3 text-left sm:flex-col sm:gap-0"
                          aria-label={`${p.title}, ${formatMoney(p.price)}. View details`}
                        >
                          <div className="relative shrink-0 overflow-hidden rounded-xl sm:rounded-none">
                            <FoodImage src={p.image} alt="" className={cn('size-28 transition-transform duration-500 group-hover:scale-105 sm:aspect-[16/10] sm:size-auto sm:w-full', !p.isAvailable && 'grayscale')} />
                            <div className="absolute left-2 top-2 hidden gap-1.5 sm:flex">
                              {p.isPopular && <Badge tone="brand" icon={Star} className="bg-surface/95 backdrop-blur">Popular</Badge>}
                              {!p.isAvailable && <Badge tone="danger" className="bg-surface/95 backdrop-blur">Sold out</Badge>}
                            </div>
                          </div>
                          <div className="min-w-0 flex-1 py-0.5 sm:px-4 sm:pb-16 sm:pt-3.5">
                            <div className="flex flex-wrap items-center gap-1.5 sm:hidden">
                              {p.isPopular && <Badge tone="brand" icon={Star} className="h-5 px-2 text-[11px]">Popular</Badge>}
                              {!p.isAvailable && <Badge tone="danger" className="h-5 px-2 text-[11px]">Sold out</Badge>}
                            </div>
                            <h3 className="mt-1 text-[15.5px] font-semibold leading-snug text-ink sm:mt-0 sm:text-[16px]">{p.title}</h3>
                            <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">{p.description}</p>
                            <p className="tabular mt-2 text-[15px] font-bold text-ink sm:absolute sm:bottom-4 sm:left-4 sm:mt-0 sm:text-[16px]">
                              {formatMoney(p.price)}
                              {p.variants.some((v) => v.price > 0) && <span className="ml-1 text-[12px] font-medium text-muted">+ options</span>}
                            </p>
                          </div>
                        </button>
                        {p.isAvailable && (
                          <div className="flex shrink-0 items-end sm:absolute sm:bottom-3 sm:right-3">
                            <button
                              type="button"
                              onClick={() => quickAdd(p)}
                              aria-label={`Add ${p.title}`}
                              className="flex size-10 items-center justify-center gap-1.5 rounded-xl bg-brand text-brand-ink shadow-sm transition-transform active:scale-95 sm:h-10 sm:w-auto sm:px-3.5 sm:text-[13.5px] sm:font-semibold"
                            >
                              <Plus className="size-[18px]" aria-hidden />
                              <span className="hidden sm:inline">Add</span>
                            </button>
                          </div>
                        )}
                      </article>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <p className="py-10 text-center text-[12px] text-muted">Prices in PKR{restaurant.settings.serviceChargePercent ? ` · ${restaurant.settings.serviceChargePercent}% service charge added at checkout` : ''}</p>
        </main>

        {/* Desktop order panel */}
        <div className="hidden lg:block">
          <div className="sticky top-24 pt-7">
            <CartPanel lines={lines} restaurant={restaurant} onQty={setQty} onCheckout={() => setCartOpen(true)} />
          </div>
        </div>
      </div>

      {/* Mobile / tablet cart bar */}
      {itemCount > 0 && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 px-4 pt-3 lg:hidden">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex h-14 w-full max-w-xl items-center gap-3 rounded-2xl bg-brand px-4 text-brand-ink shadow-lg transition-transform active:scale-[0.99]"
          >
            <span className="tabular flex size-8 items-center justify-center rounded-lg bg-black/15 text-[14px] font-bold">{itemCount}</span>
            <span className="flex-1 text-left text-[15px] font-semibold">View order</span>
            <span className="tabular text-[15px] font-bold">{formatMoney(cartTotal)}</span>
          </button>
        </div>
      )}

      <ProductSheet product={productOpen} onClose={() => setProductOpen(null)} onAdd={addToCart} />
      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        lines={lines}
        restaurant={restaurant}
        onQty={setQty}
        note={note}
        onNote={setNote}
        onSubmit={submit}
        submitting={submitting}
        error={submitError}
      />
      <OrdersSheet open={ordersOpen} onClose={() => setOrdersOpen(false)} orders={myOrders} />

      <Dialog open={Boolean(confirmed)} onClose={() => setConfirmation(null)} size="sm" title="Order placed">
        {confirmed && (
          <div className="flex flex-col items-center text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckCircle2 className="size-8" aria-hidden />
            </span>
            <p className="mt-4 font-display text-[22px] font-bold text-ink">Order {confirmed.number}</p>
            <p className="mt-1 text-[14.5px] text-muted">
              {confirmed.status === 'pending_approval'
                ? 'A waiter will confirm it shortly, then it goes to the kitchen.'
                : 'It’s on its way to the kitchen.'}
            </p>
            <p className="tabular mt-4 text-[15px] font-semibold text-ink">{formatMoney(confirmed.total)} · pay at the counter</p>
            <div className="mt-6 flex w-full flex-col gap-2">
              <Button block onClick={() => { setConfirmation(null); setOrdersOpen(true); }}>Track my order</Button>
              <Button block variant="secondary" onClick={() => setConfirmation(null)}>Back to menu</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
