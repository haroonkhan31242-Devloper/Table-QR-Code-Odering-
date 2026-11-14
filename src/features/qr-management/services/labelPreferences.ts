import { mutateDb } from '@/src/services/storage/database';
import { fail } from '@/src/services/storage/errors';
import { requireStaff } from '@/src/services/access/accessControl';
import { logActivity } from '@/src/services/audit/activityService';
import { normalizePreferences, TEMPLATE_INDEX, type LabelPreferences } from '../labels/templates';

/** Save the restaurant's default QR label design (needs “Manage QR codes”). */
export function saveLabelPreferences(input: LabelPreferences): LabelPreferences {
  const prefs = normalizePreferences(input);
  if (!TEMPLATE_INDEX[prefs.template]) throw fail.validation('Choose a label design.');
  return mutateDb((db) => {
    const ctx = requireStaff(db, 'qr.manage');
    const r = db.restaurants.find((x) => x.id === ctx.restaurant.id && x.businessId === ctx.restaurant.businessId)!;
    r.settings = { ...r.settings, qrLabel: { ...prefs } };
    r.updatedAt = new Date().toISOString();
    logActivity(db, ctx.scope, ctx.actor, {
      category: 'qr',
      action: 'QR label design saved',
      details: `Default table label set to “${TEMPLATE_INDEX[prefs.template].name}” (${prefs.format === 'sticker' ? 'square sticker' : 'table card'}).`,
    });
    return prefs;
  });
}
