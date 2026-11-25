import type { Metadata } from 'next';
import { PartyDetailPage } from '@/features/parties/party-pages';
import { getActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Fournisseurs' };

export default async function Page({ params }: PageProps<'/[company]/suppliers/[id]'>) {
  const { company, id } = await params;
  const actor = await getActor(company);
  return <PartyDetailPage actor={actor} kind="SUPPLIER" id={id} />;
}
