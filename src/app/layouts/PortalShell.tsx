import React, { createContext, useContext, useMemo } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, UserRound } from 'lucide-react';
import { WorkspaceLayout, type NavSection } from './WorkspaceLayout';
import { PORTAL_MODULES, portalPath } from '@/src/app/routes/portalNav';
import { useDatabase, useStaffContext } from '@/src/hooks/useData';
import { can, type StaffContext } from '@/src/services/access/accessControl';
import { logout } from '@/src/services/authentication/authService';
import { ROLE_LABELS, type Permission } from '@/src/constants/permissions';
import { approversFor } from '@/src/features/orders/services/orderService';
import { liveOrderCounts } from '@/src/features/reports/services/analytics';
import { Badge } from '@/src/components/ui/Display';

const PortalContext = createContext<StaffContext | null>(null);

/** Signed-in restaurant context. Only usable inside the portal shell. */
export function usePortal(): StaffContext {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used inside PortalShell');
  return ctx;
}

export function PortalShell() {
  const ctx = useStaffContext();
  const db = useDatabase();
  const navigate = useNavigate();
  const location = useLocation();

  const counts = useMemo(() => {
    if (!ctx) return null;
    return liveOrderCounts(db.orders.filter((o) => o.restaurantId === ctx.restaurant.id && o.businessId === ctx.restaurant.businessId));
  }, [db, ctx]);

  const approvalMisconfigured = useMemo(
    () => Boolean(ctx && ctx.restaurant.settings.requireWaiterApproval && approversFor(db, ctx.restaurant).length === 0),
    [db, ctx]
  );

  if (!ctx) return <Navigate to="/portal/login" replace state={{ from: location.pathname }} />;

  const badgeFor = (path: string): { badge?: number; badgeTone?: 'brand' | 'warning' } => {
    if (!counts) return {};
    if (path === 'orders') return { badge: counts.pendingApproval || counts.toServe, badgeTone: counts.pendingApproval ? 'warning' : 'brand' };
    if (path === 'kitchen') return { badge: counts.kitchenNew };
    if (path === 'cashier') return { badge: counts.unpaid };
    return {};
  };

  const sections: NavSection[] = (['Service', 'Manage', 'Insights'] as const)
    .map((label) => ({
      label,
      items: PORTAL_MODULES.filter((m) => m.section === label && can(ctx.user, m.permission)).map((m) => ({
        to: portalPath(m.path),
        label: m.label,
        icon: m.icon,
        end: m.path === '',
        ...badgeFor(m.path),
      })),
    }))
    .filter((s) => s.items.length);

  const onLogout = () => {
    logout();
    navigate('/portal/login', { replace: true });
  };

  return (
    <PortalContext.Provider value={ctx}>
      <WorkspaceLayout
        sections={sections}
        workspaceLabel="Restaurant"
        workspaceName={ctx.restaurant.name}
        workspaceMeta={`${ctx.restaurant.cuisine || 'Restaurant'} · ${ctx.restaurant.city}`}
        user={{ name: ctx.user.name, subtitle: ROLE_LABELS[ctx.user.role] }}
        userMenuItems={[{ label: 'My account', icon: UserRound, onSelect: () => navigate('/portal/account') }]}
        onLogout={onLogout}
        banner={
          approvalMisconfigured ? (
            <div role="alert" className="border-b border-warning/30 bg-warning-soft">
              <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px] text-warning sm:px-6 lg:px-8">
                <AlertTriangle className="size-4 shrink-0" aria-hidden />
                <span className="font-semibold">Approval configuration incomplete.</span>
                <span className="text-ink-2">Waiter approval is on but no active waiter can approve. New orders will wait in the approval queue.</span>
                {can(ctx.user, 'staff.manage') && (
                  <Link to="/portal/staff" className="font-semibold underline underline-offset-2">
                    Assign an approver
                  </Link>
                )}
              </div>
            </div>
          ) : null
        }
        workspaceBadge={ctx.user.role === 'owner' ? <Badge tone="brand">Owner</Badge> : undefined}
      />
    </PortalContext.Provider>
  );
}

/** Route-level permission guard. Services enforce the same rule again. */
export function RequirePermission({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const ctx = usePortal();
  if (!can(ctx.user, permission)) return <Navigate to="/portal/no-access" replace />;
  return <>{children}</>;
}

/** Index route: send users to the first module they can open. */
export function PortalHome({ dashboard }: { dashboard: React.ReactNode }) {
  const ctx = usePortal();
  if (can(ctx.user, 'dashboard.view')) return <>{dashboard}</>;
  const first = PORTAL_MODULES.find((m) => m.path && can(ctx.user, m.permission));
  return <Navigate to={first ? portalPath(first.path) : '/portal/account'} replace />;
}
