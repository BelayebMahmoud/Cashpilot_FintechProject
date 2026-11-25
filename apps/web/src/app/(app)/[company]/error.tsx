'use client';

import { RouteError } from '@/components/route-states';

export default function CompanyError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <RouteError {...props} />
    </div>
  );
}
