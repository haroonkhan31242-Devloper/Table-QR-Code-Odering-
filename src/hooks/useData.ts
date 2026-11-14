import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { AuthSession, Database } from '@/src/types/domain';
import { readDb, subscribeDb } from '@/src/services/storage/database';
import { readSession, subscribeSession } from '@/src/services/authentication/sessionStore';
import { resolveStaffContext, type StaffContext } from '@/src/services/access/accessControl';

/** Live snapshot of the local database; re-renders on any write (this tab or another). */
export function useDatabase(): Database {
  return useSyncExternalStore(subscribeDb, readDb, readDb);
}

export function useSession(): AuthSession | null {
  return useSyncExternalStore(subscribeSession, readSession, readSession);
}

/** Signed-in restaurant user, restaurant and tenant scope — or null. */
export function useStaffContext(): StaffContext | null {
  const db = useDatabase();
  const session = useSession();
  return useMemo(() => resolveStaffContext(db), [db, session]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Forces a re-render every `ms` (for "x minutes ago" and kitchen timers). */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatches(m.matches);
    m.addEventListener('change', on);
    on();
    return () => m.removeEventListener('change', on);
  }, [query]);
  return matches;
}
