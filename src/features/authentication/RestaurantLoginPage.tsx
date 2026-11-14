import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ChefHat, KeyRound, QrCode, User, Wallet } from 'lucide-react';
import { AuthLayout, DemoNotice } from './components/AuthLayout';
import { Button } from '@/src/components/ui/Button';
import { Checkbox, Input } from '@/src/components/ui/Field';
import { loginRestaurantUser } from '@/src/services/authentication/authService';
import { errorMessage } from '@/src/services/storage/errors';
import { isRestaurantDemoConfigured } from '@/src/config/env';
import { useStaffContext } from '@/src/hooks/useData';

export default function RestaurantLoginPage() {
  const ctx = useStaffContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (ctx) return <Navigate to="/portal" replace />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim() || !password) {
      setError('Enter your username (or email) and password.');
      return;
    }
    setBusy(true);
    try {
      loginRestaurantUser(identifier, password, remember);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from?.startsWith('/portal') ? from : '/portal', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Restaurant portal"
      title="Welcome back"
      subtitle="Owners, managers and staff sign in here. You’ll see only the tools your role allows."
      aside={{
        quote: 'From table scan to kitchen to cash drawer — in one calm flow.',
        points: [
          { icon: QrCode, text: 'Unique, revocable QR code for every table' },
          { icon: ChefHat, text: 'Live kitchen display with accept / reject' },
          { icon: Wallet, text: 'Cash at counter with automatic change' },
        ],
      }}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-[13.5px] font-medium text-danger">
            {error}
          </div>
        )}
        <Input
          label="Username or email"
          icon={User}
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          autoFocus
        />
        <Input label="Password" type="password" icon={KeyRound} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Checkbox checked={remember} onChange={setRemember} label="Keep me signed in on this device" />
        <Button type="submit" size="lg" block loading={busy} className="mt-2">
          Sign in
        </Button>
        <p className="text-center text-[12.5px] text-muted">Forgot your password? Ask your restaurant owner or manager to reset it.</p>
      </form>
      <DemoNotice>
        {isRestaurantDemoConfigured ? (
          <>
            Demo accounts use the credentials in your local <code className="font-mono text-ink-2">.env</code> file (VITE_DEMO_RESTAURANT_* and
            VITE_DEMO_STAFF_PASSWORD). Customers never sign in — they order by scanning a table QR code.
          </>
        ) : (
          <>Restaurant demo sign-in is not configured. Copy <code className="font-mono text-ink-2">.env.example</code> to <code className="font-mono text-ink-2">.env</code>, then reset demo data.</>
        )}
      </DemoNotice>
    </AuthLayout>
  );
}
