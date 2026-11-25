import { type AlertDto } from '@cashpilot/application';
import { formatDate, formatMoney } from '@cashpilot/ui/format';
import { routes } from '@/lib/routes';

/** Turns a derived alert into a sentence with amount/date and a direct action link. */
export function presentAlert(a: AlertDto, company: string): { title: string; description: string; href: string; actionLabel: string } {
  switch (a.kind) {
    case 'INVOICE_OVERDUE':
      return {
        title: `Facture en retard : ${a.label}`,
        description: `${formatMoney(a.amountMillimes)} restent à encaisser, échue le ${formatDate(a.date)} (retard de ${a.days} j).`,
        href: routes.invoice(company, a.entityId!),
        actionLabel: 'Voir la facture',
      };
    case 'INVOICE_DUE_SOON':
      return {
        title: `Échéance proche : ${a.label}`,
        description: `${formatMoney(a.amountMillimes)} attendus ${a.days === 0 ? "aujourd'hui" : `dans ${a.days} j`} (${formatDate(a.date)}).`,
        href: routes.invoice(company, a.entityId!),
        actionLabel: 'Voir la facture',
      };
    case 'EXPENSE_TO_APPROVE':
      return {
        title: `Dépense à valider : ${a.label}`,
        description: `${formatMoney(a.amountMillimes)}, soumise le ${formatDate(a.date)}.`,
        href: routes.approvals(company, { id: a.entityId }),
        actionLabel: 'Examiner',
      };
    case 'NEGATIVE_FORECAST':
      return {
        title: 'Solde prévisionnel négatif',
        description: `Le solde passerait sous zéro le ${formatDate(a.date)} (dans ${a.days} j), jusqu'à ${formatMoney(a.amountMillimes)}. Cause principale : ${a.label}.`,
        href: routes.forecast(company, { horizon: 90 }),
        actionLabel: 'Voir la prévision',
      };
  }
}
