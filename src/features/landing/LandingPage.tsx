import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ChefHat,
  QrCode,
  ScanLine,
  ShieldCheck,
  Smartphone,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { Logo, ThemeToggle, FoodImage } from '@/src/components/shared/Brand';
import { useDatabase } from '@/src/hooks/useData';
import { DEMO_FOOD_ASSETS } from '@/src/services/mock-data/demoAssets';

const FEATURES = [
  { icon: QrCode, title: 'A unique QR for every table', text: 'Cryptographically random tokens, checked for uniqueness across every restaurant. Regenerate or revoke one in a click.' },
  { icon: UserCheck, title: 'Approval when you want it', text: 'Send orders straight to the kitchen, or have an authorised waiter review them first. You choose per restaurant.' },
  { icon: ChefHat, title: 'A calm kitchen display', text: 'Accept or reject with a reason, then move tickets from preparing to ready, with timers that flag late orders.' },
  { icon: Wallet, title: 'Cash at counter, done right', text: 'Individual or combined table bills, automatic change, and underpayments blocked. Receipts print and reprint.' },
  { icon: Users, title: 'Roles and fine-grained access', text: 'Owners, managers, waiters, kitchen and cashiers each see only the modules and actions they’ve been granted.' },
  { icon: BarChart3, title: 'Reports from real activity', text: 'Sales, popular dishes, tables and staff activity, all calculated from orders and payments recorded in the system.' },
];

const STEPS = [
  { icon: ScanLine, title: 'Guest scans', text: 'The table’s QR opens that restaurant’s menu, already linked to the table. No app and no sign-up.' },
  { icon: UserCheck, title: 'Waiter approves', text: 'Optional. When it’s on, only waiters with approval permission can release the order.' },
  { icon: ChefHat, title: 'Kitchen prepares', text: 'New → Preparing → Ready → Completed, then the waiter marks it served.' },
  { icon: Wallet, title: 'Cashier settles', text: 'Cash at counter with automatic change. Table status stays a manual decision.' },
];

