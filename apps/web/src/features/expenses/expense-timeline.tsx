import { Check, Circle, CircleDashed, X } from 'lucide-react';
import { type ExpenseDto } from '@cashpilot/application';
import { cn } from '@cashpilot/ui';
import { formatDate } from '@cashpilot/ui/format';

/** Soumise → Approuvée → Payée (or Refusée + reason), with icons and text, never colour alone. */
export function ExpenseTimeline({ e }: { e: Pick<ExpenseDto, 'status' | 'submittedAt' | 'decidedAt' | 'paidAt' | 'rejectReason' | 'decidedByName' | 'selfApproved'> }) {
  const steps: { label: string; state: 'done' | 'current' | 'todo' | 'rejected'; detail?: string }[] = [
    {
      label: 'Soumise',
      state: e.status === 'DRAFT' ? 'current' : 'done',
      ...(e.submittedAt ? { detail: formatDate(e.submittedAt) } : e.status === 'DRAFT' ? { detail: 'Brouillon' } : {}),
    },
  ];
  if (e.status === 'REJECTED') {
    steps.push({ label: 'Refusée', state: 'rejected', detail: `${e.decidedAt ? formatDate(e.decidedAt) : ''}${e.rejectReason ? ` — ${e.rejectReason}` : ''}` });
  } else {
    steps.push({
      label: 'Approuvée',
      state: e.status === 'APPROVED' || e.status === 'PAID' ? 'done' : e.status === 'SUBMITTED' ? 'current' : 'todo',
      ...(e.decidedAt ? { detail: `${formatDate(e.decidedAt)}${e.decidedByName ? ` · ${e.decidedByName}` : ''}${e.selfApproved ? ' (auto-approbation)' : ''}` } : {}),
    });
    steps.push({ label: 'Payée', state: e.status === 'PAID' ? 'done' : e.status === 'APPROVED' ? 'current' : 'todo', ...(e.paidAt ? { detail: formatDate(e.paidAt) } : {}) });
  }
  return (
    <ol className="flex flex-col gap-2 text-sm sm:flex-row sm:items-start sm:gap-4" aria-label="Avancement de la dépense">
      {steps.map((s) => (
        <li key={s.label} className="flex items-start gap-2 sm:flex-1">
          <span
            aria-hidden
            className={cn(
              'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full [&_svg]:size-3',
              s.state === 'done' && 'bg-inflow text-white',
              s.state === 'current' && 'border-2 border-primary text-primary',
              s.state === 'todo' && 'border text-muted-foreground',
              s.state === 'rejected' && 'bg-danger text-white',
            )}
          >
            {s.state === 'done' ? <Check /> : s.state === 'rejected' ? <X /> : s.state === 'current' ? <Circle /> : <CircleDashed />}
          </span>
          <span>
            <span className={cn('font-medium', s.state === 'todo' && 'text-muted-foreground')}>{s.label}</span>
            <span className="sr-only"> : {s.state === 'done' ? 'fait' : s.state === 'current' ? 'en cours' : s.state === 'rejected' ? 'refusée' : 'à venir'}</span>
            {s.detail && <span className="block text-xs text-muted-foreground">{s.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
