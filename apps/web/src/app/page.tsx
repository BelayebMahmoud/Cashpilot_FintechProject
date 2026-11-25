import { redirect } from 'next/navigation';
import { container } from '@/container';
import { requireUser } from '@/lib/session';
import { routes } from '@/lib/routes';

/** Entry point: first company of the user, or onboarding when they have none. */
export default async function Home() {
  const user = await requireUser();
  const { useCases } = await container();
  const companies = await useCases.listMyCompanies.execute(user.id);
  const first = companies.ok ? companies.value[0] : undefined;
  redirect(first ? routes.company(first.slug) : routes.onboarding());
}
