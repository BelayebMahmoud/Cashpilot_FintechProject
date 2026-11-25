import type { Metadata } from 'next';
import { ArrowLeftRight } from 'lucide-react';
import { Card } from '@cashpilot/ui';
import { container } from '@/container';
import { OnboardingForm } from '@/features/company/components';
import { requireUser } from '@/lib/session';
import { todayIso } from '@/lib/today';

export const metadata: Metadata = { title: 'Créer votre entreprise' };

export default async function OnboardingPage() {
  const user = await requireUser();
  const { useCases } = await container();
  // "today" for the default opening date comes from the server clock (Africa/Tunis)
  const today = todayIso();
  const companies = await useCases.listMyCompanies.execute(user.id);
  const count = companies.ok ? companies.value.length : 0;
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground" aria-hidden>
            <ArrowLeftRight className="size-4" />
          </span>
          CashPilot
        </div>
        <Card className="gap-6 p-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Créer votre entreprise</h1>
            <p className="text-sm text-muted-foreground">
              Bonjour {user.name}. Indiquez votre solde de départ : il devient le premier mouvement de votre trésorerie
              {count > 0 ? ` (vous êtes déjà membre de ${count} entreprise${count > 1 ? 's' : ''}).` : '.'}
            </p>
          </div>
          <OnboardingForm today={today} />
        </Card>
      </div>
    </main>
  );
}
