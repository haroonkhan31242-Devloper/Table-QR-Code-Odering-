import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { Logo, ThemeToggle } from '@/src/components/shared/Brand';
import { DEMO_FOOD_ASSETS } from '@/src/services/mock-data/demoAssets';

export function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
  aside,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  aside: { quote: string; points: Array<{ icon: LucideIcon; text: string }> };
}) {
  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden lg:block">
        <img src={DEMO_FOOD_ASSETS.heroFeast} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/55 to-[#3a1407]/70" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Link to="/" className="inline-flex w-fit items-center gap-2.5 rounded-xl bg-white/10 px-3 py-2 backdrop-blur-md transition-colors hover:bg-white/15">
            <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
              <rect width="32" height="32" rx="9" fill="#ff6a3d" />
              <path d="M9 11.5h14M16 11.5V24" stroke="#1c0a03" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
            <span className="font-display text-[16px] font-bold">TableCraft</span>
          </Link>
          <div className="max-w-md">
            <p className="font-display text-[34px] font-bold leading-[1.1] tracking-tight text-balance">{aside.quote}</p>
            <ul className="mt-8 flex flex-col gap-3.5">
              {aside.points.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-[14.5px] text-white/85">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-white/12 backdrop-blur">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[12px] text-white/55">Demo environment · data is stored only in this browser</p>
        </div>
      </section>

      <section className="flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 sm:px-8">
          <Link to="/" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden /> Home
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-12 sm:px-8">
          <div className="w-full max-w-[400px]">
            <Logo className="mb-10 lg:hidden" />
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-strong">{eyebrow}</p>
            <h1 className="mt-2 text-[30px] font-bold leading-tight text-ink">{title}</h1>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function DemoNotice({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[12.5px] leading-relaxed text-muted">{children}</div>;
}
