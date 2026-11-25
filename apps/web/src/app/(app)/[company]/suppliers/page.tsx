import type { Metadata } from 'next';
import { PartyListPage } from '@/features/parties/party-pages';
import { sp } from '@/lib/search-params';
import { getActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Fournisseurs' };

export default async function Page({ params, searchParams }: PageProps<'/[company]/suppliers'>) {
  const [{ company }, search] = await Promise.all([params, searchParams]);
  const actor = await getActor(company);
  return <PartyListPage actor={actor} kind="SUPPLIER" search={sp(search)} />;
}
