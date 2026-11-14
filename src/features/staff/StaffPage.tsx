import React, { useMemo, useState } from 'react';
import { KeyRound, MoreHorizontal, Pencil, Plus, ShieldCheck, Trash2, UserCheck, Users } from 'lucide-react';
import { usePortal } from '@/src/app/layouts/PortalShell';
import { useDatabase, useDebounced } from '@/src/hooks/useData';
import { Avatar, Badge, Card, EmptyState, PageHeader, Segmented } from '@/src/components/ui/Display';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Input, SearchInput } from '@/src/components/ui/Field';
import { ConfirmDialog, Dialog } from '@/src/components/ui/Overlay';
import { Menu } from '@/src/components/ui/Menu';
import { useToast } from '@/src/components/feedback/Toast';
import { can } from '@/src/services/access/accessControl';
import { filterRecords, listScoped, searchRecords } from '@/src/services/storage/collection';
import { errorMessage } from '@/src/services/storage/errors';
import { ROLE_LABELS } from '@/src/constants/permissions';
import type { StaffMember, StaffRole } from '@/src/types/domain';
import { formatRelative } from '@/src/utils/format';
import { canManageMember, deleteStaff, resetStaffPassword } from './services/staffService';
import { StaffFormDialog } from './components/StaffFormDialog';

const ROLE_TONE: Record<StaffRole, 'brand' | 'violet' | 'info' | 'success' | 'warning'> = {
  owner: 'brand',
  manager: 'violet',
  waiter: 'info',
  kitchen: 'warning',
  cashier: 'success',
};

export default function StaffPage() {
  const ctx = usePortal();
  const db = useDatabase();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<'all' | StaffRole>('all');
  const [form, setForm] = useState<{ open: boolean; member: StaffMember | null }>({ open: false, member: null });
  const [resetFor, setResetFor] = useState<StaffMember | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<StaffMember | null>(null);
  const q = useDebounced(query);

  const staff = useMemo(() => listScoped(db, 'staff', ctx.scope), [db, ctx.scope]);
  const rows = useMemo(
    () =>
      filterRecords(searchRecords(staff, q, [(s) => s.name, (s) => s.username, (s) => s.email]), [role !== 'all' && ((s) => s.role === role)]).sort(
        (a, b) => ['owner', 'manager', 'waiter', 'kitchen', 'cashier'].indexOf(a.role) - ['owner', 'manager', 'waiter', 'kitchen', 'cashier'].indexOf(b.role) || a.name.localeCompare(b.name)
      ),
    [staff, q, role]
  );
  const canManage = can(ctx.user, 'staff.manage');
  const approvers = staff.filter((s) => s.isActive && s.role === 'waiter' && s.permissions.includes('orders.approve'));

  return (
    <>
      <PageHeader
        title="Staff & access"
        description="Create accounts and decide exactly which modules and actions each person can use."
        actions={canManage ? <Button icon={Plus} onClick={() => setForm({ open: true, member: null })}>Add staff</Button> : undefined}
      />

      <Card className="mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning">
          <UserCheck className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 text-[13.5px]">
          <p className="font-semibold text-ink">
            Order approval is {ctx.restaurant.settings.requireWaiterApproval ? 'ON' : 'OFF'} · {approvers.length} authorised approver{approvers.length === 1 ? '' : 's'}
          </p>
          <p className="text-muted">
            {approvers.length ? approvers.map((a) => a.name).join(', ') : 'No waiter has the “Approve / reject orders” permission yet.'} Only waiters can hold this permission.
          </p>
        </div>
      </Card>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput value={query} onChange={setQuery} placeholder="Search name, username, email" className="lg:w-80" />
        <Segmented
          label="Filter by role"
          value={role}
          onChange={setRole}
          options={[
            { value: 'all', label: 'All', count: staff.length },
            ...(['owner', 'manager', 'waiter', 'kitchen', 'cashier'] as StaffRole[]).map((r) => ({ value: r, label: ROLE_LABELS[r], count: staff.filter((s) => s.role === r).length })),
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <Card><EmptyState icon={Users} title="No staff found" /></Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((s) => {
              const manageable = canManageMember(ctx.user, s);
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap">
                  <Avatar name={s.name} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{s.name}</p>
                      {s.id === ctx.user.id && <Badge>You</Badge>}
                      {!s.isActive && <Badge tone="danger">Inactive</Badge>}
                      {s.permissions.includes('orders.approve') && <Badge tone="warning" icon={UserCheck}>Approver</Badge>}
                    </div>
                    <p className="truncate text-[13px] text-muted">@{s.username}{s.email ? ` · ${s.email}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-3 sm:w-auto">
                    <Badge tone={ROLE_TONE[s.role]}>{ROLE_LABELS[s.role]}</Badge>
                    <span className="hidden items-center gap-1 text-[12.5px] text-muted md:inline-flex" title="Permissions">
                      <ShieldCheck className="size-3.5" aria-hidden /> {s.role === 'owner' ? 'All' : s.permissions.length}
                    </span>
                    <span className="hidden w-28 text-right text-[12.5px] text-muted lg:block">{s.lastLoginAt ? `Active ${formatRelative(s.lastLoginAt)}` : 'Never signed in'}</span>
                    {manageable ? (
                      <Menu
                        trigger={(p) => <IconButton {...p} icon={MoreHorizontal} label={`Actions for ${s.name}`} size="sm" />}
                        items={[
                          { label: 'Edit access', icon: Pencil, onSelect: () => setForm({ open: true, member: s }) },
                          { label: 'Reset password', icon: KeyRound, onSelect: () => { setResetFor(s); setNewPassword(''); setResetError(null); } },
                          'separator',
                          { label: 'Remove account', icon: Trash2, tone: 'danger', onSelect: () => setRemoving(s) },
                        ]}
                      />
                    ) : (
                      <span className="size-8" aria-hidden />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {canManage && <StaffFormDialog open={form.open} member={form.member} actor={ctx.user} onClose={() => setForm({ open: false, member: null })} />}

      <Dialog
        open={Boolean(resetFor)}
        onClose={() => setResetFor(null)}
        size="sm"
        title={`Reset password for ${resetFor?.name ?? ''}`}
        description="Share the new password with them in person."
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetFor(null)}>Cancel</Button>
            <Button type="submit" form="reset-form">Set password</Button>
          </>
        }
      >
        <form
          id="reset-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!resetFor) return;
            try {
              resetStaffPassword(resetFor.id, newPassword);
              toast.success('Password updated', resetFor.name);
              setResetFor(null);
            } catch (err) {
              setResetError(errorMessage(err));
            }
          }}
        >
          <Input label="New password" type="password" autoComplete="new-password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} error={resetError} hint="8+ characters with a letter and a number." data-autofocus />
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? ''}?`}
        description="They will no longer be able to sign in. Their past actions stay in the activity log. To pause access instead, edit the account and switch it to inactive."
        confirmLabel="Remove account"
        onConfirm={() => {
          if (!removing) return;
          try {
            deleteStaff(removing.id);
            toast.success('Account removed', removing.name);
            setRemoving(null);
          } catch (err) {
            toast.fromError(err);
            setRemoving(null);
          }
        }}
      />
    </>
  );
}
