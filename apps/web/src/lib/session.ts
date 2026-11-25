import 'server-only';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { type Actor, type UserView } from '@cashpilot/application';
import { container } from '@/container';

/** Signed-in user for this request (deduplicated per render with React `cache`). */
export const getSessionUser = cache(async (): Promise<UserView | null> => {
  const { sessions } = await container();
  return sessions.currentUser(await headers());
});

export async function requireUser(): Promise<UserView> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * Session + membership → Actor for the company in the URL.
 * Not signed in → /login. Not a member (or unknown company) → 404, never 403:
 * another company's existence must not leak.
 */
export const getActor = cache(async (companySlug: string): Promise<Actor> => {
  const user = await requireUser();
  const { useCases } = await container();
  const result = await useCases.resolveActor.execute(user.id, companySlug);
  if (!result.ok) notFound();
  return result.value;
});
