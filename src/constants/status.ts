import type { OrderStatus, PaymentStatus, RestaurantStatus, TableStatus } from '@/src/types/domain';

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet';

export interface StatusMeta {
  label: string;
  tone: Tone;
  description: string;
}

export const ORDER_STATUS: Record<OrderStatus, StatusMeta> = {
  pending_approval: { label: 'Awaiting approval', tone: 'warning', description: 'Waiting for an authorised waiter.' },
  new: { label: 'New', tone: 'info', description: 'In the kitchen queue.' },
  preparing: { label: 'Preparing', tone: 'violet', description: 'Being prepared.' },
  ready: { label: 'Ready', tone: 'success', description: 'Ready at the pass.' },
  completed: { label: 'Completed', tone: 'brand', description: 'Kitchen finished; awaiting service.' },
  served: { label: 'Served', tone: 'neutral', description: 'Delivered to the table.' },
  rejected: { label: 'Rejected', tone: 'danger', description: 'Order was rejected.' },
};

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['pending_approval', 'new', 'preparing', 'ready', 'completed'];
export const KITCHEN_STATUSES: OrderStatus[] = ['new', 'preparing', 'ready'];

export const PAYMENT_STATUS: Record<PaymentStatus, StatusMeta> = {
  unpaid: { label: 'Unpaid', tone: 'warning', description: 'Payment not yet recorded.' },
  paid: { label: 'Paid', tone: 'success', description: 'Cash received and recorded.' },
};

export const TABLE_STATUS: Record<TableStatus, StatusMeta> = {
  available: { label: 'Available', tone: 'success', description: 'Ready for guests.' },
  occupied: { label: 'Occupied', tone: 'brand', description: 'Guests are seated.' },
  cleaning: { label: 'Cleaning', tone: 'info', description: 'Being reset.' },
};

/** PRD §5.7 — manual lifecycle: Available → Occupied → Cleaning → Available. */
export const TABLE_NEXT_STATUS: Record<TableStatus, TableStatus> = {
  available: 'occupied',
  occupied: 'cleaning',
  cleaning: 'available',
};

export const TABLE_NEXT_ACTION: Record<TableStatus, string> = {
  available: 'Seat guests',
  occupied: 'Start cleaning',
  cleaning: 'Mark available',
};

export const RESTAURANT_STATUS: Record<RestaurantStatus, StatusMeta> = {
  active: { label: 'Active', tone: 'success', description: 'Operational.' },
  suspended: { label: 'Suspended', tone: 'danger', description: 'Access suspended by platform.' },
};

export const PAYMENT_METHODS = [
  { id: 'cash_at_counter', label: 'Cash at counter', available: true, hint: 'Pay at the counter when you’re done.' },
  { id: 'online_payment', label: 'Online payment', available: false, hint: 'Coming soon' },
  { id: 'credit_card', label: 'Credit / debit card', available: false, hint: 'Coming soon' },
] as const;
