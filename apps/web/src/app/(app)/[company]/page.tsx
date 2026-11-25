import { redirect } from 'next/navigation';
import { type Route } from 'next';
import { homePathFor } from '@/lib/nav';
import { getActor } from '@/lib/session';

/** Role-shaped home: dashboard for owner/finance, "Mes dépenses" for the collaborator. */
export default async function CompanyHome({ params }: PageProps<'/[company]'>) {
  const { company } = await params;
  const actor = await getActor(company);
  redirect(`/${company}/${homePathFor(actor.role)}` as Route);
}
