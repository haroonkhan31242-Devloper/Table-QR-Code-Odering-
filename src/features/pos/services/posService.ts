/**
 * POS (point of sale): staff-created dine-in and takeaway orders.
 *
 * - POS orders reuse the existing Order record (source = 'pos'), so they show up
 *   in Orders, Kitchen, Billing and Reports with no parallel system.
 * - They go straight to the Kitchen: waiter approval exists for anonymous QR
 *   orders, while POS orders are entered by authorised staff.
 * - "Pay now" settles the order with the shared cash logic in the SAME
 *   transaction, so an underpayment means nothing is created at all.
 */
import type { Order, OrderType, Payment } from '@/src/types/domain';
import { mutateDb } from '@/src/services/storage/database';
import { fail } from '@/src/services/storage/errors';
import { getScoped, listScoped, updateScoped } from '@/src/services/storage/collection';
import { can, requireStaff } from '@/src/services/access/accessControl';
import { logActivity } from '@/src/services/audit/activityService';
import { createId } from '@/src/utils/crypto';
import { formatMoney } from '@/src/utils/format';
import { nextOrderNumber, resolveOrderLines, type CartLineInput } from '@/src/features/orders/services/orderService';
import { settleCashPayment } from '@/src/features/pos/services/billingService';

export const TAKEAWAY_LABEL = 'Takeaway';

export interface PosOrderInput {
  type: OrderType;
  /** Required for dine-in, must be empty for takeaway. */
  tableId?: string | null;
  lines: CartLineInput[];
  note?: string;
  /** Idempotency key: retries / double taps never create a second order. */
  clientRequestId: string;
  /** Present for "Pay now"; omitted for "Pay later". */
  payNow?: { amountReceived: number } | null;
}

export interface PosOrderResult {
  order: Order;
  payment?: Payment;
}

/** Service charge applies to table service (dine-in), not takeaway. */
export function serviceChargeFor(type: OrderType, subtotal: number, percent: number): number {
  return type === 'dine_in' ? Math.round((subtotal * percent) / 100) : 0;
}

export function createPosOrder(input: PosOrderInput): PosOrderResult {
  if (!input.lines.length) throw fail.validation('Add at least one item to the order.');
  if (input.lines.length > 60) throw fail.validation('That order is too large for a single ticket. Split it into two orders.');
  if (input.type !== 'dine_in' && input.type !== 'takeaway') throw fail.validation('Choose dine-in or takeaway.');
  if (input.type === 'dine_in' && !input.tableId) throw fail.validation('Select a table for this dine-in order.');

  return mutateDb((db) => {
    const ctx = requireStaff(db, 'pos.order');
    if (input.payNow && !can(ctx.user, 'cashier.collect')) {
      throw fail.permission('You can create orders but not collect payments. Use “Pay later”.');
    }

    // Idempotency: the same request id returns the order already created.
    const existing = listScoped(db, 'orders', ctx.scope).find((o) => o.clientRequestId === input.clientRequestId);
    if (existing) {
      const payment = existing.paymentId ? db.payments.find((p) => p.id === existing.paymentId) : undefined;
      return { order: existing, payment };
    }

    let table: { id: string; number: string; label: string } | null = null;
    if (input.type === 'dine_in') {
      const t = getScoped(db, 'tables', ctx.scope, input.tableId!, 'Table');
      if (t.status === 'cleaning') {
        throw fail.conflict(`${t.label} is being cleaned. Mark it available before adding orders.`);
      }
      table = { id: t.id, number: t.number, label: t.label };
    } else if (input.tableId) {
      throw fail.validation('Takeaway orders are not attached to a table.');
    }

    const lines = resolveOrderLines(db, ctx.restaurant, input.lines);
    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const serviceCharge = serviceChargeFor(input.type, subtotal, ctx.restaurant.settings.serviceChargePercent);
    const now = new Date().toISOString();

    const order: Order = {
      id: createId('ord'),
      ...ctx.scope,
      number: nextOrderNumber(db, ctx.restaurant),
      source: 'pos',
      type: input.type,
      tableId: table?.id ?? null,
      tableNumber: table?.number ?? '',
      tableLabel: table?.label ?? TAKEAWAY_LABEL,
      qrToken: '',
      createdBy: { id: ctx.user.id, name: ctx.user.name },
      clientRequestId: input.clientRequestId,
      lines,
      customerNote: input.note?.trim().slice(0, 240) || undefined,
      subtotal,
      serviceCharge,
      total: subtotal + serviceCharge,
      // Staff-entered: no waiter approval step — straight to the kitchen.
      status: 'new',
      approvalRequired: false,
      paymentMethod: 'cash_at_counter',
      paymentStatus: 'unpaid',
      history: [
        {
          status: 'new',
          label: `Created at POS (${input.type === 'takeaway' ? 'takeaway' : table!.label}) — sent to kitchen`,
          actorName: ctx.user.name,
          actorRole: ctx.actor.role,
          at: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    db.orders.unshift(order);

    logActivity(db, ctx.scope, ctx.actor, {
      category: 'order',
      action: 'POS order created',
      targetId: order.id,
      targetLabel: order.number,
      details: `${order.number} · ${input.type === 'takeaway' ? 'Takeaway' : `Dine-in at ${table!.label}`} · ${formatMoney(order.total)} · sent to kitchen · ${input.payNow ? 'paid now' : 'pay later'}.`,
    });

    let payment: Payment | undefined;
    if (input.payNow) {
      payment = settleCashPayment(db, ctx, [db.orders.find((o) => o.id === order.id)!], 'individual', input.payNow.amountReceived);
    }
    return { order: db.orders.find((o) => o.id === order.id)!, payment };
  });
}

/** Takeaway orders finished by the kitchen are handed over at the counter. */
export function handOverTakeaway(orderId: string): Order {
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'pos.order');
    const order = getScoped(db, 'orders', ctx.scope, orderId, 'Order');
    if (order.type !== 'takeaway') throw fail.validation('Only takeaway orders are handed over at the counter.');
    if (order.status !== 'completed') {
      throw fail.conflict(`${order.number} isn’t ready for pickup yet (it’s ${order.status.replace('_', ' ')}).`);
    }
    const now = new Date().toISOString();
    const updated = updateScoped(db, 'orders', ctx.scope, orderId, {
      status: 'served',
      updatedAt: now,
      history: [...order.history, { status: 'served', label: 'Handed to customer', actorName: ctx.user.name, actorRole: ctx.actor.role, at: now }],
    }, 'Order');
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'order',
      action: 'Takeaway handed over',
      targetId: orderId,
      targetLabel: order.number,
      details: `${order.number} handed to the customer at the counter.`,
    });
    return updated;
  });
}
