import type { AuthSession } from '@/src/types/domain';

const SESSION_KEY = 'tablecraft:session:v2';
const CHANGE_EVENT = 'tablecraft:session-change';

type Listener = () => void;
const listeners = new Set<Listener>();
let cached: AuthSession | null | undefined;

function safeGet(store: Storage | undefined): string | null {
  try {
    return store?.getItem(SESSION_KEY) ?? null;
  } catch {
    return null;
  }
}

function isSession(v: unknown): v is AuthSession {
  const s = v as AuthSession;
  return Boolean(s && (s.kind === 'super_admin' || s.kind === 'staff') && typeof s.userId === 'string');
}

export function readSession(): AuthSession | null {
  if (cached !== undefined) return cached;
  const raw = safeGet(window.sessionStorage) ?? safeGet(window.localStorage);
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    cached = isSession(parsed) ? parsed : null;
  } catch {
    cached = null;
  }
  return cached;
}

function notify() {
  listeners.forEach((l) => l());
}

export function writeSession(session: AuthSession) {
  clearStores();
  const target = session.remember ? window.localStorage : window.sessionStorage;
  target.setItem(SESSION_KEY, JSON.stringify(session));
  cached = session;
  notify();
}

function clearStores() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function clearSession() {
  clearStores();
  cached = null;
  notify();
}

export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === SESSION_KEY || e.key === null) {
      cached = undefined;
      notify();
    }
  });
  window.addEventListener(CHANGE_EVENT, notify);
}
