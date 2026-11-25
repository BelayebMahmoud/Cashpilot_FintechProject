import type { Metadata } from 'next';
import { PartyDetailPage } from '@/features/parties/party-pages';
import { getActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Clients' };

export default async function Page({ params }: PageProps<'/[company]/clients/[id]'>) {
  const { company, id } = await params;
  const actor = await getActor(company);
  return <PartyDetailPage actor={actor} kind="CLIENT" id={id} />;
}
