/**
 * Platform administration: restaurant tenants (PRD §4.1, FR-001).
 * Super Admin manages tenants but does not operate restaurant data.
 */
import { ROLE_DEFAULT_PERMISSIONS, normalizePermissions } from '@/src/constants/permissions';
import type { Database, Restaurant, RestaurantStatus } from '@/src/types/domain';
import { mutateDb, resetDatabase } from '@/src/services/storage/database';
import { fail } from '@/src/services/storage/errors';
import { requireSuperAdmin } from '@/src/services/access/accessControl';
import { logActivity, PLATFORM_SCOPE } from '@/src/services/audit/activityService';
import { createPasswordCredentials, validatePasswordStrength } from '@/src/services/authentication/authService';
import { issueQrToken } from '@/src/services/qr/qrService';
import { collectOrphanImages } from '@/src/services/images/imageStorage';
import { createId, randomToken } from '@/src/utils/crypto';
import { slugify } from '@/src/utils/format';

export interface TenantInput {
  name: string;
  cuisine: string;
  city: string;
  address: string;
  phone: string;
  description: string;
  accentColor: string;
  planLabel: string;
  creditBalance: number;
  dueDate: string;
}

export interface OwnerInput {
  name: string;
  username: string;
  email: string;
  password: string;
}

function validateTenant(input: TenantInput) {
  if (input.name.trim().length < 2) throw fail.validation('Restaurant name is required.');
  if (!input.city.trim()) throw fail.validation('City is required.');
  if (!/^#[0-9a-fA-F]{6}$/.test(input.accentColor)) throw fail.validation('Choose a valid brand colour.');
  if (!Number.isFinite(Number(input.creditBalance)) || Number(input.creditBalance) < 0) throw fail.validation('Credit balance cannot be negative.');
}

function uniqueSlug(db: Database, name: string, exceptId?: string): string {
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (db.restaurants.some((r) => r.slug === slug && r.id !== exceptId)) slug = `${base}-${n++}`;
  return slug;
}

export function createRestaurant(input: TenantInput, owner: OwnerInput, tableCount: number): Restaurant {
  validateTenant(input);
  if (owner.name.trim().length < 2) throw fail.validation('Owner name is required.');
  const username = owner.username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw fail.validation('Owner username must be 3–32 characters (letters, numbers, . _ -).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner.email.trim())) throw fail.validation('Enter a valid owner email.');
  const weak = validatePasswordStrength(owner.password);
  if (weak) throw fail.validation(weak);
  const tables = Math.round(Number(tableCount));
  if (!Number.isInteger(tables) || tables < 0 || tables > 60) throw fail.validation('Starter tables must be between 0 and 60.');

  return mutateDb((db) => {
    const actor = requireSuperAdmin();
    const email = owner.email.trim().toLowerCase();
    if (db.staff.some((s) => s.username.toLowerCase() === username || s.email.toLowerCase() === email)) {
      throw fail.validation('That owner username or email is already in use.');
    }
    const now = new Date().toISOString();
    const businessId = `biz_${randomToken().slice(0, 12)}`;
    const restaurant: Restaurant = {
      id: `rest_${randomToken().slice(0, 12)}`,
      businessId,
      slug: uniqueSlug(db, input.name),
      name: input.name.trim(),
      tagline: '',
      description: input.description.trim(),
      cuisine: input.cuisine.trim(),
      ownerName: owner.name.trim(),
      ownerEmail: email,
      phone: input.phone.trim(),
      address: input.address.trim(),
      city: input.city.trim(),
      logoImage: '',
      coverImage: '',
      accentColor: input.accentColor,
      status: 'active',
      commercial: { planLabel: input.planLabel.trim() || 'One-time licence', creditBalance: Math.round(Number(input.creditBalance)), dueDate: input.dueDate },
      settings: { requireWaiterApproval: false, serviceChargePercent: 0, showSoldOutItems: true, currency: 'PKR', receiptFooter: 'Thank you for dining with us!' },
      createdAt: now,
      updatedAt: now,
    };
    db.restaurants.push(restaurant);
    const scope = { businessId, restaurantId: restaurant.id };
    db.staff.push({
      id: createId('staff'),
      ...scope,
      name: owner.name.trim(),
      username,
      email,
      phone: '',
      role: 'owner',
      isActive: true,
      ...createPasswordCredentials(owner.password),
      permissions: normalizePermissions('owner', ROLE_DEFAULT_PERMISSIONS.owner),
      createdAt: now,
      updatedAt: now,
    });
    for (let i = 1; i <= tables; i++) {
      const number = String(i).padStart(2, '0');
      const table = {
        id: createId('tbl'),
        ...scope,
        number,
        label: `Table ${number}`,
        area: 'Main floor',
        capacity: 4,
        status: 'available' as const,
        statusChangedAt: now,
        qrToken: '',
        qrVersion: 1,
        createdAt: now,
        updatedAt: now,
      };
      table.qrToken = issueQrToken(db, table).token;
      db.tables.push(table);
    }
    logActivity(db, PLATFORM_SCOPE, actor, {
      category: 'tenant',
      action: 'Restaurant created',
      targetId: restaurant.id,
      targetLabel: restaurant.name,
      details: `Provisioned ${restaurant.name} with owner “${username}” and ${tables} table${tables === 1 ? '' : 's'}.`,
    });
    return restaurant;
  });
}

export function updateRestaurant(id: string, input: TenantInput): Restaurant {
  validateTenant(input);
  return mutateDb((db) => {
    const actor = requireSuperAdmin();
    const r = db.restaurants.find((x) => x.id === id);
    if (!r) throw fail.notFound('Restaurant');
    Object.assign(r, {
      name: input.name.trim(),
      cuisine: input.cuisine.trim(),
      city: input.city.trim(),
      address: input.address.trim(),
      phone: input.phone.trim(),
      description: input.description.trim(),
      accentColor: input.accentColor,
      commercial: { planLabel: input.planLabel.trim(), creditBalance: Math.round(Number(input.creditBalance)), dueDate: input.dueDate },
      updatedAt: new Date().toISOString(),
    });
    logActivity(db, PLATFORM_SCOPE, actor, {
      category: 'tenant',
      action: 'Restaurant updated',
      targetId: r.id,
      targetLabel: r.name,
      details: `Updated platform record for ${r.name}.`,
    });
    return r;
  });
}

export function setRestaurantStatus(id: string, status: RestaurantStatus): Restaurant {
  return mutateDb((db) => {
    const actor = requireSuperAdmin();
    const r = db.restaurants.find((x) => x.id === id);
    if (!r) throw fail.notFound('Restaurant');
    if (r.status === status) return r;
    r.status = status;
    r.updatedAt = new Date().toISOString();
    logActivity(db, PLATFORM_SCOPE, actor, {
      category: 'tenant',
      action: status === 'active' ? 'Restaurant activated' : 'Restaurant suspended',
      targetId: r.id,
      targetLabel: r.name,
      details: status === 'active' ? `${r.name} can sign in and accept QR orders again.` : `${r.name} staff sign-in and QR ordering are blocked.`,
    });
    return r;
  });
}

export function resetDemoData(): void {
  requireSuperAdmin();
  const fresh = resetDatabase();
  collectOrphanImages(fresh);
}
