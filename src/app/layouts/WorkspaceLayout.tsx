import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChevronDown, LogOut, Menu as MenuIcon, type LucideIcon } from 'lucide-react';
import { Drawer } from '@/src/components/ui/Overlay';
import { Menu } from '@/src/components/ui/Menu';
import { Avatar } from '@/src/components/ui/Display';
import { Logo, ThemeToggle } from '@/src/components/shared/Brand';
import { cn } from '@/src/utils/format';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  badgeTone?: 'brand' | 'warning';
  end?: boolean;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

interface Props {
  sections: NavSection[];
  workspaceLabel: string;
  workspaceName: string;
  workspaceMeta?: React.ReactNode;
  workspaceBadge?: React.ReactNode;
  user: { name: string; subtitle: string };
  userMenuItems?: Array<{ label: string; icon: LucideIcon; onSelect: () => void }>;
  onLogout: () => void;
  banner?: React.ReactNode;
}

function NavList({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-5">
      {sections.map((section, i) => (
        <div key={section.label ?? i}>
          {section.label && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted/80">{section.label}</p>}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors',
                      isActive ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:bg-surface-2 hover:text-ink'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute -left-3 top-2 bottom-2 w-1 rounded-r-full bg-brand" aria-hidden />}
                      <item.icon className={cn('size-[18px] shrink-0', isActive ? 'text-brand-strong' : '')} aria-hidden />
                      <span className="flex-1 truncate">{item.label}</span>
                      {!!item.badge && (
                        <span
                          className={cn(
                            'tabular min-w-6 rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold',
                            item.badgeTone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-brand text-brand-ink'
                          )}
                          aria-label={`${item.badge} pending`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function WorkspaceLayout({
  sections,
  workspaceLabel,
  workspaceName,
  workspaceMeta,
  workspaceBadge,
  user,
  userMenuItems = [],
  onLogout,
  banner,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // Move focus to main content on route change for screen-reader users.
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const workspaceCard = (
    <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted">{workspaceLabel}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-display text-[15px] font-bold text-ink">{workspaceName}</p>
        {workspaceBadge}
      </div>
      {workspaceMeta && <div className="mt-1 text-[12px] text-muted">{workspaceMeta}</div>}
    </div>
  );

  return (
    <div className="min-h-dvh bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-lg">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-line bg-bg px-4 pb-4 pt-5 lg:flex">
        <div className="px-1.5">
          <Logo />
        </div>
        <div className="mt-6">{workspaceCard}</div>
        <div className="thin-scroll -mx-1 mt-6 min-h-0 flex-1 overflow-y-auto px-4">
          <NavList sections={sections} />
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium text-muted transition-colors hover:bg-danger-soft hover:text-danger"
        >
          <LogOut className="size-[18px]" aria-hidden /> Sign out
        </button>
      </aside>

      {/* Mobile drawer */}
      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} title={null} side="left" widthClass="max-w-[300px]">
        <div className="flex h-full flex-col px-4 pb-4 pt-5">
          <Logo className="px-1.5" />
          <div className="mt-5">{workspaceCard}</div>
          <div className="mt-5 flex-1 px-3">
            <NavList sections={sections} onNavigate={() => setMobileOpen(false)} />
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="mt-3 flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-medium text-danger hover:bg-danger-soft"
          >
            <LogOut className="size-[18px]" aria-hidden /> Sign out
          </button>
        </div>
      </Drawer>

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-2 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="-ml-1.5 flex size-10 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-2 lg:hidden"
            >
              <MenuIcon className="size-5" />
            </button>
            <div className="min-w-0 flex-1 lg:hidden">
              <p className="truncate font-display text-[15px] font-bold text-ink">{workspaceName}</p>
            </div>
            <div className="hidden flex-1 lg:block" />
            <ThemeToggle />
            <Menu
              items={[
                ...userMenuItems,
                ...(userMenuItems.length ? (['separator'] as const) : []),
                { label: 'Sign out', icon: LogOut, onSelect: onLogout, tone: 'danger' as const },
              ]}
              header={
                <div>
                  <p className="text-[13.5px] font-semibold text-ink">{user.name}</p>
                  <p className="text-[12px] text-muted">{user.subtitle}</p>
                </div>
              }
              trigger={(p) => (
                <button type="button" {...p} className="flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-2 transition-colors hover:bg-surface-2" aria-label="Account menu">
                  <Avatar name={user.name} size={32} />
                  <span className="hidden text-left sm:block">
                    <span className="block max-w-[160px] truncate text-[13.5px] font-semibold leading-tight text-ink">{user.name}</span>
                    <span className="block text-[11.5px] leading-tight text-muted">{user.subtitle}</span>
                  </span>
                  <ChevronDown className="hidden size-4 text-muted sm:block" aria-hidden />
                </button>
              )}
            />
          </div>
        </header>
        {banner}
        <main id="main" tabIndex={-1} className="mx-auto max-w-[1400px] px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
