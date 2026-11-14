import React, { useEffect, useMemo, useState } from 'react';
import { Info, Lock, Wand2 } from 'lucide-react';
import type { StaffMember } from '@/src/types/domain';
import { Dialog } from '@/src/components/ui/Overlay';
import { Button } from '@/src/components/ui/Button';
import { Checkbox, Input, Select, Switch } from '@/src/components/ui/Field';
import { useToast } from '@/src/components/feedback/Toast';
import { errorMessage } from '@/src/services/storage/errors';
import { PERMISSION_GROUPS, ROLE_DEFAULT_PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, normalizePermissions, type Permission } from '@/src/constants/permissions';
import { assignableRoles, createStaff, grantablePermissions, updateStaff, type AssignableRole, type StaffInput } from '../services/staffService';

export function StaffFormDialog({ open, onClose, member, actor }: { open: boolean; onClose: () => void; member: StaffMember | null; actor: StaffMember }) {
  const toast = useToast();
  const roles = assignableRoles(actor);
  const grantable = useMemo(() => grantablePermissions(actor), [actor]);
  const [form, setForm] = useState<StaffInput>({ name: '', username: '', email: '', phone: '', role: roles[roles.length - 1] ?? 'waiter', isActive: true, permissions: [] });
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPassword('');
    if (member) {
      setForm({ name: member.name, username: member.username, email: member.email, phone: member.phone, role: member.role as AssignableRole, isActive: member.isActive, permissions: [...member.permissions] });
    } else {
      const role = roles.includes('waiter') ? 'waiter' : roles[0];
      setForm({ name: '', username: '', email: '', phone: '', role, isActive: true, permissions: ROLE_DEFAULT_PERMISSIONS[role].filter((p) => grantable.has(p)) });
    }
  }, [open, member]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyDefaults = (role: AssignableRole) =>
    setForm((f) => ({ ...f, role, permissions: normalizePermissions(role, ROLE_DEFAULT_PERMISSIONS[role]).filter((p) => grantable.has(p)) }));

  const toggle = (key: Permission, on: boolean) =>
    setForm((f) => ({ ...f, permissions: on ? normalizePermissions(f.role, [...f.permissions, key]) : f.permissions.filter((p) => p !== key) }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (member) {
        updateStaff(member.id, form);
        toast.success('Staff member updated', form.name);
      } else {
        createStaff(form, password);
        toast.success('Staff account created', `${form.name} can sign in as “${form.username.trim().toLowerCase()}”.`);
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      dismissible={false}
      title={member ? `Edit ${member.name}` : 'Add staff member'}
      description="Permissions are enforced by the system, not just hidden in the interface."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="staff-form">{member ? 'Save changes' : 'Create account'}</Button>
        </>
      }
    >
      <form id="staff-form" onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col gap-4">
          {error && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger">{error}</p>}
          <Input label="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-autofocus />
          <Input label="Username" required autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} hint="Used to sign in. Letters, numbers, . _ -" />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          {!member && (
            <Input label="Initial password" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="8+ characters with a letter and a number." />
          )}
          <Select
            label="Role"
            value={form.role}
            onChange={(e) => applyDefaults(e.target.value as AssignableRole)}
            options={roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
            hint={ROLE_DESCRIPTIONS[form.role]}
          />
          <div className="rounded-2xl border border-line p-4">
            <Switch label="Account active" description="Inactive accounts can’t sign in." checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-[14px] font-semibold text-ink">Permissions</h3>
            <Button size="sm" variant="ghost" icon={Wand2} onClick={() => applyDefaults(form.role)}>Reset to role defaults</Button>
          </div>
          {actor.role !== 'owner' && (
            <p className="mb-3 flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> As a manager you can only grant permissions you hold yourself. Staff management stays with the owner.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {PERMISSION_GROUPS.map((group) => (
              <fieldset key={group.id} className="rounded-2xl border border-line p-4">
                <legend className="px-1 text-[12px] font-semibold uppercase tracking-wider text-muted">{group.label}</legend>
                <div className="flex flex-col gap-3">
                  {group.permissions.map((p) => {
                    const roleBlocked = Boolean(p.roles && !p.roles.includes(form.role));
                    const outOfAuthority = !grantable.has(p.key);
                    const disabled = roleBlocked || outOfAuthority;
                    return (
                      <Checkbox
                        key={p.key}
                        checked={form.permissions.includes(p.key)}
                        disabled={disabled}
                        onChange={(v) => toggle(p.key, v)}
                        label={
                          <span className="inline-flex items-center gap-1.5">
                            {p.label}
                            {disabled && <Lock className="size-3 text-muted" aria-label="Locked" />}
                          </span>
                        }
                        description={roleBlocked ? `Only for ${p.roles!.map((r) => ROLE_LABELS[r]).join(', ')}.` : outOfAuthority ? 'Outside your authority.' : p.description}
                      />
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
