/**
 * Staff accounts and delegated permissions (PRD §3.2, FR-004, FR-005).
 *
 * Delegation rules:
 *  - Owners can create any non-owner role and grant any permission.
 *  - Managers can create Waiter / Kitchen / Cashier accounts and grant only
 *    permissions they hold themselves; they cannot grant "Manage staff".
 *  - Nobody edits their own role, permissions or active status.
 *  - While waiter approval is on, at least one active authorised waiter must remain.
 */
import { normalizePermissions, PERMISSIONS, ROLE_LABELS, type Permission } from '@/src/constants/permissions';
import type { Database, StaffMember, StaffRole } from '@/src/types/domain';
import { mutateDb } from '@/src/services/storage/database';
import { fail } from '@/src/services/storage/errors';
import { getScoped, insertScoped, removeScoped, updateScoped } from '@/src/services/storage/collection';
import { can, requireStaff, type StaffContext } from '@/src/services/access/accessControl';
import { logActivity } from '@/src/services/audit/activityService';
import { createPasswordCredentials, validatePasswordStrength } from '@/src/services/authentication/authService';
import { approversFor } from '@/src/features/orders/services/orderService';
import { createId } from '@/src/utils/crypto';

export type AssignableRole = Exclude<StaffRole, 'owner'>;

export function assignableRoles(actor: StaffMember): AssignableRole[] {
  if (actor.role === 'owner') return ['manager', 'waiter', 'kitchen', 'cashier'];
  if (actor.role === 'manager' && can(actor, 'staff.manage')) return ['waiter', 'kitchen', 'cashier'];
  return [];
}

/** Permissions the actor is allowed to hand out. */
export function grantablePermissions(actor: StaffMember): Set<Permission> {
  if (actor.role === 'owner') return new Set(PERMISSIONS);
  const own = new Set<Permission>(actor.permissions);
  own.delete('staff.manage');
  // PRD §5.3: an authorised manager grants the approval permission to waiters
  // without being able to approve orders themselves.
  if (can(actor, 'staff.manage') && can(actor, 'settings.edit')) own.add('orders.approve');
  return own;
}

export function canManageMember(actor: StaffMember, target: StaffMember): boolean {
  if (actor.id === target.id || target.role === 'owner') return false;
  return assignableRoles(actor).includes(target.role as AssignableRole);
}

function scopedPermissions(ctx: StaffContext, role: AssignableRole, requested: Permission[]): Permission[] {
  const allowed = grantablePermissions(ctx.user);
  const denied = requested.filter((p) => !allowed.has(p));
  if (denied.length) throw fail.permission('You can only grant permissions that are within your own authority.');
  // Prerequisites added by normalisation must also be within authority.
  const normalized = normalizePermissions(role, requested);
  if (normalized.some((p) => !allowed.has(p))) {
    throw fail.permission('Some required base permissions are outside your authority.');
  }
  return normalized;
}

function assertUniqueLogin(db: Database, username: string, email: string, exceptId?: string) {
  const u = username.toLowerCase();
  const e = email.toLowerCase();
  if (db.staff.some((s) => s.id !== exceptId && (s.username.toLowerCase() === u || (e && s.email.toLowerCase() === e)))) {
    throw fail.validation('That username or email is already used by another account.');
  }
}

function assertApproverRemains(db: Database, ctx: StaffContext, after: Database['staff']) {
  if (!ctx.restaurant.settings.requireWaiterApproval) return;
  const restaurant = ctx.restaurant;
  const remaining = after.filter(
    (s) => s.restaurantId === restaurant.id && s.isActive && s.role === 'waiter' && s.permissions.includes('orders.approve')
  );
  if (!remaining.length) {
    throw fail.validation('Waiter approval is switched on. Keep at least one active waiter with “Approve orders”, or turn approval off in Settings first.');
  }
  void db;
}

export interface StaffInput {
  name: string;
  username: string;
  email: string;
  phone: string;
  role: AssignableRole;
  isActive: boolean;
  permissions: Permission[];
}

function validate(input: StaffInput) {
  if (input.name.trim().length < 2) throw fail.validation('Enter the staff member’s full name.');
  if (!/^[a-z0-9._-]{3,32}$/.test(input.username.trim().toLowerCase())) {
    throw fail.validation('Username must be 3–32 characters: letters, numbers, dots, dashes or underscores.');
  }
  if (input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) throw fail.validation('Enter a valid email address.');
}

