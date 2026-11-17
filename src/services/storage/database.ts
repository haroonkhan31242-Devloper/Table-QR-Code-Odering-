/**
 * Versioned LocalStorage "database".
 *
 * This is the ONLY module that touches the main LocalStorage document. Feature
 * services read through `readDb()` and write through `mutateDb()`, which makes
 * every write atomic (clone → change → validate → persist) and lets us swap the
 * implementation for Firestore later without touching UI code.
 */
import type { Database } from '@/src/types/domain';
import { buildSeedDatabase } from '@/src/services/mock-data/seed';
import { AppError, isQuotaError } from './errors';

export const SCHEMA_VERSION = 4;
export const DB_KEY = `tablecraft:db:v${SCHEMA_VERSION}`;
const keyFor = (version: number) => `tablecraft:db:v${version}`;
/** Exact copy of the data as it was before the last schema upgrade (for rollback). */
export const PRE_UPGRADE_BACKUP_KEY = 'tablecraft:db:pre-upgrade-backup';
const LEGACY_KEYS = ['tablecraft_saas_db_v1', 'tablecraft_saas_session_v1'];
const CORRUPT_BACKUP_KEY = 'tablecraft:db:corrupt-backup';
const ACTIVITY_CAP = 1500;
const CHANGE_EVENT = 'tablecraft:db-change';

type Listener = () => void;

let cache: Database | null = null;
const listeners = new Set<Listener>();
let initNotice: string | null = null;

function storage(): Storage {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new AppError('storage', 'LocalStorage is not available in this browser.');
  }
  return window.localStorage;
}

function isValidDatabase(value: unknown): value is Database {
  if (!value || typeof value !== 'object') return false;
  const db = value as Partial<Database>;
  return (
    db.schemaVersion === SCHEMA_VERSION &&
    Array.isArray(db.restaurants) &&
    Array.isArray(db.staff) &&
    Array.isArray(db.categories) &&
    Array.isArray(db.products) &&
    Array.isArray(db.tables) &&
    Array.isArray(db.qrRegistry) &&
    Array.isArray(db.orders) &&
    Array.isArray(db.payments) &&
    Array.isArray(db.activity)
  );
}

function persist(db: Database) {
  try {
    storage().setItem(DB_KEY, JSON.stringify(db));
  } catch (err) {
    if (isQuotaError(err)) {
      throw new AppError(
        'storage_quota',
        'Browser storage is full. The change was NOT saved. Remove some product images or reset demo data.'
      );
    }
    throw new AppError('storage', 'Could not save to browser storage. The change was not saved.');
  }
}

function seedFresh(): Database {
  const seed = buildSeedDatabase();
  persist(seed);
  return seed;
}

type RawDb = Record<string, unknown> & { schemaVersion?: number };
type RawRecord = Record<string, unknown>;

/**
 * Forward-only schema upgrades, applied in order. Each step only ADDS or
 * RENAMES fields — nothing is deleted — and the untouched original is kept in
 * PRE_UPGRADE_BACKUP_KEY so an upgrade can be rolled back.
 */
const UPGRADES: Record<number, (db: RawDb) => RawDb> = {
  // v2 → v3: the business key was called `tenantId`; it is now `businessId`.
  2: (db) =>
    JSON.parse(JSON.stringify(db), function (_key, value) {
      if (value && typeof value === 'object' && !Array.isArray(value) && 'tenantId' in value) {
        const { tenantId, ...rest } = value as RawRecord;
        return { businessId: tenantId, ...rest };
      }
      return value;
    }),
  // v3 → v4: POS module. Every existing order came from a QR scan at a table.
  3: (db) => {
    const orders = (db.orders as RawRecord[]).map((o) => ({ ...o, source: o.source ?? 'qr', type: o.type ?? 'dine_in' }));
    const payments = (db.payments as RawRecord[]).map((p) => ({ ...p, orderType: p.orderType ?? 'dine_in' }));
    // New permission "Create POS orders": granted to accounts that already run
    // the counter (cashiers and managers with billing access). Nothing is removed.
    const staff = (db.staff as RawRecord[]).map((s) => {
      const perms = (s.permissions as string[]) ?? [];
      const runsCounter = (s.role === 'cashier' || s.role === 'manager') && perms.includes('cashier.view');
      return runsCounter && !perms.includes('pos.order') ? { ...s, permissions: [...perms, 'pos.order'] } : s;
    });
    return { ...db, orders, payments, staff };
  },
};

