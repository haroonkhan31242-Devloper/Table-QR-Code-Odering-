/**
 * QR service — generation, global uniqueness, resolution and revocation of
 * table QR tokens (PRD §4.6, FR-008, FR-009).
 *
 * Every token ever issued is kept in `db.qrRegistry`, so a token is never
 * re-issued and an old (superseded / revoked) token can be explained to the
 * customer instead of silently opening the wrong table.
 *
 * Uniqueness here is limited to this browser's dataset. A backend must enforce
 * it with a database unique constraint.
 */
import type {
  Category,
  Database,
  DiningTable,
  Product,
  QrPayload,
  QrRegistryEntry,
  QrTokenState,
  Restaurant,
} from '@/src/types/domain';
import { randomToken } from '@/src/utils/crypto';
import { mutateDb, readDb } from '@/src/services/storage/database';
import { fail } from '@/src/services/storage/errors';
import { getScoped, updateScoped } from '@/src/services/storage/collection';
import { requireStaff } from '@/src/services/access/accessControl';
import { logActivity } from '@/src/services/audit/activityService';

const MAX_ATTEMPTS = 8;

export function isTokenTaken(db: Database, token: string): boolean {
  return db.qrRegistry.some((e) => e.token === token) || db.tables.some((t) => t.qrToken === token);
}

/**
 * Generate a collision-checked token and register it. Operates on a draft db.
 * `tokenSource` is injectable so the collision path can be tested.
 */
export function issueQrToken(
  db: Database,
  table: Pick<DiningTable, 'id' | 'businessId' | 'restaurantId' | 'qrVersion'>,
  tokenSource: () => string = randomToken,
  at = new Date().toISOString()
): QrRegistryEntry {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const token = tokenSource();
    if (!/^[a-f0-9]{32}$/.test(token)) continue;
    if (isTokenTaken(db, token)) continue; // collision → regenerate
    const entry: QrRegistryEntry = {
      token,
      businessId: table.businessId,
      restaurantId: table.restaurantId,
      tableId: table.id,
      version: table.qrVersion,
      state: 'active',
      issuedAt: at,
    };
    db.qrRegistry.push(entry);
    return entry;
  }
  throw fail.conflict('Could not generate a unique QR token. Please try again.');
}

export function retireQrToken(db: Database, token: string, state: Exclude<QrTokenState, 'active'>, at = new Date().toISOString()) {
  if (!token) return;
  const entry = db.qrRegistry.find((e) => e.token === token);
  if (entry && entry.state === 'active') {
    entry.state = state;
    entry.retiredAt = at;
  }
}

export function buildQrPayload(table: DiningTable): QrPayload | null {
  if (!table.qrToken) return null;
  return {
    version: 1,
    businessId: table.businessId,
    restaurantId: table.restaurantId,
    tableId: table.id,
    token: table.qrToken,
  };
}

/**
 * The URL printed in the QR code. It carries the public restaurant slug, the
 * human table reference and the unguessable token. Internal ids stay private;
 * the full payload is resolved from the registry.
 */
