import {
  BarChart3,
  ChefHat,
  ClipboardList,
  History,
  LayoutDashboard,
  QrCode,
  Settings,
  UtensilsCrossed,
  Users,
  Store,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@/src/constants/permissions';

export interface PortalModule {
  path: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  section: 'Service' | 'Manage' | 'Insights';
}

/** Single source of truth for restaurant portal modules and their access rule. */
export const PORTAL_MODULES: PortalModule[] = [
  { path: '', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view', section: 'Service' },
  { path: 'orders', label: 'Orders', icon: ClipboardList, permission: 'orders.view', section: 'Service' },
  { path: 'kitchen', label: 'Kitchen display', icon: ChefHat, permission: 'kitchen.view', section: 'Service' },
  { path: 'tables', label: 'Tables & QR', icon: QrCode, permission: 'tables.view', section: 'Service' },
  // Replaces the old Cashier module; the Cashier *role* is unchanged and gets POS access by default.
  { path: 'pos', label: 'POS', icon: Store, permission: 'cashier.view', section: 'Service' },
  { path: 'menu', label: 'Menu', icon: UtensilsCrossed, permission: 'menu.view', section: 'Manage' },
  { path: 'staff', label: 'Staff & access', icon: Users, permission: 'staff.view', section: 'Manage' },
  { path: 'settings', label: 'Settings', icon: Settings, permission: 'settings.view', section: 'Manage' },
  { path: 'reports', label: 'Reports', icon: BarChart3, permission: 'reports.view', section: 'Insights' },
  { path: 'activity', label: 'Activity log', icon: History, permission: 'activity.view', section: 'Insights' },
];

export const portalPath = (path: string) => (path ? `/portal/${path}` : '/portal');