export default function LandingPage() {
  const db = useDatabase();
  const demoTables = useMemo(
    () =>
      db.restaurants
        .filter((r) => r.status === 'active')
        .map((r) => {
          const table = db.tables.find((t) => t.restaurantId === r.id && t.qrToken);
          return table ? { restaurant: r, table } : null;
        })
        .filter(Boolean) as Array<{ restaurant: (typeof db.restaurants)[number]; table: (typeof db.tables)[number] }>,
    [db]
  );

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
            <a href="#features" className="hidden rounded-lg px-3 py-2 text-[14px] font-medium text-muted hover:text-ink md:block">Features</a>
            <a href="#demo" className="hidden rounded-lg px-3 py-2 text-[14px] font-medium text-muted hover:text-ink md:block">Try a table</a>
            <ThemeToggle />
            <Link to="/portal/login" className="inline-flex h-10 items-center rounded-xl bg-ink px-4 text-[14px] font-semibold text-bg transition-opacity hover:opacity-90">
              Restaurant sign in
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="grain absolute inset-0 opacity-60" aria-hidden />
          <div className="absolute -right-40 -top-40 size-[520px] rounded-full bg-brand/15 blur-3xl" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-14 md:pt-20 lg:grid-cols-[1.1fr_1fr] lg:pb-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink-2 shadow-sm">
                <span className="size-1.5 rounded-full bg-success" aria-hidden /> Multi-restaurant SaaS · QR ordering
              </span>
              <h1 className="mt-5 text-balance text-[42px] font-extrabold leading-[1.02] text-ink sm:text-[56px]">
                Run every table, ticket and till <span className="text-brand">from one place.</span>
              </h1>
              <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
                TableCraft connects table QR ordering to your waiters, kitchen and cashier. Every restaurant on the platform keeps its own menu, staff, tables and reports, fully separated.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/portal/login" className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-brand-ink shadow-md transition-colors hover:bg-brand-hover">
                  Open restaurant portal <ArrowRight className="size-4" aria-hidden />
                </Link>
                <a href="#demo" className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-[15px] font-semibold text-ink shadow-sm hover:bg-surface-2">
                  <Smartphone className="size-4" aria-hidden /> Order as a guest
                </a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-muted">
                {['No customer sign-up', 'Works on any phone', 'Light & dark mode'].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-success" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Product collage */}
            <div className="relative mx-auto w-full max-w-[460px]">
              <div className="overflow-hidden rounded-[28px] border border-line bg-surface shadow-lg">
                <img src={DEMO_FOOD_ASSETS.heroFeast} alt="A table of burgers, fried chicken and fries" className="h-56 w-full object-cover sm:h-64" />
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Kitchen display</p>
                      <p className="font-display text-lg font-bold text-ink">3 tickets in progress</p>
                    </div>
                    <span className="rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-semibold text-success">Live</span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    {[
                      ['New', 'bg-info-soft text-info'],
                      ['Preparing', 'bg-violet-soft text-violet'],
                      ['Ready', 'bg-success-soft text-success'],
                    ].map(([label, cls]) => (
                      <div key={label} className={`rounded-xl px-2 py-3 text-[12.5px] font-semibold ${cls}`}>
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -left-4 hidden w-56 rounded-2xl border border-line bg-surface p-4 shadow-lg sm:block">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
                    <QrCode className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-ink">Table 04 · QR v2</p>
                    <p className="text-[12px] text-muted">Previous code revoked</p>
                  </div>
                </div>
              </div>
              <div className="absolute -right-3 -top-5 hidden rounded-2xl border border-line bg-surface px-4 py-3 shadow-lg sm:block">
                <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">Change due</p>
                <p className="tabular font-display text-xl font-bold text-ink">PKR 310</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-line bg-surface/50 py-20">
          <div className="mx-auto max-w-6xl px-5">
            <div className="max-w-2xl">
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-strong">Built for real service</p>
              <h2 className="mt-2 text-balance text-[32px] font-bold leading-tight text-ink sm:text-[38px]">Everything a busy floor needs, and nothing it doesn’t.</h2>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <article key={title} className="group rounded-2xl border border-line bg-surface p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand-strong transition-transform group-hover:scale-105">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-5 text-[17px] font-semibold text-ink">{title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Flow */}
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-balance text-[30px] font-bold text-ink sm:text-[34px]">From scan to settled</h2>
            <ol className="mt-10 grid gap-4 md:grid-cols-4">
              {STEPS.map(({ icon: Icon, title, text }, i) => (
                <li key={title} className="relative rounded-2xl border border-line bg-surface p-5 shadow-sm">
                  <span className="tabular absolute right-5 top-5 font-display text-[28px] font-extrabold text-surface-3">0{i + 1}</span>
                  <Icon className="size-6 text-brand" aria-hidden />
                  <h3 className="mt-4 text-[16px] font-semibold text-ink">{title}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Demo tables */}
        <section id="demo" className="border-t border-line bg-surface/50 py-20">
          <div className="mx-auto max-w-6xl px-5">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div className="max-w-xl">
                <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-strong">Live demo</p>
                <h2 className="mt-2 text-[30px] font-bold text-ink">Sit at a demo table</h2>
                <p className="mt-2 text-[14.5px] text-muted">These links use the real QR token of Table 01 at each demo restaurant. Orders you place appear in that restaurant’s portal.</p>
              </div>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {demoTables.map(({ restaurant, table }) => (
                <Link
                  key={restaurant.id}
                  to={`/menu/${restaurant.slug}/${table.qrToken}?table=${table.number}`}
                  className="group overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <FoodImage src={restaurant.coverImage} alt="" className="h-36 w-full transition-transform duration-500 group-hover:scale-[1.03]" />
                  <div className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-display text-[16px] font-bold text-ink">{restaurant.name}</p>
                      <p className="text-[13px] text-muted">{restaurant.cuisine} · {table.label}</p>
                    </div>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong transition-transform group-hover:translate-x-0.5">
                      <ArrowRight className="size-4" aria-hidden />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Portals */}
        <section className="py-20">
          <div className="mx-auto grid max-w-6xl gap-4 px-5 md:grid-cols-2">
            <Link to="/portal/login" className="group rounded-3xl bg-ink p-8 text-bg shadow-lg transition-transform hover:-translate-y-0.5">
              <Building2 className="size-7 opacity-80" aria-hidden />
              <h3 className="mt-6 font-display text-[24px] font-bold">Restaurant portal</h3>
              <p className="mt-2 max-w-sm text-[14.5px] opacity-75">For owners, managers, waiters, kitchen and cashiers.</p>
              <span className="mt-6 inline-flex items-center gap-2 text-[14px] font-semibold">Sign in <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden /></span>
            </Link>
            <Link to="/admin/login" className="group rounded-3xl border border-line bg-surface p-8 shadow-sm transition-transform hover:-translate-y-0.5">
              <ShieldCheck className="size-7 text-brand" aria-hidden />
              <h3 className="mt-6 font-display text-[24px] font-bold text-ink">Platform console</h3>
              <p className="mt-2 max-w-sm text-[14.5px] text-muted">For the SaaS operator: tenants, status and system data.</p>
              <span className="mt-6 inline-flex items-center gap-2 text-[14px] font-semibold text-ink">Super Admin sign in <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden /></span>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 text-[13px] text-muted sm:flex-row">
          <Logo />
          <p>Frontend prototype · data stays in this browser’s storage</p>
        </div>
      </footer>
    </div>
  );
}
