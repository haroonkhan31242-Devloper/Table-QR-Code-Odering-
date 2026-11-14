import React, { useState } from 'react';
import { KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { usePortal } from '@/src/app/layouts/PortalShell';
import { Avatar, Badge, Card, CardHeader, PageHeader } from '@/src/components/ui/Display';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Field';
import { useToast } from '@/src/components/feedback/Toast';
import { errorMessage } from '@/src/services/storage/errors';
import { PERMISSION_INDEX, PERMISSIONS, ROLE_LABELS } from '@/src/constants/permissions';
import { can } from '@/src/services/access/accessControl';
import { changeOwnPassword, updateOwnAccount } from './services/settingsService';

export default function AccountPage() {
  const ctx = usePortal();
  const toast = useToast();
  const [profile, setProfile] = useState({ name: ctx.user.name, email: ctx.user.email, phone: ctx.user.phone });
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const granted = PERMISSIONS.filter((p) => can(ctx.user, p));

  return (
    <>
      <PageHeader title="My account" description="Your profile, password and what you have access to." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={UserRound} title="Profile" />
          <form
            className="flex flex-col gap-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                updateOwnAccount(profile);
                toast.success('Profile updated');
              } catch (err) {
                toast.fromError(err);
              }
            }}
          >
            <div className="flex items-center gap-3">
              <Avatar name={ctx.user.name} size={48} />
              <div>
                <p className="font-semibold text-ink">@{ctx.user.username}</p>
                <Badge tone="brand">{ROLE_LABELS[ctx.user.role]}</Badge>
              </div>
            </div>
            <Input label="Full name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            <Input label="Email" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
            <Input label="Phone" type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
            <div className="flex justify-end"><Button type="submit">Save profile</Button></div>
          </form>
        </Card>

        <Card className="h-fit">
          <CardHeader icon={KeyRound} title="Change password" />
          <form
            className="flex flex-col gap-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              setPwError(null);
              if (pw.next !== pw.confirm) {
                setPwError('The new passwords don’t match.');
                return;
              }
              try {
                changeOwnPassword(pw.current, pw.next);
                setPw({ current: '', next: '', confirm: '' });
                toast.success('Password changed');
              } catch (err) {
                setPwError(errorMessage(err));
              }
            }}
          >
            {pwError && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger">{pwError}</p>}
            <Input label="Current password" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            <Input label="New password" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} hint="8+ characters with a letter and a number." />
            <Input label="Confirm new password" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            <div className="flex justify-end"><Button type="submit" disabled={!pw.current || !pw.next}>Update password</Button></div>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader icon={ShieldCheck} title="Your access" description={`${granted.length} permission${granted.length === 1 ? '' : 's'} at ${ctx.restaurant.name}`} />
          <ul className="flex flex-wrap gap-2 p-5">
            {granted.map((p) => (
              <li key={p}><Badge tone="neutral">{PERMISSION_INDEX[p].label}</Badge></li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
