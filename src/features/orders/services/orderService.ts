/**
 * Order lifecycle (PRD §5.2–5.4):
 *
 *   submit ─┬─ approval disabled ─────────────────────────► new
 *           └─ approval enabled ─► pending_approval ─ approve ─► new
 *                                                    └ reject ──► rejected
 *   new ─ accept ─► preparing ─► ready ─► completed ─ serve ─► served
 *    └── kitchen reject (reason required) ─► rejected
 */
import { ORDER_STATUS } from '@/src/constants/status';
import type { Database, Order, OrderLine, OrderStatus, Restaurant, StaffMember } from '@/src/types/domain';
import { mutateDb } from '@/src/services/storage/database';
import { fail } from '@/src/services/storage/errors';
import { getScoped, listScoped, updateScoped } from '@/src/services/storage/collection';
import { can, requireStaff, type StaffContext } from '@/src/services/access/accessControl';
import { logActivity } from '@/src/services/audit/activityService';
import { resolveQr } from '@/src/services/qr/qrService';
import { createId } from '@/src/utils/crypto';
import { formatMoney } from '@/src/utils/format';

/* ------------------------------ helpers ------------------------------ */

export function approversFor(db: Database, restaurant: Pick<Restaurant, 'id' | 'businessId'>): StaffMember[] {
  return db.staff.filter(
    (s) =>
      s.restaurantId === restaurant.id &&
      s.businessId === restaurant.businessId &&
      s.isActive &&
      s.role === 'waiter' &&
      can(s, 'orders.approve')
  );
}

export function orderPrefix(name: string): string {
  return (
    name
      .replace(/&/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 3) || 'ORD'
  );
}

function nextOrderNumber(db: Database, restaurant: Restaurant): string {
  const prefix = orderPrefix(restaurant.name);
  const max = db.orders
    .filter((o) => o.restaurantId === restaurant.id)
    .reduce((m, o) => Math.max(m, Number(o.number.split('-').pop()) || 0), 1000);
  return `${prefix}-${max + 1}`;
}

/* --------------------------- customer submit --------------------------- */

export interface CartLineInput {
  productId: string;
  variantId?: string;
  addonIds: string[];
  quantity: number;
  note?: string;
}

export interface SubmitOrderInput {
  slug: string;
  token: string;
  tableRef?: string | null;
  clientRequestId: string;
  lines: CartLineInput[];
  note?: string;
  paymentMethod: Order['paymentMethod'];
}

