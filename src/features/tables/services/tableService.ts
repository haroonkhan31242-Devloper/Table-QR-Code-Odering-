/**
 * Table management and the manual table lifecycle (PRD §5.7):
 * Available → Occupied → Cleaning → Available. No timers, and payment never
 * changes table status.
 */
import { TABLE_NEXT_STATUS, TABLE_STATUS } from '@/src/constants/status';
import type { DiningTable, TableStatus } from '@/src/types/domain';
import { mutateDb } from '@/src/services/storage/database';
import { fail } from '@/src/services/storage/errors';
import { getScoped, insertScoped, listScoped, removeScoped, updateScoped } from '@/src/services/storage/collection';
import { requireStaff } from '@/src/services/access/accessControl';
import { logActivity } from '@/src/services/audit/activityService';
import { issueQrToken, retireQrToken } from '@/src/services/qr/qrService';
import { createId } from '@/src/utils/crypto';

export interface TableInput {
  number: string;
  area: string;
  capacity: number;
}

function validate(input: TableInput) {
  const number = input.number.trim();
  if (!number) throw fail.validation('Table number is required.');
  if (!/^[A-Za-z0-9-]{1,8}$/.test(number)) throw fail.validation('Use up to 8 letters, numbers or dashes for the table number.');
  const cap = Number(input.capacity);
  if (!Number.isInteger(cap) || cap < 1 || cap > 40) throw fail.validation('Seats must be between 1 and 40.');
}

export function createTable(input: TableInput): DiningTable {
  validate(input);
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'tables.manage');
    const number = input.number.trim().toUpperCase();
    if (listScoped(db, 'tables', ctx.scope).some((t) => t.number.toUpperCase() === number)) {
      throw fail.validation(`Table ${number} already exists in this restaurant.`);
    }
    const now = new Date().toISOString();
    const draft: DiningTable = {
      id: createId('tbl'),
      ...ctx.scope,
      number,
      label: `Table ${number}`,
      area: input.area.trim() || 'Main floor',
      capacity: Number(input.capacity),
      status: 'available',
      statusChangedAt: now,
      qrToken: '',
      qrVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    draft.qrToken = issueQrToken(db, draft).token;
    const table = insertScoped(db, 'tables', ctx.scope, draft);
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'table',
      action: 'Table created',
      targetId: table.id,
      targetLabel: table.label,
      details: `Added ${table.label} (${table.capacity} seats, ${table.area}) with a new unique QR code.`,
    });
    return table;
  });
}

export function updateTable(id: string, input: TableInput): DiningTable {
  validate(input);
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'tables.manage');
    const number = input.number.trim().toUpperCase();
    if (listScoped(db, 'tables', ctx.scope).some((t) => t.id !== id && t.number.toUpperCase() === number)) {
      throw fail.validation(`Table ${number} already exists in this restaurant.`);
    }
    const next = updateScoped(db, 'tables', ctx.scope, id, {
      number,
      label: `Table ${number}`,
      area: input.area.trim() || 'Main floor',
      capacity: Number(input.capacity),
      updatedAt: new Date().toISOString(),
    }, 'Table');
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'table',
      action: 'Table updated',
      targetId: id,
      targetLabel: next.label,
      details: `Updated ${next.label}: ${next.capacity} seats, ${next.area}.`,
    });
    return next;
  });
}

export function deleteTable(id: string): void {
  mutateDb((db) => {
    const ctx = requireStaff(db, 'tables.manage');
    const table = getScoped(db, 'tables', ctx.scope, id, 'Table');
    const openOrders = listScoped(db, 'orders', ctx.scope).filter(
      (o) => o.tableId === id && o.status !== 'rejected' && o.paymentStatus === 'unpaid'
    );
    if (openOrders.length) throw fail.validation(`${table.label} has ${openOrders.length} unpaid order(s). Settle them first.`);
    retireQrToken(db, table.qrToken, 'orphaned');
    removeScoped(db, 'tables', ctx.scope, id, 'Table');
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'table',
      action: 'Table deleted',
      targetId: id,
      targetLabel: table.label,
      details: `Deleted ${table.label}. Its QR code is permanently invalid.`,
    });
  });
}

export function advanceTableStatus(id: string, expected: TableStatus): DiningTable {
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'tables.status');
    const table = getScoped(db, 'tables', ctx.scope, id, 'Table');
    if (table.status !== expected) {
      throw fail.conflict(`${table.label} is now ${TABLE_STATUS[table.status].label}. Refresh and try again.`);
    }
    const nextStatus = TABLE_NEXT_STATUS[table.status];
    const now = new Date().toISOString();
    const next = updateScoped(db, 'tables', ctx.scope, id, { status: nextStatus, statusChangedAt: now, updatedAt: now }, 'Table');
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'table',
      action: 'Table status changed',
      targetId: id,
      targetLabel: table.label,
      details: `${table.label}: ${TABLE_STATUS[table.status].label} → ${TABLE_STATUS[nextStatus].label}.`,
    });
    return next;
  });
}