export function buildQrUrl(restaurant: Pick<Restaurant, 'slug'>, table: Pick<DiningTable, 'qrToken' | 'number'>): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/menu/${encodeURIComponent(restaurant.slug)}/${table.qrToken}?table=${encodeURIComponent(table.number)}`;
}

export type QrResolution =
  | { status: 'ok'; restaurant: Restaurant; table: DiningTable; categories: Category[]; products: Product[]; payload: QrPayload }
  | { status: 'invalid' }
  | { status: 'revoked'; restaurant: Restaurant }
  | { status: 'superseded'; restaurant: Restaurant }
  | { status: 'table_removed'; restaurant: Restaurant }
  | { status: 'suspended'; restaurant: Restaurant };

/** Resolve a scanned QR. Never trusts the slug or table number alone. */
export function resolveQr(db: Database, slug: string, token: string, tableRef?: string | null): QrResolution {
  const entry = db.qrRegistry.find((e) => e.token === token);
  if (!entry) return { status: 'invalid' };
  const restaurant = db.restaurants.find((r) => r.id === entry.restaurantId && r.businessId === entry.businessId);
  // The slug in the URL must match the restaurant that owns the token.
  if (!restaurant || restaurant.slug !== slug) return { status: 'invalid' };
  if (restaurant.status !== 'active') return { status: 'suspended', restaurant };
  if (entry.state === 'revoked') return { status: 'revoked', restaurant };
  if (entry.state === 'superseded') return { status: 'superseded', restaurant };
  if (entry.state === 'orphaned') return { status: 'table_removed', restaurant };

  const table = db.tables.find(
    (t) => t.id === entry.tableId && t.restaurantId === restaurant.id && t.businessId === restaurant.businessId
  );
  if (!table) return { status: 'table_removed', restaurant };
  if (table.qrToken !== token) return { status: 'superseded', restaurant };
  if (tableRef && tableRef !== table.number) return { status: 'invalid' };

  const categories = db.categories
    .filter((c) => c.restaurantId === restaurant.id && c.businessId === restaurant.businessId && c.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const activeCategoryIds = new Set(categories.map((c) => c.id));
  const products = db.products.filter(
    (p) =>
      p.restaurantId === restaurant.id &&
      p.businessId === restaurant.businessId &&
      activeCategoryIds.has(p.categoryId) &&
      (p.isAvailable || restaurant.settings.showSoldOutItems)
  );
  return { status: 'ok', restaurant, table, categories, products, payload: buildQrPayload(table)! };
}

export function resolveQrNow(slug: string, token: string, tableRef?: string | null): QrResolution {
  return resolveQr(readDb(), slug, token, tableRef);
}

/* ------------------------- staff QR actions ------------------------- */

export function regenerateTableQr(tableId: string): DiningTable {
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'qr.manage');
    const table = getScoped(db, 'tables', ctx.scope, tableId, 'Table');
    const previous = table.qrToken;
    const nextVersion = table.qrVersion + 1;
    retireQrToken(db, previous, 'superseded');
    const entry = issueQrToken(db, { ...table, qrVersion: nextVersion });
    const updated = updateScoped(db, 'tables', ctx.scope, tableId, {
      qrToken: entry.token,
      qrVersion: nextVersion,
      updatedAt: entry.issuedAt,
    }, 'Table');
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'qr',
      action: 'QR code regenerated',
      targetId: table.id,
      targetLabel: table.label,
      details: `Issued QR v${nextVersion} for ${table.label}. The previous code no longer works.`,
    });
    return updated;
  });
}

export function revokeTableQr(tableId: string): DiningTable {
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'qr.manage');
    const table = getScoped(db, 'tables', ctx.scope, tableId, 'Table');
    if (!table.qrToken) throw fail.validation('This QR code is already revoked.');
    retireQrToken(db, table.qrToken, 'revoked');
    const updated = updateScoped(db, 'tables', ctx.scope, tableId, { qrToken: '', updatedAt: new Date().toISOString() }, 'Table');
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'qr',
      action: 'QR code revoked',
      targetId: table.id,
      targetLabel: table.label,
      details: `Revoked QR v${table.qrVersion} for ${table.label}. Guests can no longer order from it.`,
    });
    return updated;
  });
}

/* ------------------------ integrity verification ------------------------ */

export interface QrIntegrityReport {
  tablesChecked: number;
  activeTokens: number;
  registryEntries: number;
  restaurants: number;
  duplicateTokens: string[];
  tablesMissingRegistry: string[];
  sameNumberDifferentTokens: number;
  ok: boolean;
}

/** Verifies global uniqueness across ALL restaurants in the dataset. */
export function verifyQrIntegrity(db: Database = readDb()): QrIntegrityReport {
  const seen = new Map<string, number>();
  db.qrRegistry.forEach((e) => seen.set(e.token, (seen.get(e.token) ?? 0) + 1));
  const duplicateTokens = [...seen.entries()].filter(([, n]) => n > 1).map(([t]) => t);

  const activeTables = db.tables.filter((t) => t.qrToken);
  const tableTokenCounts = new Map<string, number>();
  activeTables.forEach((t) => tableTokenCounts.set(t.qrToken, (tableTokenCounts.get(t.qrToken) ?? 0) + 1));
  [...tableTokenCounts.entries()].filter(([, n]) => n > 1).forEach(([t]) => duplicateTokens.push(t));

  const tablesMissingRegistry = activeTables
    .filter((t) => {
      const e = db.qrRegistry.find((r) => r.token === t.qrToken);
      return !e || e.tableId !== t.id || e.state !== 'active';
    })
    .map((t) => t.id);

  const byNumber = new Map<string, Set<string>>();
  activeTables.forEach((t) => {
    const set = byNumber.get(t.number) ?? new Set<string>();
    set.add(t.qrToken);
    byNumber.set(t.number, set);
  });
  const sameNumberDifferentTokens = [...byNumber.values()].filter((s) => s.size > 1).length;

  return {
    tablesChecked: db.tables.length,
    activeTokens: activeTables.length,
    registryEntries: db.qrRegistry.length,
    restaurants: db.restaurants.length,
    duplicateTokens: [...new Set(duplicateTokens)],
    tablesMissingRegistry,
    sameNumberDifferentTokens,
    ok: duplicateTokens.length === 0 && tablesMissingRegistry.length === 0,
  };
}
