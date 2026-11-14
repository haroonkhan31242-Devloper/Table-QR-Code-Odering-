/**
 * Centralised authorisation. Every restaurant-scoped service call resolves the
 * acting user from the session (never from UI-supplied ids) and checks the
 * required permission here — hiding a button is never the only guard.
 *
 * In production this logic must live on the server (PRD §8.2).
 */
import type { Permission } from '@/src/constants/permissions';
import type { Database, Restaurant, StaffMember } from '@/src/types/domain';
import { readDb } from '@/src/services/storage/database';
import { fail } from '@/src/services/storage/errors';
import type { BusinessScope } from '@/src/services/storage/collection';
import type { Actor } from '@/src/services/audit/activityService';
import { readSession } from '@/src/services/authentication/sessionStore';
import { ROLE_LABELS } from '@/src/constants/permissions';

export interface StaffContext {
  user: StaffMember;
  restaurant: Restaurant;
  scope: BusinessScope;
  actor: Actor;
}

export function can(user: Pick<StaffMember, 'role' | 'permissions' | 'isActive'> | null | undefined, permission: Permission): boolean {
  if (!user || !user.isActive) return false;
  if (user.role === 'owner') {
    // PRD §5.3: approval is performed by an authorised waiter, never assumed for owners.
    return permission !== 'orders.approve';
  }
  return user.permissions.includes(permission);
}

export function canAny(user: Pick<StaffMember, 'role' | 'permissions' | 'isActive'> | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((p) => can(user, p));
}

/** Resolve the signed-in staff member against a db snapshot. */
export function resolveStaffContext(db: Database): StaffContext | null {
  const session = readSession();
  if (!session || session.kind !== 'staff') return null;
  const user = db.staff.find((s) => s.id === session.userId);
  if (!user || !user.isActive) return null;
  const restaurant = db.restaurants.find((r) => r.id === user.restaurantId && r.businessId === user.businessId);
  if (!restaurant || restaurant.status !== 'active') return null;
  return {
    user,
    restaurant,
    scope: { businessId: restaurant.businessId, restaurantId: restaurant.id },
    actor: { id: user.id, name: user.name, role: ROLE_LABELS[user.role] },
  };
}

/**
 * Guard for service mutations. Pass the draft db from `mutateDb` so the check
 * and the write happen against the same data.
 */
export function requireStaff(db: Database, ...permissions: Permission[]): StaffContext {
  const ctx = resolveStaffContext(db);
  if (!ctx) throw fail.auth('Your session has ended or your account is inactive. Please sign in again.');
  for (const p of permissions) {
    if (!can(ctx.user, p)) throw fail.permission();
  }
  return ctx;
}

export function requireSuperAdmin(): Actor {
  const session = readSession();
  if (!session || session.kind !== 'super_admin') throw fail.auth('Super Admin sign-in required.');
  return { id: session.userId, name: 'Platform Administrator', role: 'Super Admin' };
}

export function currentStaffContext(): StaffContext | null {
  return resolveStaffContext(readDb());
}
