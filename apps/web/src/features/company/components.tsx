'use client';

import * as React from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import { ROLE_LABELS, ROLES, SECTOR_LABELS, SECTORS, type Role, type Sector } from '@cashpilot/domain';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DateField,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  MoneyInput,
  NativeSelect,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@cashpilot/ui';
import { CompanyField, FormError, SubmitButton } from '@/components/forms';
import { useFormAction } from '@/hooks/use-form-action';
import { fieldError, type ActionState } from '@/lib/action-state';
import { addMemberAction, changeRoleAction, createCompanyAction, removeMemberAction, updateCompanyAction } from './actions';

export function OnboardingForm({ today }: { today: string }) {
  const [state, formAction, formPending] = useFormAction(createCompanyAction);
  const formRef = React.useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} onSubmit={formAction} className="grid gap-4">
      <FormError state={state} formRef={formRef} />
      <Field id="name" label="Nom de l'entreprise" required error={fieldError(state, 'name')}>
        <Input name="name" autoComplete="organization" required minLength={2} maxLength={80} />
      </Field>
      <Field id="sector" label="Secteur" required error={fieldError(state, 'sector')}>
        <NativeSelect name="sector" defaultValue="DIGITAL_AGENCY" required>
          {SECTORS.map((s) => (
            <option key={s} value={s}>
              {SECTOR_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="openingBalance" label="Solde initial" required hint="Le solde de votre compte à la date d'ouverture." error={fieldError(state, 'openingBalance')}>
          <MoneyInput name="openingBalance" placeholder="5 000,000" required />
        </Field>
        <Field id="openingDate" label="Date d'ouverture" required error={fieldError(state, 'openingDate')}>
          <DateField name="openingDate" defaultValue={today} max={today} required />
        </Field>
      </div>
      <SubmitButton pending={formPending} size="lg">Créer l&apos;entreprise</SubmitButton>
    </form>
  );
}

export function CompanySettingsForm({
  company,
  canEdit,
}: {
  company: { slug: string; name: string; sector: Sector; stampDutyMillimes: number };
  canEdit: boolean;
}) {
  const [state, formAction, formPending] = useFormAction(updateCompanyAction);
  const formRef = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (state?.ok) toast.success('Paramètres enregistrés');
  }, [state]);
  return (
    <form ref={formRef} onSubmit={formAction} className="grid max-w-xl gap-4">
      <CompanyField company={company.slug} />
      <FormError state={state} formRef={formRef} />
      <fieldset disabled={!canEdit} className="grid gap-4">
        <Field id="name" label="Nom" required error={fieldError(state, 'name')}>
          <Input name="name" defaultValue={company.name} required />
        </Field>
        <Field id="sector" label="Secteur" required>
          <NativeSelect name="sector" defaultValue={company.sector}>
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {SECTOR_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="stampDuty" label="Timbre fiscal par facture" hint="Ajouté au total TTC des nouvelles factures (0 pour aucun)." error={fieldError(state, 'stampDuty')}>
          <MoneyInput name="stampDuty" defaultMillimes={company.stampDutyMillimes} />
        </Field>
      </fieldset>
      {canEdit && <SubmitButton pending={formPending} className="justify-self-start">Enregistrer les paramètres</SubmitButton>}
    </form>
  );
}

export interface MemberRow {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

export function MembersManager({ company, members, currentUserId }: { company: string; members: MemberRow[]; currentUserId: string }) {
  return (
    <Card className="gap-0 p-0">
      <div className="flex items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-semibold">Membres ({members.length})</h2>
          <p className="text-sm text-muted-foreground">Le rôle détermine ce que chacun voit et peut faire.</p>
        </div>
        <AddMemberDialog company={company} />
      </div>
      <Table>
        <TableCaption>Membres de l&apos;entreprise et leur rôle</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead className="hidden md:table-cell">E-mail</TableHead>
            <TableHead>Rôle</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.userId}>
              <TableCell>
                <span className="font-medium">{m.name}</span>
                {m.userId === currentUserId && (
                  <Badge tone="outline" className="ml-2">
                    vous
                  </Badge>
                )}
                <span className="block text-xs text-muted-foreground md:hidden">{m.email}</span>
              </TableCell>
              <TableCell className="hidden md:table-cell">{m.email}</TableCell>
              <TableCell>
                <RoleSelect company={company} member={m} />
              </TableCell>
              <TableCell className="text-right">
                <RemoveMember company={company} member={m} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function RoleSelect({ company, member }: { company: string; member: MemberRow }) {
  const [pending, startTransition] = React.useTransition();
  return (
    <NativeSelect
      aria-label={`Rôle de ${member.name}`}
      defaultValue={member.role}
      disabled={pending}
      className="h-9 w-56"
      onChange={(e) => {
        const select = e.currentTarget;
        const role = select.value;
        startTransition(async () => {
          const fd = new FormData();
          fd.set('company', company);
          fd.set('userId', member.userId);
          fd.set('role', role);
          const r = await changeRoleAction(null, fd);
          if (r?.ok) toast.success(`Rôle mis à jour : ${ROLE_LABELS[role as Role]}`);
          else if (r) {
            toast.error(r.message);
            select.value = member.role;
          }
        });
      }}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </NativeSelect>
  );
}

function RemoveMember({ company, member }: { company: string; member: MemberRow }) {
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Retirer ${member.name}`}>
          <Trash2 />
        </Button>
      }
      title={`Retirer ${member.name} de l'entreprise`}
      consequences={["Cette personne n'aura plus accès aux données de l'entreprise.", 'Son historique (dépenses, journal) est conservé.']}
      confirmLabel="Retirer le membre"
      destructive
      pending={pending}
      onConfirm={() =>
        startTransition(async () => {
          const fd = new FormData();
          fd.set('company', company);
          fd.set('userId', member.userId);
          const r = await removeMemberAction(null, fd);
          if (r?.ok) {
            toast.success('Membre retiré');
            setOpen(false);
          } else if (r) toast.error(r.message);
        })
      }
    />
  );
}

function AddMemberDialog({ company }: { company: string }) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction, formPending] = useFormAction(async (prev: ActionState<{ userId: string }>, fd: FormData) => {
    const r = await addMemberAction(prev, fd);
    if (r?.ok) {
      toast.success('Membre ajouté');
      setOpen(false);
    }
    return r;
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Ajouter un membre
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter un membre</DialogTitle>
          <DialogDescription>La personne doit déjà avoir créé son compte CashPilot.</DialogDescription>
        </DialogHeader>
        <form onSubmit={formAction} className="grid gap-4">
          <CompanyField company={company} />
          <FormError state={state} />
          <Field id="member-email" label="E-mail" required error={fieldError(state, 'email')}>
            <Input name="email" type="email" required autoComplete="off" />
          </Field>
          <Field id="member-role" label="Rôle" required>
            <NativeSelect name="role" defaultValue="EMPLOYEE">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <SubmitButton pending={formPending}>Ajouter le membre</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