/** Upgrade the newest older-version document found, if any. */
function migrateFromOlder(store: Storage): Database | null {
  for (let from = SCHEMA_VERSION - 1; from >= 2; from--) {
    const raw = store.getItem(keyFor(from));
    if (!raw) continue;
    try {
      let db = JSON.parse(raw) as RawDb;
      if (db.schemaVersion !== from) return null;
      for (let v = from; v < SCHEMA_VERSION; v++) {
        db = UPGRADES[v](db);
        db.schemaVersion = v + 1;
      }
      if (!isValidDatabase(db)) return null;
      try {
        store.setItem(PRE_UPGRADE_BACKUP_KEY, raw);
      } catch {
        /* backup is best-effort if storage is nearly full */
      }
      persist(db);
      store.removeItem(keyFor(from));
      return db;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Roll back the last schema upgrade by restoring the pre-upgrade copy.
 * Anything created after the upgrade (e.g. POS orders) is not carried back.
 */
export function restorePreUpgradeBackup(): boolean {
  const store = storage();
  const raw = store.getItem(PRE_UPGRADE_BACKUP_KEY);
  if (!raw) return false;
  const version = (JSON.parse(raw) as RawDb).schemaVersion;
  if (!version || version >= SCHEMA_VERSION) return false;
  store.setItem(keyFor(version), raw);
  store.removeItem(DB_KEY);
  cache = null;
  return true;
}

function load(): Database {
  const store = storage();
  const raw = store.getItem(DB_KEY);
  if (!raw) {
    const migrated = migrateFromOlder(store);
    if (migrated) return migrated;
    // Safe initialisation: seed ONLY when nothing exists yet.
    LEGACY_KEYS.forEach((k) => store.removeItem(k));
    return seedFresh();
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidDatabase(parsed)) throw new Error('schema mismatch');
    return parsed;
  } catch {
    // Keep a copy of the unreadable data instead of silently destroying it.
    try {
      store.setItem(CORRUPT_BACKUP_KEY, raw);
    } catch {
      /* backup is best-effort */
    }
    initNotice = 'Stored data was unreadable, so demo data was restored. A backup copy was kept.';
    return seedFresh();
  }
}

export function readDb(): Database {
  if (!cache) cache = load();
  return cache;
}

/** One-time message produced during initialisation (e.g. recovered from corruption). */
export function consumeInitNotice(): string | null {
  const n = initNotice;
  initNotice = null;
  return n;
}

function emit() {
  listeners.forEach((l) => l());
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/**
 * Atomic write. The mutator receives a deep clone; if it throws, or if the
 * browser refuses the write, nothing changes.
 */
export function mutateDb<T>(mutator: (draft: Database) => T): T {
  const draft = structuredClone(readDb());
  const result = mutator(draft);
  if (draft.activity.length > ACTIVITY_CAP) draft.activity = draft.activity.slice(0, ACTIVITY_CAP);
  persist(draft);
  cache = draft;
  emit();
  return result;
}

export function subscribeDb(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-read when another tab (e.g. the customer QR menu) writes. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === DB_KEY || e.key === null) {
      cache = null;
      listeners.forEach((l) => l());
    }
  });
}

export function resetDatabase(): Database {
  const fresh = buildSeedDatabase();
  persist(fresh);
  cache = fresh;
  emit();
  return fresh;
}

export function getStorageUsage(): { dbBytes: number; totalBytes: number; approxQuotaBytes: number } {
  const store = storage();
  let total = 0;
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key) continue;
    total += (key.length + (store.getItem(key)?.length ?? 0)) * 2;
  }
  const dbBytes = (store.getItem(DB_KEY)?.length ?? 0) * 2;
  return { dbBytes, totalBytes: total, approxQuotaBytes: 5 * 1024 * 1024 * 2 };
}
