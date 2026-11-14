/**
 * Generic, tenant-aware collection helpers used by every feature service.
 * They operate on a Database draft inside `mutateDb` or on a read snapshot.
 */
import type { CollectionName, Database } from '@/src/types/domain';
import { fail } from './errors';

export interface BusinessScope {
  businessId: string;
  restaurantId: string;
}

interface Scoped {
  id: string;
  businessId: string;
  restaurantId: string;
}

type ScopedCollection = {
  [K in CollectionName]: Database[K] extends Array<infer R> ? (R extends Scoped ? K : never) : never;
}[CollectionName];

type RecordOf<K extends CollectionName> = Database[K] extends Array<infer R> ? R : never;

export function inScope(record: { businessId: string; restaurantId: string }, scope: BusinessScope): boolean {
  return record.businessId === scope.businessId && record.restaurantId === scope.restaurantId;
}

/** READ — all records of a collection that belong to the scope. */
export function listScoped<K extends ScopedCollection>(db: Database, name: K, scope: BusinessScope): RecordOf<K>[] {
  return (db[name] as unknown as Scoped[]).filter((r) => inScope(r, scope)) as RecordOf<K>[];
}

/** READ — one record, throwing on cross-tenant access. */
export function getScoped<K extends ScopedCollection>(
  db: Database,
  name: K,
  scope: BusinessScope,
  id: string,
  label: string
): RecordOf<K> {
  const record = (db[name] as unknown as Scoped[]).find((r) => r.id === id);
  if (!record) throw fail.notFound(label);
  if (!inScope(record, scope)) throw fail.otherBusiness();
  return record as RecordOf<K>;
}

/** CREATE — stamps the tenant scope so callers cannot forge it. */
export function insertScoped<K extends ScopedCollection>(
  db: Database,
  name: K,
  scope: BusinessScope,
  record: RecordOf<K>
): RecordOf<K> {
  const stamped = { ...(record as object), businessId: scope.businessId, restaurantId: scope.restaurantId } as RecordOf<K>;
  (db[name] as unknown as RecordOf<K>[]).unshift(stamped);
  return stamped;
}

/** UPDATE — shallow merge; tenant keys and id are immutable. */
export function updateScoped<K extends ScopedCollection>(
  db: Database,
  name: K,
  scope: BusinessScope,
  id: string,
  patch: Partial<RecordOf<K>>,
  label: string
): RecordOf<K> {
  const list = db[name] as unknown as Scoped[];
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) throw fail.notFound(label);
  if (!inScope(list[idx], scope)) throw fail.otherBusiness();
  const next = {
    ...list[idx],
    ...(patch as object),
    id: list[idx].id,
    businessId: list[idx].businessId,
    restaurantId: list[idx].restaurantId,
  };
  list[idx] = next;
  return next as unknown as RecordOf<K>;
}

/** DELETE */
export function removeScoped<K extends ScopedCollection>(
  db: Database,
  name: K,
  scope: BusinessScope,
  id: string,
  label: string
): RecordOf<K> {
  const list = db[name] as unknown as Scoped[];
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) throw fail.notFound(label);
  if (!inScope(list[idx], scope)) throw fail.otherBusiness();
  const [removed] = list.splice(idx, 1);
  return removed as unknown as RecordOf<K>;
}

/* --------------------------- query helpers --------------------------- */

/** SEARCH — case-insensitive match across the given string fields. */
export function searchRecords<T>(items: T[], query: string, fields: Array<(item: T) => string | undefined>): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => fields.some((f) => (f(item) ?? '').toLowerCase().includes(q)));
}

/** FILTER — predicate map; undefined / 'all' values are ignored. */
export function filterRecords<T>(items: T[], predicates: Array<((item: T) => boolean) | false | undefined>): T[] {
  const active = predicates.filter(Boolean) as Array<(item: T) => boolean>;
  return active.length ? items.filter((item) => active.every((p) => p(item))) : items;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
}

export function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safe = Math.min(Math.max(1, page), pageCount);
  return {
    items: items.slice((safe - 1) * pageSize, safe * pageSize),
    page: safe,
    pageCount,
    total: items.length,
  };
}
