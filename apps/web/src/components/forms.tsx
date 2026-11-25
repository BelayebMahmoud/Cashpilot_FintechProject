'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import NextLink from 'next/link';
import { type Route } from 'next';
import { CircleAlert } from 'lucide-react';
import { Alert, AlertDescription, Button, type ButtonProps } from '@cashpilot/ui';
import { type ActionState } from '@/lib/action-state';

/** Submit button wired to the enclosing <form>: spinner + "Enregistrement…" while pending, no double submit. */
export function SubmitButton({ children, pendingLabel = 'Enregistrement…', pending: pendingProp, ...props }: ButtonProps & { pendingLabel?: string; pending?: boolean }) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <Button type="submit" loading={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

/** Form-level error at the top; focus moves to the first invalid field after a failed submit. */
export function FormError({ state, formRef }: { state: ActionState<unknown>; formRef?: React.RefObject<HTMLFormElement | null> }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!state || state.ok) return;
    const invalid = formRef?.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalid ?? ref.current)?.focus();
  }, [state, formRef]);
  if (!state || state.ok) return null;
  return (
    <div ref={ref} tabIndex={-1} className="outline-none">
      <Alert tone="danger">
        <CircleAlert />
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    </div>
  );
}

/** Hidden company slug: every action resolves the actor from it (membership checked server-side). */
export function CompanyField({ company }: { company: string }) {
  return <input type="hidden" name="company" value={company} />;
}

/** next/link accepting plain strings (for design-system components' `linkAs`). */
export function AppLink({ href, ...props }: Omit<React.ComponentProps<typeof NextLink>, 'href'> & { href: string }) {
  return <NextLink href={href as Route} {...props} />;
}
