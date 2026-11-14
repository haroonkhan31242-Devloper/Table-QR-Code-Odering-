/**
 * Cashier & billing (PRD §4.10, §4.11, §5.5, §5.8, FR-017…FR-022, FR-027).
 * Only Cash at Counter is functional. Paying never changes table status.
 */
import type { Database, Order, Payment } from '@/src/types/domain';
import { mutateDb } from '@/src/services/storage/database';
import { fail } from '@/src/services/storage/errors';
import { getScoped, insertScoped, listScoped } from '@/src/services/storage/collection';
import { requireStaff, type StaffContext } from '@/src/services/access/accessControl';
import { logActivity } from '@/src/services/audit/activityService';
import { createId } from '@/src/utils/crypto';
import { formatMoney } from '@/src/utils/format';
import { orderPrefix } from '@/src/features/orders/services/orderService';

/** An order can be billed once it has passed approval and was not rejected. */
export function isBillable(order: Order): boolean {
  return order.paymentStatus === 'unpaid' && order.status !== 'rejected' && order.status !== 'pending_approval';
}

export interface BillSummary {
  orders: Order[];
  subtotal: number;
  serviceCharge: number;
  totalDue: number;
}

export function summarizeBill(orders: Order[]): BillSummary {
  return {
    orders,
    subtotal: orders.reduce((s, o) => s + o.subtotal, 0),
    serviceCharge: orders.reduce((s, o) => s + o.serviceCharge, 0),
    totalDue: orders.reduce((s, o) => s + o.total, 0),
  };
}

export function changeFor(totalDue: number, received: number): { change: number; shortBy: number } {
  const r = Math.round(received);
  return { change: Math.max(0, r - totalDue), shortBy: Math.max(0, totalDue - r) };
}

function nextReceiptNumber(db: Database, ctx: StaffContext): string {
  const max = listScoped(db, 'payments', ctx.scope).reduce((m, p) => Math.max(m, Number(p.receiptNumber.split('-').pop()) || 0), 5000);
  return `RC-${orderPrefix(ctx.restaurant.name)}-${max + 1}`;
}

export function recordCashPayment(input: { orderIds: string[]; billType: Payment['billType']; amountReceived: number }): Payment {
  const received = Number(input.amountReceived);
  if (!Number.isFinite(received) || received <= 0) throw fail.validation('Enter the cash amount received.');
  if (!input.orderIds.length) throw fail.validation('Select at least one order to bill.');

  return mutateDb((db) => {
    const ctx = requireStaff(db, 'cashier.collect');
    const orders = input.orderIds.map((id) => getScoped(db, 'orders', ctx.scope, id, 'Order'));
    const notBillable = orders.find((o) => !isBillable(o));
    if (notBillable) throw fail.conflict(`${notBillable.number} can no longer be billed (it may already be paid). Refresh and try again.`);
    if (input.billType === 'combined_table' && new Set(orders.map((o) => o.tableId)).size > 1) {
      throw fail.validation('A combined bill can only include orders from one table.');
    }

    const bill = summarizeBill(orders);
    const amount = Math.round(received);
    // FR-019 — an underpayment can never be recorded as paid.
    if (amount < bill.totalDue) {
      throw fail.validation(`Underpayment blocked: received ${formatMoney(amount)} but ${formatMoney(bill.totalDue)} is due.`);
    }

    const now = new Date().toISOString();
    const payment = insertScoped(db, 'payments', ctx.scope, {
      id: createId('pay'),
      ...ctx.scope,
      receiptNumber: nextReceiptNumber(db, ctx),
      billType: input.billType,
      tableId: orders[0].tableId,
      tableLabel: orders[0].tableLabel,
      orderIds: orders.map((o) => o.id),
      orderNumbers: orders.map((o) => o.number),
      lines: orders.flatMap((o) => o.lines.map((l) => ({
        title: `${l.title}${l.variant ? ` (${l.variant.name})` : ''}`,
        quantity: l.quantity,
        lineTotal: l.lineTotal,
      }))),
      subtotal: bill.subtotal,
      serviceCharge: bill.serviceCharge,
      totalDue: bill.totalDue,
      amountReceived: amount,
      changeDue: amount - bill.totalDue,
      method: 'cash_at_counter',
      cashier: { id: ctx.user.id, name: ctx.user.name },
      reprintCount: 0,
      paidAt: now,
    });

    orders.forEach((o) => {
      const target = db.orders.find((x) => x.id === o.id)!;
      target.paymentStatus = 'paid';
      target.paymentId = payment.id;
      target.updatedAt = now;
      target.history.push({
        status: 'paid',
        label: `Paid — cash at counter (${payment.receiptNumber})`,
        actorName: ctx.user.name,
        actorRole: ctx.actor.role,
        at: now,
      });
    });

    logActivity(db, ctx.scope, ctx.actor, {
      category: 'payment',
      action: input.billType === 'combined_table' ? 'Combined bill paid' : 'Cash payment recorded',
      targetId: payment.id,
      targetLabel: payment.receiptNumber,
      details: `${payment.orderNumbers.join(', ')} — due ${formatMoney(payment.totalDue)}, received ${formatMoney(amount)}, change ${formatMoney(payment.changeDue)}.`,
    });
    return payment;
  });
}

export function logReceiptReprint(paymentId: string): Payment {
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'cashier.reprint');
    const payment = getScoped(db, 'payments', ctx.scope, paymentId, 'Receipt');
    payment.reprintCount += 1;
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'receipt',
      action: 'Receipt reprinted',
      targetId: payment.id,
      targetLabel: payment.receiptNumber,
      details: `Reprint #${payment.reprintCount} of ${payment.receiptNumber}.`,
    });
    return payment;
  });
}
