/**
 * Guest (no-login) session for one table QR: cart, placed order ids and the
 * idempotency key of an in-flight submission. Kept in sessionStorage so it is
 * per browser tab and disappears when the guest closes the tab.
 */
import { randomToken } from '@/src/utils/crypto';

export interface CartItem {
  key: string;
  productId: string;
  variantId?: string;
  addonIds: string[];
  quantity: number;
  note?: string;
}

interface GuestState {
  cart: CartItem[];
  orderIds: string[];
  pendingRequestId?: string;
}

const key = (token: string) => `tablecraft:guest:${token}`;

export function loadGuest(token: string): GuestState {
  try {
    const raw = window.sessionStorage.getItem(key(token));
    const parsed = raw ? (JSON.parse(raw) as GuestState) : null;
    if (parsed && Array.isArray(parsed.cart) && Array.isArray(parsed.orderIds)) return parsed;
  } catch {
    /* ignore corrupt guest state */
  }
  return { cart: [], orderIds: [] };
}

export function saveGuest(token: string, state: GuestState): void {
  try {
    window.sessionStorage.setItem(key(token), JSON.stringify(state));
  } catch {
    /* guest state is a convenience; ordering still works without it */
  }
}

/** Same request id is reused until the order succeeds, so retries never duplicate. */
export function requestIdFor(state: GuestState): string {
  return state.pendingRequestId ?? randomToken();
}

export function lineKey(productId: string, variantId: string | undefined, addonIds: string[], note?: string): string {
  return [productId, variantId ?? '', [...addonIds].sort().join('+'), (note ?? '').trim().toLowerCase()].join('|');
}
