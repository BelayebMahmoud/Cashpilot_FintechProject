import { notFound } from 'next/navigation';
import { ShieldX } from 'lucide-react';
import { type ErrorCode } from '@cashpilot/domain';
import { EmptyState } from '@cashpilot/ui';
import { messageFor } from '@/lib/errors';

/** Rendered when a read use case refuses: 404 for NOT_FOUND, an explicit message for FORBIDDEN. */
export function Denied({ code }: { code: ErrorCode }) {
  if (code === 'NOT_FOUND') notFound();
  return (
    <div className="mx-auto max-w-xl py-10">
      <h1 className="sr-only">Accès refusé</h1>
      <EmptyState icon={<ShieldX />} title="Accès refusé" description={messageFor(code)} />
    </div>
  );
}
