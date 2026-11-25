import type { Metadata } from 'next';
import { can } from '@cashpilot/domain';
import { Card, PageHeader } from '@cashpilot/ui';
import { formatDate, formatMoney } from '@cashpilot/ui/format';
import { Denied } from '@/components/denied';
import { container } from '@/container';
import { CompanySettingsForm } from '@/features/company/components';
import { getActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Paramètres' };

export default async function SettingsPage({ params }: PageProps<'/[company]/settings'>) {
  const { company } = await params;
  const actor = await getActor(company);
  if (!can(actor, 'company.settings')) return <Denied code="FORBIDDEN" />;
  const { useCases } = await container();
  const r = await useCases.getCompany.execute(actor);
  if (!r.ok) return <Denied code={r.code} />;
  const c = r.value;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Paramètres de l'entreprise" description={`Identifiant : ${c.slug}`} />
      <Card>
        <CompanySettingsForm company={{ slug: c.slug, name: c.name, sector: c.sector, stampDutyMillimes: c.stampDutyMillimes }} canEdit />
      </Card>
      <Card className="gap-1 text-sm">
        <h2 className="font-semibold">Ouverture de la trésorerie</h2>
        <p className="text-muted-foreground">
          Solde initial de <strong className="text-foreground">{formatMoney(c.openingBalanceMillimes)}</strong> au {formatDate(c.openingDate)}. Il ne se modifie pas :
          une correction passe par un mouvement manuel en trésorerie.
        </p>
      </Card>
    </div>
  );
}
