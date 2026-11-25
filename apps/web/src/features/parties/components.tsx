'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Pencil, Plus } from 'lucide-react';
import { type PartyDto } from '@cashpilot/application';
import { type PartyKind } from '@cashpilot/domain';
import {
  Button,
  ConfirmDialog,
  Field,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Textarea,
  toast,
} from '@cashpilot/ui';
import { CompanyField, FormError, SubmitButton } from '@/components/forms';
import { useFormAction } from '@/hooks/use-form-action';
import { fieldError, type ActionState } from '@/lib/action-state';
import { archivePartyAction, savePartyAction } from './actions';

const LABEL: Record<PartyKind, string> = { CLIENT: 'client', SUPPLIER: 'fournisseur' };

/** Create / edit a client or supplier in a side sheet. */
export function PartySheet({
  company,
  kind,
  party,
  defaultOpen = false,
  trigger,
}: {
  company: string;
  kind: PartyKind;
  party?: PartyDto;
  defaultOpen?: boolean;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, formAction, formPending] = useFormAction(async (prev: ActionState<PartyDto>, fd: FormData) => {
    const r = await savePartyAction(prev, fd);
    if (r?.ok) {
      toast.success(party ? 'Modifications enregistrées' : `${kind === 'CLIENT' ? 'Client' : 'Fournisseur'} créé`);
      setOpen(false);
      router.refresh();
    }
    return r;
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus /> Nouveau {LABEL[kind]}
          </Button>
        )}
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{party ? `Modifier ${party.name}` : `Nouveau ${LABEL[kind]}`}</SheetTitle>
          <SheetDescription>Coordonnées utilisées sur les factures et dans l&apos;historique.</SheetDescription>
        </SheetHeader>
        <form ref={formRef} onSubmit={formAction} className="grid gap-4">
          <CompanyField company={company} />
          <input type="hidden" name="kind" value={kind} />
          {party && <input type="hidden" name="id" value={party.id} />}
          <FormError state={state} formRef={formRef} />
          <Field id="party-name" label="Raison sociale ou nom" required error={fieldError(state, 'name')}>
            <Input name="name" defaultValue={party?.name} required minLength={2} autoComplete="organization" />
          </Field>
          <Field id="party-email" label="E-mail" error={fieldError(state, 'email')}>
            <Input name="email" type="email" defaultValue={party?.email ?? ''} autoComplete="email" />
          </Field>
          <Field id="party-phone" label="Téléphone" error={fieldError(state, 'phone')}>
            <Input name="phone" type="tel" defaultValue={party?.phone ?? ''} autoComplete="tel" />
          </Field>
          <Field id="party-taxId" label="Matricule fiscal" hint="Ex. 1234567A/A/M/000" error={fieldError(state, 'taxId')}>
            <Input name="taxId" defaultValue={party?.taxId ?? ''} />
          </Field>
          <Field id="party-address" label="Adresse" error={fieldError(state, 'address')}>
            <Textarea name="address" defaultValue={party?.address ?? ''} rows={2} />
          </Field>
          <Field id="party-notes" label="Notes internes" error={fieldError(state, 'notes')}>
            <Textarea name="notes" defaultValue={party?.notes ?? ''} rows={3} />
          </Field>
          <div className="sticky bottom-0 -mx-5 border-t bg-popover px-5 pt-3 pb-1">
            <SubmitButton pending={formPending} className="w-full">{party ? 'Enregistrer les modifications' : `Créer le ${LABEL[kind]}`}</SubmitButton>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function EditPartyButton({ company, party }: { company: string; party: PartyDto }) {
  return (
    <PartySheet
      company={company}
      kind={party.kind}
      party={party}
      trigger={
        <Button variant="outline" disabled={party.archived}>
          <Pencil /> Modifier
        </Button>
      }
    />
  );
}

export function ArchivePartyButton({ company, party }: { company: string; party: PartyDto }) {
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const archiving = !party.archived;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="outline">
          {archiving ? <Archive /> : <ArchiveRestore />} {archiving ? 'Archiver' : 'Restaurer'}
        </Button>
      }
      title={archiving ? `Archiver ${party.name}` : `Restaurer ${party.name}`}
      consequences={
        archiving
          ? ["Il n'apparaîtra plus dans les listes de choix.", 'Son historique (factures, encaissements, dépenses) est conservé.']
          : ['Il réapparaîtra dans les listes de choix.']
      }
      confirmLabel={archiving ? 'Archiver le tiers' : 'Restaurer le tiers'}
      pending={pending}
      onConfirm={() =>
        startTransition(async () => {
          const fd = new FormData();
          fd.set('company', company);
          fd.set('id', party.id);
          fd.set('kind', party.kind);
          fd.set('archived', String(archiving));
          const r = await archivePartyAction(null, fd);
          if (r?.ok) {
            toast.success(archiving ? 'Tiers archivé' : 'Tiers restauré');
            setOpen(false);
            router.refresh();
          } else if (r) toast.error(r.message);
        })
      }
    />
  );
}
