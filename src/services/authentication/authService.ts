/**
 * Demo authentication provider.
 *
 * - Super Admin credentials come from VITE_DEMO_SUPER_ADMIN_* (.env).
 * - Restaurant users are stored in the local mock database with salted hashes.
 *
 * This is a FRONTEND-ONLY prototype: anything in the browser bundle or
 * LocalStorage can be read by the user. Replace this module with Firebase
 * Authentication (or a backend) before production; UI code only calls the
 * functions exported here.
 */
import { demoEnv, isSuperAdminConfigured } from '@/src/config/env';
import type { StaffMember } from '@/src/types/domain';
import { hashPassword, randomToken, safeEqual } from '@/src/utils/crypto';
import { mutateDb, readDb } from '@/src/services/storage/database';
import { fail } from '@/src/services/storage/errors';
import { logActivity, PLATFORM_SCOPE } from '@/src/services/audit/activityService';
import { clearSession, readSession, writeSession } from './sessionStore';
import { ROLE_LABELS } from '@/src/constants/permissions';

export const SUPER_ADMIN_ID = 'platform-super-admin';
const GENERIC_ERROR = 'Incorrect username or password.';

export function createPasswordCredentials(password: string): { passwordHash: string; passwordSalt: string } {
  const passwordSalt = randomToken().slice(0, 16);
  return { passwordSalt, passwordHash: hashPassword(password, passwordSalt) };
}

export function verifyPassword(user: Pick<StaffMember, 'passwordHash' | 'passwordSalt'>, password: string): boolean {
  if (!user.passwordHash || !user.passwordSalt) return false;
  return safeEqual(hashPassword(password, user.passwordSalt), user.passwordHash);
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use at least one letter and one number.';
  return null;
}

export function loginSuperAdmin(username: string, password: string, remember: boolean): void {
  if (!isSuperAdminConfigured) {
    throw fail.auth('Super Admin demo login is not configured. Add the VITE_DEMO_SUPER_ADMIN_* values to your .env file.');
  }
  const okUser = username.trim().toLowerCase() === demoEnv.superAdminUsername.toLowerCase();
  const okPass = safeEqual(password, demoEnv.superAdminPassword);
  if (!okUser || !okPass) throw fail.auth(GENERIC_ERROR);

  writeSession({ kind: 'super_admin', userId: SUPER_ADMIN_ID, issuedAt: new Date().toISOString(), remember });
  mutateDb((db) =>
    logActivity(db, PLATFORM_SCOPE, { id: SUPER_ADMIN_ID, name: 'Platform Administrator', role: 'Super Admin' }, {
      category: 'auth',
      action: 'Super Admin signed in',
      details: 'Signed in to the platform console.',
    })
  );
}

export function loginRestaurantUser(identifier: string, password: string, remember: boolean): StaffMember {
  const id = identifier.trim().toLowerCase();
  if (!id || !password) throw fail.validation('Enter your username and password.');

  const db = readDb();
  const user = db.staff.find((s) => s.username.toLowerCase() === id || s.email.toLowerCase() === id);
  if (!user || !verifyPassword(user, password)) throw fail.auth(GENERIC_ERROR);
  if (!user.isActive) throw fail.auth('This account has been deactivated. Contact your restaurant manager.');
  const restaurant = db.restaurants.find((r) => r.id === user.restaurantId && r.businessId === user.businessId);
  if (!restaurant) throw fail.auth('Your restaurant could not be found.');
  if (restaurant.status !== 'active') throw fail.auth(`${restaurant.name} is currently suspended. Contact platform support.`);

  writeSession({ kind: 'staff', userId: user.id, issuedAt: new Date().toISOString(), remember });
  mutateDb((draft) => {
    const u = draft.staff.find((s) => s.id === user.id);
    if (u) u.lastLoginAt = new Date().toISOString();
    logActivity(draft, { businessId: user.businessId, restaurantId: user.restaurantId }, { id: user.id, name: user.name, role: ROLE_LABELS[user.role] }, {
      category: 'auth',
      action: 'Signed in',
      details: `${user.name} signed in to the restaurant portal.`,
    });
  });
  return user;
}

export function logout(): void {
  const session = readSession();
  if (session?.kind === 'staff') {
    try {
      mutateDb((db) => {
        const u = db.staff.find((s) => s.id === session.userId);
        if (u) {
          logActivity(db, { businessId: u.businessId, restaurantId: u.restaurantId }, { id: u.id, name: u.name, role: ROLE_LABELS[u.role] }, {
            category: 'auth',
            action: 'Signed out',
            details: `${u.name} signed out.`,
          });
        }
      });
    } catch {
      /* logging must never block sign-out */
    }
  }
  clearSession();
}

export { readSession };
