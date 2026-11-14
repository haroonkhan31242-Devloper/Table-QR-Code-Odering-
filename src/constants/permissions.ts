/**
 * Centralised permission catalogue (PRD §3.2–3.3).
 * Permissions are action-level; module visibility is derived from them.
 */
export const PERMISSIONS = [
  'dashboard.view',
  'orders.view',
  'orders.approve',
  'orders.serve',
  'kitchen.view',
  'kitchen.decide',
  'kitchen.status',
  'tables.view',
  'tables.manage',
  'tables.status',
  'qr.manage',
  'menu.view',
  'menu.categories',
  'menu.products',
  'menu.availability',
  'cashier.view',
  'cashier.collect',
  'cashier.reprint',
  'reports.view',
  'activity.view',
  'staff.view',
  'staff.manage',
  'settings.view',
  'settings.edit',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

type StaffRoleKey = 'owner' | 'manager' | 'waiter' | 'kitchen' | 'cashier';

export interface PermissionDefinition {
  key: Permission;
  label: string;
  description: string;
  /** If set, only these roles may hold the permission. */
  roles?: StaffRoleKey[];
  /** Permissions that must also be held for this one to be meaningful. */
  requires?: Permission[];
}

export interface PermissionGroup {
  id: string;
  label: string;
  permissions: PermissionDefinition[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    permissions: [
      { key: 'dashboard.view', label: 'View dashboard', description: 'Today’s sales, orders and table overview.' },
    ],
  },
  {
    id: 'orders',
    label: 'Orders',
    permissions: [
      { key: 'orders.view', label: 'View orders', description: 'See the live order board and order history.' },
      {
        key: 'orders.approve',
        label: 'Approve / reject orders',
        description: 'Review QR orders before they reach the kitchen (waiters only).',
        roles: ['waiter'],
        requires: ['orders.view'],
      },
      {
        key: 'orders.serve',
        label: 'Mark orders served',
        description: 'Confirm completed orders were delivered to the table.',
        requires: ['orders.view'],
      },
    ],
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    permissions: [
      { key: 'kitchen.view', label: 'View kitchen display', description: 'See the kitchen queue.' },
      {
        key: 'kitchen.decide',
        label: 'Accept / reject in kitchen',
        description: 'Accept new tickets or reject them with a reason.',
        requires: ['kitchen.view'],
      },
      {
        key: 'kitchen.status',
        label: 'Update preparation status',
        description: 'Move tickets through Preparing, Ready and Completed.',
        requires: ['kitchen.view'],
      },
    ],
  },
  {
    id: 'tables',
    label: 'Tables & QR',
    permissions: [
      { key: 'tables.view', label: 'View tables', description: 'See the floor and table status.' },
      { key: 'tables.manage', label: 'Manage tables', description: 'Create, edit and delete tables.', requires: ['tables.view'] },
      { key: 'tables.status', label: 'Update table status', description: 'Move tables through Available → Occupied → Cleaning.', requires: ['tables.view'] },
      { key: 'qr.manage', label: 'Manage QR codes', description: 'Regenerate, revoke, download and print table QR codes.', requires: ['tables.view'] },
    ],
  },
  {
    id: 'menu',
    label: 'Menu',
    permissions: [
      { key: 'menu.view', label: 'View menu', description: 'Browse categories and products.' },
      { key: 'menu.categories', label: 'Manage categories', description: 'Create, edit and delete categories.', requires: ['menu.view'] },
      { key: 'menu.products', label: 'Manage products', description: 'Create, edit, price and delete products and images.', requires: ['menu.view'] },
      { key: 'menu.availability', label: 'Toggle availability', description: 'Mark products sold out or available.', requires: ['menu.view'] },
    ],
  },
  {
    id: 'cashier',
    label: 'Cashier & billing',
    permissions: [
      { key: 'cashier.view', label: 'View bills', description: 'Open individual and combined table bills.' },
      { key: 'cashier.collect', label: 'Collect cash', description: 'Record Cash at Counter payments.', requires: ['cashier.view'] },
      { key: 'cashier.reprint', label: 'Reprint receipts', description: 'Reprint receipts (logged).', requires: ['cashier.view'] },
    ],
  },
  {
    id: 'insights',
    label: 'Reports & activity',
    permissions: [
      { key: 'reports.view', label: 'View reports', description: 'Sales, product, table and staff reports.' },
      { key: 'activity.view', label: 'View activity log', description: 'Audit trail of important actions.' },
    ],
  },
  {
    id: 'admin',
    label: 'Staff & settings',
    permissions: [
      { key: 'staff.view', label: 'View staff', description: 'See staff accounts and their access.' },
      {
        key: 'staff.manage',
        label: 'Manage staff & permissions',
        description: 'Create staff and assign permissions within your own authority.',
        roles: ['owner', 'manager'],
        requires: ['staff.view'],
      },
      { key: 'settings.view', label: 'View settings', description: 'See restaurant profile and ordering settings.' },
      { key: 'settings.edit', label: 'Edit settings', description: 'Change profile, approval workflow and service charge.', requires: ['settings.view'] },
    ],
  },
];

export const PERMISSION_INDEX: Record<Permission, PermissionDefinition> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.permissions).map((p) => [p.key, p])
) as Record<Permission, PermissionDefinition>;