/** Public (no login) — identity comes only from the validated QR token. */
export function submitCustomerOrder(input: SubmitOrderInput): Order {
  if (input.paymentMethod !== 'cash_at_counter') {
    throw fail.validation('Only Cash at Counter is available right now. Online and card payments are coming soon.');
  }
  if (!input.lines.length) throw fail.validation('Your cart is empty.');
  if (input.lines.length > 40) throw fail.validation('That is a very large order — please ask a staff member for help.');

  return mutateDb((db) => {
    const resolved = resolveQr(db, input.slug, input.token, input.tableRef);
    if (resolved.status !== 'ok') {
      throw fail.validation(
        resolved.status === 'suspended'
          ? 'This restaurant is not accepting orders right now.'
          : 'This table’s QR code is no longer valid. Please ask a staff member for help.'
      );
    }
    const { restaurant, table } = resolved;

    // Idempotency — repeated taps / refresh never create a duplicate order.
    const existing = db.orders.find((o) => o.restaurantId === restaurant.id && o.clientRequestId === input.clientRequestId);
    if (existing) return existing;

    const lines: OrderLine[] = input.lines.map((l) => {
      const product = db.products.find(
        (p) => p.id === l.productId && p.restaurantId === restaurant.id && p.businessId === restaurant.businessId
      );
      if (!product) throw fail.validation('An item in your cart is no longer on the menu. Please review your cart.');
      if (!product.isAvailable) throw fail.validation(`“${product.title}” just sold out. Please remove it from your cart.`);
      const variant = l.variantId ? product.variants.find((v) => v.id === l.variantId) : undefined;
      if (l.variantId && !variant) throw fail.validation(`An option for “${product.title}” changed. Please re-add it.`);
      const addons = l.addonIds.map((id) => {
        const a = product.addons.find((x) => x.id === id);
        if (!a) throw fail.validation(`An add-on for “${product.title}” changed. Please re-add it.`);
        return { name: a.name, price: a.price };
      });
      const quantity = Math.round(Number(l.quantity));
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) throw fail.validation('Quantities must be between 1 and 50.');
      // Authoritative pricing from the restaurant's own menu, never from the client.
      const unitPrice = product.price + (variant?.price ?? 0) + addons.reduce((s, a) => s + a.price, 0);
      return {
        id: createId('line'),
        productId: product.id,
        title: product.title,
        image: product.image,
        basePrice: product.price,
        variant: variant ? { name: variant.name, price: variant.price } : undefined,
        addons,
        unitPrice,
        quantity,
        note: l.note?.trim().slice(0, 140) || undefined,
        lineTotal: unitPrice * quantity,
      };
    });

    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const serviceCharge = Math.round((subtotal * restaurant.settings.serviceChargePercent) / 100);
    const approvalRequired = restaurant.settings.requireWaiterApproval;
    const status: OrderStatus = approvalRequired ? 'pending_approval' : 'new';
    const now = new Date().toISOString();
    const scope = { businessId: restaurant.businessId, restaurantId: restaurant.id };

    const order: Order = {
      id: createId('ord'),
      ...scope,
      number: nextOrderNumber(db, restaurant),
      tableId: table.id,
      tableNumber: table.number,
      tableLabel: table.label,
      qrToken: table.qrToken,
      clientRequestId: input.clientRequestId,
      lines,
      customerNote: input.note?.trim().slice(0, 240) || undefined,
      subtotal,
      serviceCharge,
      total: subtotal + serviceCharge,
      status,
      approvalRequired,
      paymentMethod: 'cash_at_counter',
      paymentStatus: 'unpaid',
      history: [
        {
          status,
          label: approvalRequired ? 'Submitted — awaiting waiter approval' : 'Submitted — sent to kitchen',
          actorName: `${table.label} guest`,
          actorRole: 'Customer',
          at: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    db.orders.unshift(order);
    logActivity(db, scope, { id: 'customer', name: `${table.label} guest`, role: 'Customer' }, {
      category: 'order',
      action: 'QR order submitted',
      targetId: order.id,
      targetLabel: order.number,
      details: `${order.number} (${formatMoney(order.total)}) from ${table.label} → ${approvalRequired ? 'waiter approval queue' : 'kitchen'}.`,
    });
    return order;
  });
}

/* ---------------------------- staff actions ---------------------------- */

function transition(
  ctx: StaffContext,
  db: Database,
  orderId: string,
  expected: OrderStatus[],
  next: OrderStatus,
  label: string,
  extra: Partial<Order> = {},
  note?: string
): Order {
  const order = getScoped(db, 'orders', ctx.scope, orderId, 'Order');
  if (!expected.includes(order.status)) {
    throw fail.conflict(`${order.number} is already “${ORDER_STATUS[order.status].label}”. The board has been refreshed.`);
  }
  const now = new Date().toISOString();
  return updateScoped(db, 'orders', ctx.scope, orderId, {
    ...extra,
    status: next,
    updatedAt: now,
    history: [...order.history, { status: next, label, actorName: ctx.user.name, actorRole: ctx.actor.role, at: now, note }],
  }, 'Order');
}

export function approveOrder(orderId: string): Order {
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'orders.approve');
    if (ctx.user.role !== 'waiter') throw fail.permission('Only an authorised waiter can approve orders.');
    const now = new Date().toISOString();
    const order = transition(ctx, db, orderId, ['pending_approval'], 'new', 'Approved — sent to kitchen', {
      approvedBy: { id: ctx.user.id, name: ctx.user.name, at: now },
    });
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'approval',
      action: 'Order approved',
      targetId: order.id,
      targetLabel: order.number,
      details: `${ctx.user.name} approved ${order.number} (${order.tableLabel}) and sent it to the kitchen.`,
    });
    return order;
  });
}

