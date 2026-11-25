'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { type Route } from 'next';
import { CircleCheckBig, FileText } from 'lucide-react';
import { type ExpenseDto } from '@cashpilot/application';
import { EXPENSE_CATEGORY_LABELS } from '@cashpilot/domain';
import { Amount, Badge, Card, cn, EmptyState, Kbd } from '@cashpilot/ui';
import { formatDate } from '@cashpilot/ui/format';
import { routes } from '@/lib/routes';
import { ApproveRejectButtons } from './expense-actions';

/**
 * Owner's approval inbox: list on the left, receipt + details on the right.
 * Keyboard: J/K move, A approve, R reject (hints are visible).
 */
export function ApprovalInbox({ company, items, selectedId, currentUserId }: { company: string; items: ExpenseDto[]; selectedId?: string; currentUserId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const index = Math.max(0, items.findIndex((e) => e.id === selectedId));
  const selected = items[index];
  const detailRef = React.useRef<HTMLDivElement>(null);

  const select = React.useCallback(
    (i: number) => {
      const e = items[Math.min(Math.max(i, 0), items.length - 1)];
      if (e) router.replace(`${pathname}?id=${e.id}` as Route, { scroll: false });
    },
    [items, pathname, router],
  );

  React.useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (ev.metaKey || ev.ctrlKey || ev.altKey || t.closest('input, textarea, select, [role="dialog"], [role="alertdialog"]')) return;
      const key = ev.key.toLowerCase();
      if (key === 'j') select(index + 1);
      else if (key === 'k') select(index - 1);
      else if (key === 'a') detailRef.current?.querySelector<HTMLButtonElement>('[data-shortcut="approve"]')?.click();
      else if (key === 'r') detailRef.current?.querySelector<HTMLButtonElement>('[data-shortcut="reject"]')?.click();
      else return;
      ev.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, select]);

  if (items.length === 0) {
    return <EmptyState icon={<CircleCheckBig />} title="Rien à valider" description="Toutes les dépenses soumises ont été traitées." />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <Card className="gap-0 p-0">
        <p className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
          <Kbd>J</Kbd>/<Kbd>K</Kbd> naviguer · <Kbd>A</Kbd> approuver · <Kbd>R</Kbd> refuser
        </p>
        <ul className="max-h-[70vh] divide-y overflow-y-auto" aria-label="Dépenses à valider">
          {items.map((e, i) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => select(i)}
                aria-current={i === index ? 'true' : undefined}
                className={cn('flex w-full items-start justify-between gap-3 px-4 py-3 text-left outline-none hover:bg-accent/60 focus-visible:bg-accent', i === index && 'bg-accent')}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{e.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {e.submittedByName} · {formatDate(e.expenseDate)}
                  </span>
                </span>
                <Amount value={e.amountMillimes} />
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {selected && (
        <Card ref={detailRef} className="gap-5" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{selected.label}</h2>
              <p className="text-sm text-muted-foreground">
                {EXPENSE_CATEGORY_LABELS[selected.category]} · soumise par {selected.submittedByName}
                {selected.submittedAt ? ` le ${formatDate(selected.submittedAt)}` : ''}
              </p>
            </div>
            <Amount value={selected.amountMillimes} size="xl" />
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Date</dt>
              <dd>{formatDate(selected.expenseDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">À payer avant le</dt>
              <dd>{formatDate(selected.dueDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Fournisseur</dt>
              <dd>{selected.supplierName ?? '—'}</dd>
            </div>
          </dl>
          {selected.note && <p className="rounded-md bg-muted p-3 text-sm whitespace-pre-line">{selected.note}</p>}
          {selected.submittedById === currentUserId && <Badge tone="warning">Votre propre dépense — auto-approbation tracée</Badge>}
          <ReceiptPreview company={company} expense={selected} />
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <ApproveRejectButtons
              company={company}
              expense={selected}
              self={selected.submittedById === currentUserId}
              onDone={() => {
                const next = items[index + 1] ?? items[index - 1];
                router.replace((next ? `${pathname}?id=${next.id}` : pathname) as Route, { scroll: false });
              }}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

export function ReceiptPreview({ company, expense }: { company: string; expense: Pick<ExpenseDto, 'id' | 'hasReceipt' | 'receiptMimeType' | 'receiptName'> }) {
  if (!expense.hasReceipt) return <p className="text-sm text-muted-foreground">Aucun justificatif joint.</p>;
  const url = routes.receipt(company, expense.id);
  return (
    <figure className="space-y-2">
      {expense.receiptMimeType?.startsWith('image/') ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`Justificatif : ${expense.receiptName ?? ''}`} className="max-h-[420px] w-full rounded-md border object-contain" />
      ) : (
        <object data={url} type="application/pdf" aria-label="Justificatif PDF" className="h-[420px] w-full rounded-md border">
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
            <FileText className="size-4" /> Ouvrir le justificatif PDF
          </a>
        </object>
      )}
      <figcaption className="text-xs text-muted-foreground">
        <a href={url} target="_blank" rel="noreferrer" className="hover:underline">
          {expense.receiptName ?? 'Justificatif'} — ouvrir dans un nouvel onglet
        </a>
      </figcaption>
    </figure>
  );
}
