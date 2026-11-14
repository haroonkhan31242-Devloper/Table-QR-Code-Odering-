import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Building2, History, LayoutDashboard, Settings2 } from 'lucide-react';
import { WorkspaceLayout } from './WorkspaceLayout';
import { useSession } from '@/src/hooks/useData';
import { logout } from '@/src/services/authentication/authService';
import { Badge } from '@/src/components/ui/Display';

export function AdminShell() {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  if (!session || session.kind !== 'super_admin') return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;

  return (
    <WorkspaceLayout
      workspaceLabel="Platform console"
      workspaceName="TableCraft HQ"
      workspaceMeta="Multi-tenant administration"
      workspaceBadge={<Badge tone="violet">Admin</Badge>}
      user={{ name: 'Platform Administrator', subtitle: 'Super Admin' }}
      sections={[
        {
          label: 'Platform',
          items: [
            { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
            { to: '/admin/restaurants', label: 'Restaurants', icon: Building2 },
            { to: '/admin/activity', label: 'Platform activity', icon: History },
            { to: '/admin/settings', label: 'Data & system', icon: Settings2 },
          ],
        },
      ]}
      onLogout={() => {
        logout();
        navigate('/admin/login', { replace: true });
      }}
    />
  );
}
