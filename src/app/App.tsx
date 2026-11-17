import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { ThemeProvider } from './providers/ThemeProvider';
import { ToastProvider, useToast } from '@/src/components/feedback/Toast';
import { ErrorBoundary, NotFoundPage, RouteFallback } from '@/src/components/feedback/States';
import { PortalHome, PortalShell, RequirePermission } from './layouts/PortalShell';
import { AdminShell } from './layouts/AdminShell';
import { consumeInitNotice, readDb } from '@/src/services/storage/database';

const LandingPage = lazy(() => import('@/src/features/landing/LandingPage'));
const SuperAdminLoginPage = lazy(() => import('@/src/features/authentication/SuperAdminLoginPage'));
const RestaurantLoginPage = lazy(() => import('@/src/features/authentication/RestaurantLoginPage'));
const AdminOverviewPage = lazy(() => import('@/src/features/super-admin/pages/AdminOverviewPage'));
const RestaurantsPage = lazy(() => import('@/src/features/super-admin/pages/RestaurantsPage'));
const PlatformActivityPage = lazy(() => import('@/src/features/super-admin/pages/PlatformActivityPage'));
const SystemPage = lazy(() => import('@/src/features/super-admin/pages/SystemPage'));
const DashboardPage = lazy(() => import('@/src/features/dashboard/DashboardPage'));
const OrdersPage = lazy(() => import('@/src/features/orders/OrdersPage'));
const KitchenPage = lazy(() => import('@/src/features/kitchen/KitchenPage'));
const TablesPage = lazy(() => import('@/src/features/tables/TablesPage'));
const PosPage = lazy(() => import('@/src/features/pos/PosPage'));
const MenuPage = lazy(() => import('@/src/features/menu/MenuPage'));
const StaffPage = lazy(() => import('@/src/features/staff/StaffPage'));
const SettingsPage = lazy(() => import('@/src/features/settings/SettingsPage'));
const AccountPage = lazy(() => import('@/src/features/settings/AccountPage'));
const ReportsPage = lazy(() => import('@/src/features/reports/ReportsPage'));
const ActivityPage = lazy(() => import('@/src/features/reports/ActivityPage'));
const NoAccessPage = lazy(() => import('@/src/features/authentication/NoAccessPage'));
const CustomerMenuPage = lazy(() => import('@/src/features/customer-menu/CustomerMenuPage'));

function StartupNotice() {
  const toast = useToast();
  useEffect(() => {
    try {
      readDb();
    } catch (err) {
      toast.fromError(err, 'Storage unavailable');
      return;
    }
    const notice = consumeInitNotice();
    if (notice) toast.info('Data restored', notice);
  }, [toast]);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <MotionConfig reducedMotion="user">
          <ToastProvider>
            <StartupNotice />
            <BrowserRouter>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<LandingPage />} />

                  {/* Customer QR ordering — no login */}
                  <Route path="/menu/:slug/:token" element={<CustomerMenuPage />} />

                  {/* Login portals: exactly two */}
                  <Route path="/admin/login" element={<SuperAdminLoginPage />} />
                  <Route path="/portal/login" element={<RestaurantLoginPage />} />

                  <Route path="/admin" element={<AdminShell />}>
                    <Route index element={<AdminOverviewPage />} />
                    <Route path="restaurants" element={<RestaurantsPage />} />
                    <Route path="activity" element={<PlatformActivityPage />} />
                    <Route path="settings" element={<SystemPage />} />
                  </Route>

                  <Route path="/portal" element={<PortalShell />}>
                    <Route index element={<PortalHome dashboard={<DashboardPage />} />} />
                    <Route path="orders" element={<RequirePermission permission="orders.view"><OrdersPage /></RequirePermission>} />
                    <Route path="kitchen" element={<RequirePermission permission="kitchen.view"><KitchenPage /></RequirePermission>} />
                    <Route path="tables" element={<RequirePermission permission="tables.view"><TablesPage /></RequirePermission>} />
                    <Route path="pos" element={<RequirePermission permission="cashier.view"><PosPage /></RequirePermission>} />
                    {/* Old Cashier module links keep working. */}
                    <Route path="cashier" element={<Navigate to="/portal/pos" replace />} />
                    <Route path="menu" element={<RequirePermission permission="menu.view"><MenuPage /></RequirePermission>} />
                    <Route path="staff" element={<RequirePermission permission="staff.view"><StaffPage /></RequirePermission>} />
                    <Route path="settings" element={<RequirePermission permission="settings.view"><SettingsPage /></RequirePermission>} />
                    <Route path="reports" element={<RequirePermission permission="reports.view"><ReportsPage /></RequirePermission>} />
                    <Route path="activity" element={<RequirePermission permission="activity.view"><ActivityPage /></RequirePermission>} />
                    <Route path="account" element={<AccountPage />} />
                    <Route path="no-access" element={<NoAccessPage />} />
                    <Route path="*" element={<Navigate to="/portal" replace />} />
                  </Route>

                  {/* Legacy routes from the previous build */}
                  <Route path="/super-admin/login" element={<Navigate to="/admin/login" replace />} />
                  <Route path="/super-admin" element={<Navigate to="/admin" replace />} />
                  <Route path="/restaurant/login" element={<Navigate to="/portal/login" replace />} />
                  <Route path="/restaurant" element={<Navigate to="/portal" replace />} />

                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ToastProvider>
        </MotionConfig>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