export function createStaff(input: StaffInput, password: string): StaffMember {
  validate(input);
  const weak = validatePasswordStrength(password);
  if (weak) throw fail.validation(weak);
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'staff.manage');
    if (!assignableRoles(ctx.user).includes(input.role)) throw fail.permission(`You cannot create ${ROLE_LABELS[input.role]} accounts.`);
    assertUniqueLogin(db, input.username.trim(), input.email.trim());
    const now = new Date().toISOString();
    const member = insertScoped(db, 'staff', ctx.scope, {
      id: createId('staff'),
      ...ctx.scope,
      name: input.name.trim(),
      username: input.username.trim().toLowerCase(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      role: input.role,
      isActive: input.isActive,
      ...createPasswordCredentials(password),
      permissions: scopedPermissions(ctx, input.role, input.permissions),
      createdAt: now,
      updatedAt: now,
    });
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'staff',
      action: 'Staff account created',
      targetId: member.id,
      targetLabel: member.name,
      details: `Created ${ROLE_LABELS[member.role]} account “${member.username}” with ${member.permissions.length} permissions.`,
    });
    return member;
  });
}

export function updateStaff(id: string, input: StaffInput): StaffMember {
  validate(input);
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'staff.manage');
    const prev = getScoped(db, 'staff', ctx.scope, id, 'Staff member');
    if (!canManageMember(ctx.user, prev)) throw fail.permission('You cannot edit this account.');
    if (!assignableRoles(ctx.user).includes(input.role)) throw fail.permission(`You cannot assign the ${ROLE_LABELS[input.role]} role.`);
    assertUniqueLogin(db, input.username.trim(), input.email.trim(), id);
    const permissions = scopedPermissions(ctx, input.role, input.permissions);
    const next = updateScoped(db, 'staff', ctx.scope, id, {
      name: input.name.trim(),
      username: input.username.trim().toLowerCase(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      role: input.role,
      isActive: input.isActive,
      permissions,
      updatedAt: new Date().toISOString(),
    }, 'Staff member');
    assertApproverRemains(db, ctx, db.staff);

    const added = permissions.filter((p) => !prev.permissions.includes(p));
    const removed = prev.permissions.filter((p) => !permissions.includes(p));
    const parts: string[] = [];
    if (prev.role !== next.role) parts.push(`role ${ROLE_LABELS[prev.role]} → ${ROLE_LABELS[next.role]}`);
    if (prev.isActive !== next.isActive) parts.push(next.isActive ? 'reactivated' : 'deactivated');
    if (added.length) parts.push(`granted ${added.join(', ')}`);
    if (removed.length) parts.push(`revoked ${removed.join(', ')}`);
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'staff',
      action: added.length || removed.length ? 'Permissions changed' : 'Staff account updated',
      targetId: id,
      targetLabel: next.name,
      details: parts.length ? `${next.name}: ${parts.join('; ')}.` : `Updated profile for ${next.name}.`,
    });
    return next;
  });
}

export function resetStaffPassword(id: string, password: string): void {
  const weak = validatePasswordStrength(password);
  if (weak) throw fail.validation(weak);
  mutateDb((db) => {
    const ctx = requireStaff(db, 'staff.manage');
    const member = getScoped(db, 'staff', ctx.scope, id, 'Staff member');
    if (!canManageMember(ctx.user, member)) throw fail.permission('You cannot reset this password.');
    updateScoped(db, 'staff', ctx.scope, id, { ...createPasswordCredentials(password), updatedAt: new Date().toISOString() }, 'Staff member');
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'staff',
      action: 'Password reset',
      targetId: id,
      targetLabel: member.name,
      details: `Set a new password for ${member.name}.`,
    });
  });
}

export function deleteStaff(id: string): void {
  mutateDb((db) => {
    const ctx = requireStaff(db, 'staff.manage');
    const member = getScoped(db, 'staff', ctx.scope, id, 'Staff member');
    if (!canManageMember(ctx.user, member)) throw fail.permission('You cannot remove this account.');
    removeScoped(db, 'staff', ctx.scope, id, 'Staff member');
    assertApproverRemains(db, ctx, db.staff);
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'staff',
      action: 'Staff account removed',
      targetId: id,
      targetLabel: member.name,
      details: `Removed ${ROLE_LABELS[member.role]} account “${member.username}”. Past activity is kept.`,
    });
  });
}

export function approverCount(db: Database, ctx: StaffContext): number {
  return approversFor(db, ctx.restaurant).length;
}
