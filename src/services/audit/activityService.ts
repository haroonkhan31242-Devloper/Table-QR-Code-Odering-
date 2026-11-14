import type { ActivityCategory, ActivityLog, Database } from '@/src/types/domain';
import { createId } from '@/src/utils/crypto';

export interface Actor {
  id: string;
  name: string;
  role: string;
}

export const PLATFORM_SCOPE = { businessId: 'platform', restaurantId: 'platform' } as const;

/** Append an audit entry inside a `mutateDb` transaction (PRD FR-026). */
export function logActivity(
  db: Database,
  scope: { businessId: string; restaurantId: string },
  actor: Actor,
  entry: { category: ActivityCategory; action: string; details: string; targetId?: string; targetLabel?: string },
  at = new Date().toISOString()
): ActivityLog {
  const log: ActivityLog = {
    id: createId('log'),
    businessId: scope.businessId,
    restaurantId: scope.restaurantId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    at,
    ...entry,
  };
  db.activity.unshift(log);
  return log;
}

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  auth: 'Sign-in',
  tenant: 'Restaurants',
  settings: 'Settings',
  menu: 'Menu',
  table: 'Tables',
  qr: 'QR codes',
  order: 'Orders',
  approval: 'Approvals',
  kitchen: 'Kitchen',
  payment: 'Payments',
  receipt: 'Receipts',
  staff: 'Staff',
  system: 'System',
};
