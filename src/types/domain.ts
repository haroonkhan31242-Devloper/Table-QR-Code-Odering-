/**
 * Core domain model for the TableCraft multi-tenant restaurant SaaS.
 *
 * Every restaurant-owned record carries BOTH `businessId` and `restaurantId`
 * so that a future backend (e.g. Firestore security rules or a SQL row-level
 * policy) can enforce isolation on either key without a data migration.
 */
import type { Permission } from '@/src/constants/permissions';

export type ISODate = string;

/* ------------------------------------------------------------------ */
/* Platform                                                            */
/* ------------------------------------------------------------------ */

export type RestaurantStatus = 'active' | 'suspended';

export interface Restaurant {
  id: string;
  businessId: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  cuisine: string;
  ownerName: string;
  ownerEmail: string;
  phone: string;
  address: string;
  city: string;
  logoImage: string;
  coverImage: string;
  accentColor: string;
  status: RestaurantStatus;
  /** PRD 4.1 / OD-10 — commercial model retained as proposed fields only. */
  commercial: {
    planLabel: string;
    creditBalance: number;
    dueDate: string;
  };
  settings: RestaurantSettings;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface RestaurantSettings {
  requireWaiterApproval: boolean;
  serviceChargePercent: number;
  showSoldOutItems: boolean;
  currency: 'PKR';
  receiptFooter: string;
  /** Saved QR label design (optional; older data has none and uses defaults). */
  qrLabel?: {
    template: string;
    format: string;
    heading: string;
    instruction: string;
    showTable: boolean;
  };
}

/* ------------------------------------------------------------------ */
/* Users & access                                                      */
/* ------------------------------------------------------------------ */

export type StaffRole = 'owner' | 'manager' | 'waiter' | 'kitchen' | 'cashier';

export interface StaffMember {
  id: string;
  businessId: string;
  restaurantId: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  role: StaffRole;
  isActive: boolean;
  /** Salted SHA-256 hash — demo-only, NOT production password storage. */
  passwordHash: string;
  passwordSalt: string;
  permissions: Permission[];
  lastLoginAt?: ISODate;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type SessionKind = 'super_admin' | 'staff';

export interface AuthSession {
  kind: SessionKind;
  userId: string;
  issuedAt: ISODate;
  remember: boolean;
}

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */

export interface Category {
  id: string;
  businessId: string;
  restaurantId: string;
  name: string;
  description: string;
  image: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface ProductOption {
  id: string;
  name: string;
  /** For variants: price delta. For add-ons: absolute price. */
  price: number;
}

export interface Product {
  id: string;
  businessId: string;
  restaurantId: string;
  categoryId: string;
  title: string;
  description: string;
  price: number;
  image: string;
  isAvailable: boolean;
  isPopular: boolean;
  variants: ProductOption[];
  addons: ProductOption[];
  prepMinutes: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ------------------------------------------------------------------ */
/* Tables & QR                                                         */
/* ------------------------------------------------------------------ */

export type TableStatus = 'available' | 'occupied' | 'cleaning';

export interface DiningTable {
  id: string;
  businessId: string;
  restaurantId: string;
  number: string;
  label: string;
  area: string;
  capacity: number;
  status: TableStatus;
  statusChangedAt: ISODate;
  /** Current QR token; empty string when revoked and not yet regenerated. */
  qrToken: string;
  qrVersion: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type QrTokenState = 'active' | 'revoked' | 'superseded' | 'orphaned';

/** Global registry of every QR token ever issued in this dataset. */
export interface QrRegistryEntry {
  token: string;
  businessId: string;
  restaurantId: string;
  tableId: string;
  version: number;
  state: QrTokenState;
  issuedAt: ISODate;
  retiredAt?: ISODate;
}

export interface QrPayload {
  version: 1;
  businessId: string;
  restaurantId: string;
  tableId: string;
  token: string;
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export type OrderStatus =
  | 'pending_approval'
  | 'new'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'served'
  | 'rejected';

export type PaymentMethod = 'cash_at_counter' | 'online_payment' | 'credit_card';
/** Where an order was created: guest QR scan, or staff at the POS. */
export type OrderSource = 'qr' | 'pos';
/** Dine-in orders belong to a table; takeaway orders have none. */
export type OrderType = 'dine_in' | 'takeaway';
export type PaymentStatus = 'unpaid' | 'paid';

export interface OrderLine {
  id: string;
  productId: string;
  title: string;
  image: string;
  basePrice: number;
  variant?: { name: string; price: number };
  addons: { name: string; price: number }[];
  unitPrice: number;
  quantity: number;
  note?: string;
  lineTotal: number;
}

export interface OrderEvent {
  status: OrderStatus | 'paid' | 'note';
  label: string;
  actorName: string;
  actorRole: string;
  at: ISODate;
  note?: string;
}

export interface Order {
  id: string;
  businessId: string;
  restaurantId: string;
  number: string;
  source: OrderSource;
  type: OrderType;
  /** Null for takeaway orders. */
  tableId: string | null;
  /** Empty for takeaway orders. */
  tableNumber: string;
  /** Display label: "Table 04" or "Takeaway". */
  tableLabel: string;
  /** Token of the scanned QR (QR orders only; empty for POS orders). */
  qrToken: string;
  /** Staff member who created a POS order. */
  createdBy?: { id: string; name: string };
  clientRequestId: string;
  lines: OrderLine[];
  customerNote?: string;
  subtotal: number;
  serviceCharge: number;
  total: number;
  status: OrderStatus;
  approvalRequired: boolean;
  approvedBy?: { id: string; name: string; at: ISODate };
  rejection?: { stage: 'approval' | 'kitchen'; reason: string; byName: string; at: ISODate };
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentId?: string;
  history: OrderEvent[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Payment {
  id: string;
  businessId: string;
  restaurantId: string;
  receiptNumber: string;
  billType: 'individual' | 'combined_table';
  orderType: OrderType;
  /** Null when the bill is for a takeaway order. */
  tableId: string | null;
  tableLabel: string;
  orderIds: string[];
  orderNumbers: string[];
  lines: { title: string; quantity: number; lineTotal: number }[];
  subtotal: number;
  serviceCharge: number;
  totalDue: number;
  amountReceived: number;
  changeDue: number;
  method: 'cash_at_counter';
  cashier: { id: string; name: string };
  reprintCount: number;
  paidAt: ISODate;
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

export type ActivityCategory =
  | 'auth'
  | 'tenant'
  | 'settings'
  | 'menu'
  | 'table'
  | 'qr'
  | 'order'
  | 'approval'
  | 'kitchen'
  | 'payment'
  | 'receipt'
  | 'staff'
  | 'system';

export interface ActivityLog {
  id: string;
  /** 'platform' for Super Admin events. */
  businessId: string;
  restaurantId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  category: ActivityCategory;
  action: string;
  targetId?: string;
  targetLabel?: string;
  details: string;
  at: ISODate;
}

/* ------------------------------------------------------------------ */
/* Database                                                            */
/* ------------------------------------------------------------------ */

export interface Database {
  schemaVersion: number;
  seededAt: ISODate;
  restaurants: Restaurant[];
  staff: StaffMember[];
  categories: Category[];
  products: Product[];
  tables: DiningTable[];
  qrRegistry: QrRegistryEntry[];
  orders: Order[];
  payments: Payment[];
  activity: ActivityLog[];
}

export type CollectionName = Exclude<keyof Database, 'schemaVersion' | 'seededAt'>;