export function rejectOrderAtApproval(orderId: string, reason: string): Order {
  const clean = reason.trim();
  if (clean.length < 3) throw fail.validation('Give a short reason for rejecting this order.');
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'orders.approve');
    if (ctx.user.role !== 'waiter') throw fail.permission('Only an authorised waiter can review orders.');
    const order = transition(ctx, db, orderId, ['pending_approval'], 'rejected', 'Rejected at approval', {
      rejection: { stage: 'approval', reason: clean, byName: ctx.user.name, at: new Date().toISOString() },
    }, clean);
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'approval',
      action: 'Order rejected',
      targetId: order.id,
      targetLabel: order.number,
      details: `${order.number} rejected at approval: ${clean}`,
    });
    return order;
  });
}

export function acceptKitchenOrder(orderId: string): Order {
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'kitchen.decide');
    const order = transition(ctx, db, orderId, ['new'], 'preparing', 'Accepted — preparing');
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'kitchen',
      action: 'Order accepted',
      targetId: order.id,
      targetLabel: order.number,
      details: `Kitchen accepted ${order.number} and started preparing.`,
    });
    return order;
  });
}

export function rejectKitchenOrder(orderId: string, reason: string): Order {
  const clean = reason.trim();
  if (clean.length < 3) throw fail.validation('A rejection reason is required.');
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'kitchen.decide');
    const order = transition(ctx, db, orderId, ['new', 'preparing'], 'rejected', 'Rejected by kitchen', {
      rejection: { stage: 'kitchen', reason: clean, byName: ctx.user.name, at: new Date().toISOString() },
    }, clean);
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'kitchen',
      action: 'Kitchen rejected order',
      targetId: order.id,
      targetLabel: order.number,
      details: `${order.number} (${order.tableLabel}) rejected by kitchen: ${clean}`,
    });
    return order;
  });
}

const KITCHEN_FLOW: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  preparing: { next: 'ready', label: 'Ready at the pass' },
  ready: { next: 'completed', label: 'Completed by kitchen' },
};

export function advanceKitchenOrder(orderId: string, from: OrderStatus): Order {
  const step = KITCHEN_FLOW[from];
  if (!step) throw fail.validation('This order cannot be advanced from the kitchen.');
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'kitchen.status');
    const order = transition(ctx, db, orderId, [from], step.next, step.label);
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'kitchen',
      action: `Order ${ORDER_STATUS[step.next].label.toLowerCase()}`,
      targetId: order.id,
      targetLabel: order.number,
      details: `${order.number}: ${ORDER_STATUS[from].label} → ${ORDER_STATUS[step.next].label}.`,
    });
    return order;
  });
}

export function markOrderServed(orderId: string): Order {
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'orders.serve');
    const order = transition(ctx, db, orderId, ['completed'], 'served', 'Served to table');
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'order',
      action: 'Order served',
      targetId: order.id,
      targetLabel: order.number,
      details: `${order.number} served at ${order.tableLabel}.`,
    });
    return order;
  });
}

/** Orders visible to the customer who placed them (same browser only). */
export function customerOrders(db: Database, restaurantId: string, ids: string[]): Order[] {
  const wanted = new Set(ids);
  return db.orders.filter((o) => o.restaurantId === restaurantId && wanted.has(o.id));
}

export function scopedOrders(db: Database, ctx: StaffContext): Order[] {
  return listScoped(db, 'orders', ctx.scope);
}
