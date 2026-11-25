'use client';

import { useEffect } from 'react';
import { ErrorState, Skeleton } from '@cashpilot/ui';

/** Shared body of every segment's error.tsx (client component with reset). */
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return <ErrorState digest={error.digest} onRetry={reset} />;
}

/** Generic list page skeleton (header, filters, rows) — matches the final layout. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="mx-auto max-w-7xl space-y-6" aria-busy="true" aria-label="Chargement">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64" />
      </div>
      <Skeleton className="h-10 w-full max-w-xl" />
      <div className="space-y-2 rounded-lg border p-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-6" aria-busy="true" aria-label="Chargement">
      <Skeleton className="h-8 w-72" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
