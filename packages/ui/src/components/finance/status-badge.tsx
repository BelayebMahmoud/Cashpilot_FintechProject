import * as React from 'react';
import { Ban, Check, CircleDashed, CircleDot, Clock, FileText, Hourglass, PieChart, X } from 'lucide-react';
import { Badge } from '../primitives/layout';

export type InvoiceBadgeInput = {
  kind: 'invoice';
  status: 'DRAFT' | 'ISSUED' | 'CANCELLED';
  settlement: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  overdue: boolean;
  daysOverdue?: number;
};

export type ExpenseBadgeInput = {
  kind: 'expense';
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID';
};

type Tone = 'outline' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export function invoiceBadge(i: Omit<InvoiceBadgeInput, 'kind'>): { label: string; tone: Tone; icon: React.ReactNode } {
  if (i.status === 'DRAFT') return { label: 'Brouillon', tone: 'outline', icon: <FileText /> };
  if (i.status === 'CANCELLED') return { label: 'Annulée', tone: 'neutral', icon: <Ban /> };
  if (i.settlement === 'PAID') return { label: 'Payée', tone: 'success', icon: <Check /> };
  if (i.overdue) return { label: `En retard${i.daysOverdue ? ` (+${i.daysOverdue} j)` : ''}`, tone: 'danger', icon: <Clock /> };
  if (i.settlement === 'PARTIALLY_PAID') return { label: 'Partiellement payée', tone: 'info', icon: <PieChart /> };
  return { label: 'Émise · non payée', tone: 'info', icon: <CircleDot /> };
}

export function expenseBadge(status: ExpenseBadgeInput['status']): { label: string; tone: Tone; icon: React.ReactNode } {
  switch (status) {
    case 'DRAFT':
      return { label: 'Brouillon', tone: 'outline', icon: <CircleDashed /> };
    case 'SUBMITTED':
      return { label: 'Soumise · à valider', tone: 'warning', icon: <Hourglass /> };
    case 'APPROVED':
      return { label: 'Approuvée', tone: 'info', icon: <Check /> };
    case 'REJECTED':
      return { label: 'Refusée', tone: 'danger', icon: <X /> };
    case 'PAID':
      return { label: 'Payée', tone: 'success', icon: <Check /> };
  }
}

/** Status is never conveyed by colour alone: icon + text + soft background. */
export function StatusBadge(props: InvoiceBadgeInput | ExpenseBadgeInput) {
  const b = props.kind === 'invoice' ? invoiceBadge(props) : expenseBadge(props.status);
  return (
    <Badge tone={b.tone}>
      <span aria-hidden className="contents">
        {b.icon}
      </span>
      {b.label}
    </Badge>
  );
}
