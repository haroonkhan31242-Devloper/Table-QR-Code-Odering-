import React from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Card, EmptyState } from '@/src/components/ui/Display';

export default function NoAccessPage() {
  return (
    <Card>
      <EmptyState
        icon={Lock}
        title="You don’t have access to this area"
        description="Your role doesn’t include permission for this module. Ask your restaurant owner or manager if you need it."
        action={
          <Link to="/portal" className="inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-brand-ink hover:bg-brand-hover">
            Go to my workspace
          </Link>
        }
      />
    </Card>
  );
}
