import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Building2, KeyRound, ShieldCheck, User } from 'lucide-react';
import { AuthLayout, DemoNotice } from './components/AuthLayout';
import { Button } from '@/src/components/ui/Button';
import { Checkbox, Input } from '@/src/components/ui/Field';
import { loginSuperAdmin } from '@/src/services/authentication/authService';
import { errorMessage } from '@/src/services/storage/errors';
import { isSuperAdminConfigured } from '@/src/config/env';
import { useSession } from '@/src/hooks/useData';

export default function SuperAdminLoginPage() {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session?.kind === 'super_admin') return <Navigate to="/admin" replace />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    try {
      loginSuperAdmin(username, password, remember);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from?.startsWith('/admin') ? from : '/admin', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Platform console"
      title="Super Admin sign in"
      subtitle="Manage restaurant tenants, platform status and system data."
      aside={{
        quote: 'One platform. Every restaurant, cleanly separated.',
        points: [
          { icon: Building2, text: 'Provision and suspend restaurant tenants' },
          { icon: ShieldCheck, text: 'Strict per-restaurant data isolation' },
          { icon: KeyRound, text: 'Platform-wide audit trail' },
        ],
      }}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-[13.5px] font-medium text-danger">
            {error}
          </div>
        )}
        <Input label="Username" icon={User} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        <Input label="Password" type="password" icon={KeyRound} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Checkbox checked={remember} onChange={setRemember} label="Keep me signed in on this device" />
        <Button type="submit" size="lg" block loading={busy} className="mt-2">
          Sign in to console
        </Button>
      </form>
      <DemoNotice>
        {isSuperAdminConfigured ? (
          <>Demo credentials are read from your local <code className="font-mono text-ink-2">.env</code> file (VITE_DEMO_SUPER_ADMIN_*). Frontend-only sign-in is for demonstration, not production security.</>
        ) : (
          <>Super Admin sign-in is not configured. Copy <code className="font-mono text-ink-2">.env.example</code> to <code className="font-mono text-ink-2">.env</code>, set the VITE_DEMO_SUPER_ADMIN_* values and restart the dev server.</>
        )}
      </DemoNotice>
    </AuthLayout>
  );
}
