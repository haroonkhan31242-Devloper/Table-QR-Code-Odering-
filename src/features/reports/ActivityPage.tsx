import React, { useMemo } from 'react';
import { usePortal } from '@/src/app/layouts/PortalShell';
import { useDatabase } from '@/src/hooks/useData';
import { PageHeader } from '@/src/components/ui/Display';
import { listScoped } from '@/src/services/storage/collection';
import { ActivityExplorer } from './components/ActivityExplorer';

export default function ActivityPage() {
  const ctx = usePortal();
  const db = useDatabase();
  const logs = useMemo(() => listScoped(db, 'activity', ctx.scope), [db, ctx.scope]);
  return (
    <>
      <PageHeader title="Activity log" description="Who did what, and when. Covers approvals, kitchen decisions, payments, menu and price changes, QR codes, tables and staff access." />
      <ActivityExplorer logs={logs} fileName={`${ctx.restaurant.slug}-activity`} />
    </>
  );
}
