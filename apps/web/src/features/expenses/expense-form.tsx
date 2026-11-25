'use client';

import * as React from 'react';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@cashpilot/domain';
import { Button, cn, DateField, Field, FileDropzone, Input, Label, MoneyInput, NativeSelect, Textarea } from '@cashpilot/ui';
import { CompanyField, FormError, SubmitButton } from '@/components/forms';
import { useFormAction } from '@/hooks/use-form-action';
import { fieldError } from '@/lib/action-state';
import { createExpenseAction, updateExpenseDraftAction } from './actions';

export interface ExpenseFormProps {
  company: string;
  today: string;
  suppliers: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  initial?: {
    id: string;
    label: string;
    category: ExpenseCategory;
    amountMillimes: number;
    expenseDate: string;
    dueDate: string | null;
    supplierId: string | null;
    projectId: string | null;
    note: string | null;
    hasReceipt: boolean;
  };
}

/**
 * The collaborator's one-screen, mobile-first flow: amount (large), category chips,
 * date, receipt (camera on phones), then "Soumettre". Also used to edit a draft.
 */
export function ExpenseForm({ company, today, suppliers, projects, initial }: ExpenseFormProps) {
  const [state, formAction, formPending] = useFormAction(initial ? updateExpenseDraftAction : createExpenseAction);
  const formRef = React.useRef<HTMLFormElement>(null);
  const [category, setCategory] = React.useState<ExpenseCategory | ''>(initial?.category ?? '');
  const categoryError = fieldError(state, 'category');

  return (
    <form ref={formRef} onSubmit={formAction} className="grid gap-5 pb-24 md:pb-0" encType="multipart/form-data">
      <CompanyField company={company} />
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <FormError state={state} formRef={formRef} />

      <Field id="amount" label="Montant" required error={fieldError(state, 'amount')}>
        <MoneyInput name="amount" size="lg" required placeholder="0,000" defaultMillimes={initial?.amountMillimes ?? null} autoFocus={!initial} />
      </Field>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">
          Catégorie <span aria-hidden className="text-danger">*</span>
          <span className="sr-only">(obligatoire)</span>
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-describedby={categoryError ? 'category-error' : undefined}>
          {EXPENSE_CATEGORIES.map((c) => (
            <label
              key={c}
              className={cn(
                'inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                category === c ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              <input type="radio" name="category" value={c} checked={category === c} onChange={() => setCategory(c)} className="sr-only" required />
              {EXPENSE_CATEGORY_LABELS[c]}
            </label>
          ))}
        </div>
        {categoryError && (
          <p id="category-error" className="text-sm text-danger">
            {categoryError}
          </p>
        )}
      </fieldset>

      <Field id="label" label="Libellé" required error={fieldError(state, 'label')} hint="Ex. Taxi rendez-vous client Sousse">
        <Input name="label" defaultValue={initial?.label} required minLength={2} maxLength={160} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="expenseDate" label="Date de la dépense" required error={fieldError(state, 'expenseDate')}>
          <DateField name="expenseDate" defaultValue={initial?.expenseDate ?? today} max={today} required />
        </Field>
        <Field id="dueDate" label="À payer avant le" hint="Optionnel : par défaut, la date de la dépense." error={fieldError(state, 'dueDate')}>
          <DateField name="dueDate" defaultValue={initial?.dueDate ?? ''} />
        </Field>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="receipt">
          Justificatif <span aria-hidden className="text-danger">*</span>
          <span className="sr-only">(obligatoire pour soumettre)</span>
        </Label>
        {initial?.hasReceipt && <p className="text-xs text-muted-foreground">Un justificatif est déjà joint ; ajoutez-en un autre pour le remplacer.</p>}
        <FileDropzone name="receipt" id="receipt" error={fieldError(state, 'receipt')} />
      </div>

      {(suppliers.length > 0 || projects.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {suppliers.length > 0 && (
            <Field id="supplierId" label="Fournisseur (optionnel)">
              <NativeSelect name="supplierId" defaultValue={initial?.supplierId ?? ''}>
                <option value="">Aucun</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          {projects.length > 0 && (
            <Field id="projectId" label="Projet (optionnel)">
              <NativeSelect name="projectId" defaultValue={initial?.projectId ?? ''}>
                <option value="">Aucun</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>
      )}

      <Field id="note" label="Note (optionnel)">
        <Textarea name="note" defaultValue={initial?.note ?? ''} rows={2} maxLength={1000} />
      </Field>

      {/* sticky bottom action bar on mobile */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t bg-background/95 p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
        <Button type="submit" name="intent" value="draft" variant="outline" className="flex-1 md:flex-none">
          Enregistrer en brouillon
        </Button>
        <SubmitButton pending={formPending} name="intent" value="submit" className="flex-1 md:flex-none" size="lg">
          Soumettre la dépense
        </SubmitButton>
      </div>
    </form>
  );
}
