import type { Restaurant } from '@/src/types/domain';
import { mutateDb } from '@/src/services/storage/database';
import { fail } from '@/src/services/storage/errors';
import { updateScoped } from '@/src/services/storage/collection';
import { requireStaff } from '@/src/services/access/accessControl';
import { logActivity } from '@/src/services/audit/activityService';
import { deleteImage } from '@/src/services/images/imageStorage';
import { approversFor } from '@/src/features/orders/services/orderService';
import {
  createPasswordCredentials,
  validatePasswordStrength,
  verifyPassword,
} from '@/src/services/authentication/authService';

export interface ProfileInput {
  name: string;
  tagline: string;
  description: string;
  cuisine: string;
  phone: string;
  address: string;
  city: string;
  logoImage: string;
  coverImage: string;
  accentColor: string;
}

export function updateRestaurantProfile(input: ProfileInput): Restaurant {
  if (input.name.trim().length < 2) throw fail.validation('Restaurant name is required.');
  if (!/^#[0-9a-fA-F]{6}$/.test(input.accentColor)) throw fail.validation('Choose a valid accent colour.');
  const replaced: string[] = [];
  const result = mutateDb((db) => {
    const ctx = requireStaff(db, 'settings.edit');
    const prev = ctx.restaurant;
    if (prev.logoImage !== input.logoImage) replaced.push(prev.logoImage);
    if (prev.coverImage !== input.coverImage) replaced.push(prev.coverImage);
    const r = db.restaurants.find((x) => x.id === prev.id)!;
    Object.assign(r, {
      name: input.name.trim(),
      tagline: input.tagline.trim(),
      description: input.description.trim(),
      cuisine: input.cuisine.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      city: input.city.trim(),
      logoImage: input.logoImage,
      coverImage: input.coverImage,
      accentColor: input.accentColor,
      updatedAt: new Date().toISOString(),
    });
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'settings',
      action: 'Restaurant profile updated',
      targetId: r.id,
      targetLabel: r.name,
      details: 'Updated restaurant profile and branding shown on the QR menu.',
    });
    return r;
  });
  replaced.forEach(deleteImage);
  return result;
}

export interface OrderingInput {
  requireWaiterApproval: boolean;
  serviceChargePercent: number;
  showSoldOutItems: boolean;
  receiptFooter: string;
}

export function updateOrderingSettings(input: OrderingInput): Restaurant {
  const charge = Number(input.serviceChargePercent);
  if (!Number.isFinite(charge) || charge < 0 || charge > 25) throw fail.validation('Service charge must be between 0% and 25%.');
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'settings.edit');
    const prev = ctx.restaurant.settings;
    // PRD §5.3 — approval cannot be activated without an authorised waiter.
    if (input.requireWaiterApproval && !prev.requireWaiterApproval && approversFor(db, ctx.restaurant).length === 0) {
      throw fail.validation('Assign the “Approve orders” permission to at least one active waiter before turning on approval.');
    }
    const r = db.restaurants.find((x) => x.id === ctx.restaurant.id)!;
    r.settings = {
      ...prev,
      requireWaiterApproval: input.requireWaiterApproval,
      serviceChargePercent: Math.round(charge * 10) / 10,
      showSoldOutItems: input.showSoldOutItems,
      receiptFooter: input.receiptFooter.trim().slice(0, 120),
    };
    r.updatedAt = new Date().toISOString();
    if (prev.requireWaiterApproval !== input.requireWaiterApproval) {
      logActivity(db, ctx.scope, ctx.actor, {
        category: 'approval',
        action: input.requireWaiterApproval ? 'Waiter approval enabled' : 'Waiter approval disabled',
        details: input.requireWaiterApproval
          ? 'New QR orders now wait for an authorised waiter before reaching the kitchen.'
          : 'New QR orders now go straight to the kitchen.',
      });
    }
    if (prev.serviceChargePercent !== r.settings.serviceChargePercent || prev.showSoldOutItems !== r.settings.showSoldOutItems || prev.receiptFooter !== r.settings.receiptFooter) {
      logActivity(db, ctx.scope, ctx.actor, {
        category: 'settings',
        action: 'Ordering settings updated',
        details: `Service charge ${r.settings.serviceChargePercent}%, sold-out items ${r.settings.showSoldOutItems ? 'shown' : 'hidden'}.`,
      });
    }
    return r;
  });
}

export function updateOwnAccount(input: { name: string; email: string; phone: string }): void {
  if (input.name.trim().length < 2) throw fail.validation('Enter your name.');
  if (input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) throw fail.validation('Enter a valid email address.');
  mutateDb((db) => {
    const ctx = requireStaff(db);
    const email = input.email.trim().toLowerCase();
    if (email && db.staff.some((s) => s.id !== ctx.user.id && s.email.toLowerCase() === email)) {
      throw fail.validation('That email is already used by another account.');
    }
    updateScoped(db, 'staff', ctx.scope, ctx.user.id, {
      name: input.name.trim(),
      email,
      phone: input.phone.trim(),
      updatedAt: new Date().toISOString(),
    }, 'Account');
    if (ctx.user.role === 'owner') {
      const r = db.restaurants.find((x) => x.id === ctx.restaurant.id)!;
      r.ownerName = input.name.trim();
      r.ownerEmail = email;
    }
    logActivity(db, ctx.scope, ctx.actor, { category: 'auth', action: 'Profile updated', details: `${input.name.trim()} updated their profile.` });
  });
}

export function changeOwnPassword(current: string, next: string): void {
  const weak = validatePasswordStrength(next);
  if (weak) throw fail.validation(weak);
  mutateDb((db) => {
    const ctx = requireStaff(db);
    if (!verifyPassword(ctx.user, current)) throw fail.validation('Your current password is incorrect.');
    updateScoped(db, 'staff', ctx.scope, ctx.user.id, { ...createPasswordCredentials(next), updatedAt: new Date().toISOString() }, 'Account');
    logActivity(db, ctx.scope, ctx.actor, { category: 'auth', action: 'Password changed', details: `${ctx.user.name} changed their password.` });
  });
}
