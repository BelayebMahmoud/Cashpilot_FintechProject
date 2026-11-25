'use client';

import { startTransition, useActionState, type FormEvent } from 'react';
import { type ActionState } from '@/lib/action-state';

/**
 * `useActionState` driven from `onSubmit` instead of `<form action>`.
 * React 19 resets uncontrolled fields after a `<form action>` completes — even when the
 * server answers with a validation error — so the user would lose what they typed.
 * Dispatching inside a transition keeps the fields, and still gives `pending`.
 */
export function useFormAction<T>(
  action: (prev: ActionState<T>, formData: FormData) => Promise<ActionState<T>>,
): [ActionState<T>, (event: FormEvent<HTMLFormElement>) => void, boolean] {
  const [state, dispatch, pending] = useActionState(action, null);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return; // no double submit
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  };
  return [state, onSubmit, pending];
}
