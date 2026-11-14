import React, { useMemo } from 'react';
import { PageHeader } from '@/src/components/ui/Display';
import { useDatabase } from '@/src/hooks/useData';
import { ActivityExplorer } from '@/src/features/reports/components/ActivityExplorer';

export default function PlatformActivityPage() {
  const db = useDatabase();
  const logs = useMemo(() => db.activity.filter((a) => a.businessId === 'platform'), [db]);
  return (
    <>
      <PageHeader title="Platform activity" description="Tenant provisioning, status changes and Super Admin sign-ins. Restaurant operations are logged inside each restaurant." />
      <ActivityExplorer logs={logs} fileName="platform-activity" />
    </>
  );
}