export const ROLE_LABELS: Record<StaffRoleKey, string> = {
  owner: 'Owner / Admin',
  manager: 'Manager',
  waiter: 'Waiter',
  kitchen: 'Kitchen',
  cashier: 'Cashier',
};

export const ROLE_DESCRIPTIONS: Record<StaffRoleKey, string> = {
  owner: 'Full control of this restaurant.',
  manager: 'Runs daily operations with delegated authority.',
  waiter: 'Table service; can approve orders if explicitly authorised.',
  kitchen: 'Prepares orders on the kitchen display.',
  cashier: 'Handles bills and Cash at Counter payments.',
};

export const ROLE_DEFAULT_PERMISSIONS: Record<StaffRoleKey, Permission[]> = {
  owner: [...PERMISSIONS],
  manager: [
    'dashboard.view',
    'orders.view',
    'orders.serve',
    'kitchen.view',
    'tables.view',
    'tables.manage',
    'tables.status',
    'qr.manage',
    'menu.view',
    'menu.categories',
    'menu.products',
    'menu.availability',
    'cashier.view',
    'cashier.collect',
    'cashier.reprint',
    'reports.view',
    'activity.view',
    'staff.view',
    'staff.manage',
    'settings.view',
    'settings.edit',
  ],
  waiter: ['orders.view', 'orders.serve', 'tables.view', 'tables.status', 'menu.view'],
  kitchen: ['kitchen.view', 'kitchen.decide', 'kitchen.status', 'menu.view', 'menu.availability'],
  cashier: ['orders.view', 'tables.view', 'cashier.view', 'cashier.collect', 'cashier.reprint'],
};

/** Normalise a permission list for a role: drop unknown / role-restricted keys and add prerequisites. */
export function normalizePermissions(role: StaffRoleKey, input: readonly string[]): Permission[] {
  const set = new Set<Permission>();
  // Owners hold everything except role-restricted permissions (e.g. waiter-only approval).
  if (role === 'owner') return PERMISSIONS.filter((p) => !PERMISSION_INDEX[p].roles || PERMISSION_INDEX[p].roles!.includes('owner'));
  for (const key of input) {
    const def = PERMISSION_INDEX[key as Permission];
    if (!def) continue;
    if (def.roles && !def.roles.includes(role)) continue;
    set.add(def.key);
    def.requires?.forEach((r) => set.add(r));
  }
  return PERMISSIONS.filter((p) => set.has(p));
}
