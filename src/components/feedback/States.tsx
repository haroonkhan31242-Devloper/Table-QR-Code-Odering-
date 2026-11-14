import React from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2.5 py-16 text-[14px] text-muted">
      <Loader2 className="size-5 animate-spin text-brand" aria-hidden />
      {label}…
    </div>
  );
}

export function RouteFallback() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <Spinner />
    </div>
  );
}

interface BoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Unhandled UI error', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-md">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-danger">
            <AlertOctagon className="size-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-xl font-bold text-ink">Something went wrong</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            This screen hit an unexpected error. Your saved data is safe. Reload to continue.
          </p>
          <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 font-mono text-[12px] text-ink-2">{this.state.error.message}</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => (window.location.href = '/')}>
              Go home
            </Button>
            <Button icon={RotateCcw} onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export function NotFoundPage() {
  return (
    <div className="grain flex min-h-dvh flex-col items-center justify-center bg-bg p-6 text-center">
      <p className="font-display text-[88px] font-extrabold leading-none text-brand">404</p>
      <h1 className="mt-3 text-2xl font-bold text-ink">This page isn’t on the menu</h1>
      <p className="mt-2 max-w-sm text-[14px] text-muted">The link may be outdated. Head back to the start to find your way.</p>
      <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-brand-ink hover:bg-brand-hover">
        Back to home
      </Link>
    </div>
  );
}
