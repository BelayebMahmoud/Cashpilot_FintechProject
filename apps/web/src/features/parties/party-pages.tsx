import Link from 'next/link';
import { Mail, MapPin, Phone, Users } from 'lucide-react';
import { type Actor } from '@cashpilot/application';
import { can, EXPENSE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS, type PartyKind, type PaymentMethod } from '@cashpilot/domain';
import {
  Amount,
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Pagination,
  StatList,
  StatusBadge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@cashpilot/ui';
import { formatDate, formatRelativeDue } from '@cashpilot/ui/format';
import { Denied } from '@/components/denied';
import { FilterBar } from '@/components/filter-bar';
import { AppLink } from '@/components/forms';
import { container } from '@/container';
import { routes } from '@/lib/routes';
import { pageParam } from '@/lib/search-params';
import { todayIso } from '@/lib/today';
import { ArchivePartyButton, EditPartyButton, PartySheet } from './components';

const COPY: Record<PartyKind, { title: string; one: string; description: string; emptyTitle: string; emptyText: string }> = {
  CLIENT: {
    title: 'Clients',
    one: 'client',
    description: 'Coordonnées, factures et encaissements de vos clients.',
    emptyTitle: "Aucun client pour l'instant",
    emptyText: 'Ajoutez votre premier client pour lui émettre des factures.',
  },
  SUPPLIER: {
    title: 'Fournisseurs',
    one: 'fournisseur',
    description: 'Coordonnées et dépenses par fournisseur.',
    emptyTitle: "Aucun fournisseur pour l'instant",
    emptyText: 'Ajoutez vos fournisseurs pour rattacher les dépenses.',
  },
};

/** Shared list page for clients and suppliers (URL search, server pagination, create in a sheet). */
export async function PartyListPage({ actor, kind, search }: { actor: Actor; kind: PartyKind; search: Record<string, string | undefined> }) {
  const { useCases } = await container();
  const includeArchived = search.archived === '1';
  const r = await useCases.listParties.execute(actor, { kind, q: search.q, page: pageParam(search.page), includeArchived });
  if (!r.ok) return <Denied code={r.code} />;
  const copy = COPY[kind];
  const c = actor.companySlug;
  const canWrite = can(actor, 'party.write');
  const detail = (id: string) => (kind === 'CLIENT' ? routes.client(c, id) : routes.supplier(c, id));
  const list = kind === 'CLIENT' ? routes.clients : routes.suppliers;
  const filtered = !!search.q || includeArchived;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader title={copy.title} description={copy.description} actions={canWrite && <PartySheet company={c} kind={kind} defaultOpen={search.new === '1'} />} />
      <FilterBar
        searchPlaceholder="Nom, e-mail, matricule…"
        selects={[{ name: 'archived', label: 'Archivés', options: [{ value: '1', label: 'Inclure les archivés' }] }]}
      />
      {r.value.total === 0 ? (
        filtered ? (
          <EmptyState variant="no-results" title="Aucun résultat pour ces filtres" description="Modifiez la recherche ou réinitialisez les filtres." />
        ) : (
          <EmptyState icon={<Users />} title={copy.emptyTitle} description={copy.emptyText} action={canWrite && <PartySheet company={c} kind={kind} />} />
        )
      ) : (
        <Card className="gap-0 p-0">
          <Table>
            <TableCaption>Liste des {copy.title.toLowerCase()}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead className="hidden md:table-cell">E-mail</TableHead>
                <TableHead className="hidden md:table-cell">Téléphone</TableHead>
                <TableHead className="hidden lg:table-cell">Matricule fiscal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.value.items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={detail(p.id)} className="font-medium text-primary hover:underline">
                      {p.name}
                    </Link>
                    {p.archived && (
                      <Badge tone="outline" className="ml-2">
                        Archivé
                      </Badge>
                    )}
                    <span className="block text-xs text-muted-foreground md:hidden">{p.email ?? p.phone ?? ''}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{p.email ?? '—'}</TableCell>
                  <TableCell className="hidden md:table-cell">{p.phone ?? '—'}</TableCell>
                  <TableCell className="hidden font-mono text-xs lg:table-cell">{p.taxId ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination
        page={r.value.page}
        pageSize={r.value.pageSize}
        total={r.value.total}
        hrefFor={(page) => list(c, { ...search, page })}
        linkAs={AppLink}
      />
    </div>
  );
}

/** Detail: contact card, KPI row, tabs "Factures" / "Encaissements" (client) or "Dépenses" (supplier). */
export async function PartyDetailPage({ actor, kind, id }: { actor: Actor; kind: PartyKind; id: string }) {
  const { useCases } = await container();
  const r = await useCases.getPartyDetail.execute(actor, { id });
  if (!r.ok) return <Denied code={r.code} />;
  const { party, invoices, payments, expenses, totals } = r.value;
  if (party.kind !== kind) return <Denied code="NOT_FOUND" />;
  const c = actor.companySlug;
  const canWrite = can(actor, 'party.write');
  const today = todayIso();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        breadcrumb={
          <Link href={kind === 'CLIENT' ? routes.clients(c) : routes.suppliers(c)} className="hover:underline">
            {COPY[kind].title}
          </Link>
        }
        title={
          <span className="flex items-center gap-2">
            {party.name}
            {party.archived && <Badge tone="outline">Archivé</Badge>}
          </span>
        }
        actions={
          canWrite && (
            <>
              <EditPartyButton company={c} party={party} />
              <ArchivePartyButton company={c} party={party} />
            </>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="gap-3">
          <h2 className="font-semibold">Coordonnées</h2>
          <dl className="space-y-2 text-sm">
            <Info icon={<Mail />} label="E-mail" value={party.email} />
            <Info icon={<Phone />} label="Téléphone" value={party.phone} />
            <Info icon={<MapPin />} label="Adresse" value={party.address} />
            <div>
              <dt className="text-xs text-muted-foreground">Matricule fiscal</dt>
              <dd className="font-mono text-xs">{party.taxId ?? '—'}</dd>
            </div>
            {party.notes && (
              <div>
                <dt className="text-xs text-muted-foreground">Notes</dt>
                <dd className="whitespace-pre-line">{party.notes}</dd>
              </div>
            )}
          </dl>
        </Card>
        <Card className="lg:col-span-2">
          <StatList
            items={
              kind === 'CLIENT'
                ? [
                    { label: 'Facturé', value: totals.invoicedMillimes },
                    { label: 'Encaissé', value: totals.receivedMillimes },
                    { label: 'Reste à encaisser', value: totals.outstandingMillimes },
                    { label: 'Dont en retard', value: totals.overdueMillimes },
                  ]
                : [
                    { label: 'Dépenses engagées', value: totals.expensesCommittedMillimes },
                    { label: 'Payé', value: totals.expensesPaidMillimes },
                  ]
            }
          />
        </Card>
      </div>

      {kind === 'CLIENT' ? (
        <Tabs defaultValue="invoices">
          <TabsList>
            <TabsTrigger value="invoices">Factures ({invoices.length})</TabsTrigger>
            <TabsTrigger value="payments">Encaissements ({payments.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="invoices" className="mt-4">
            {invoices.length === 0 ? (
              <EmptyState title="Aucune facture" description="Les factures de ce client apparaîtront ici." />
            ) : (
              <Card className="gap-0 p-0">
                <Table>
                  <TableCaption>Factures du client</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N°</TableHead>
                      <TableHead>Échéance</TableHead>
                      <TableHead numeric>Total</TableHead>
                      <TableHead numeric>Reste à payer</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>
                          <Link href={routes.invoice(c, i.id)} className="font-mono text-xs text-primary hover:underline">
                            {i.number ?? 'Brouillon'}
                          </Link>
                        </TableCell>
                        <TableCell>{i.status === 'ISSUED' && i.remainingMillimes > 0 ? formatRelativeDue(i.dueDate, today) : formatDate(i.dueDate)}</TableCell>
                        <TableCell numeric>
                          <Amount value={i.totalMillimes} />
                        </TableCell>
                        <TableCell numeric>
                          <Amount value={i.remainingMillimes} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge kind="invoice" status={i.status} settlement={i.settlement} overdue={i.overdue} daysOverdue={i.daysOverdue} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
          <TabsContent value="payments" className="mt-4">
            {payments.length === 0 ? (
              <EmptyState title="Aucun encaissement" description="Les paiements reçus de ce client apparaîtront ici." />
            ) : (
              <Card className="gap-0 p-0">
                <Table>
                  <TableCaption>Encaissements du client</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Facture</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead numeric>Montant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{formatDate(p.date)}</TableCell>
                        <TableCell>
                          <Link href={routes.invoice(c, p.invoiceId)} className="font-mono text-xs text-primary hover:underline">
                            {p.invoiceNumber}
                          </Link>
                          {p.isReversal && (
                            <Badge tone="warning" className="ml-2">
                              Contre-passation
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{PAYMENT_METHOD_LABELS[p.method as PaymentMethod] ?? p.method}</TableCell>
                        <TableCell numeric>
                          <Amount value={p.isReversal ? -p.amountMillimes : p.amountMillimes} signed strike={p.reversed} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Dépenses ({expenses.length})</h2>
          {expenses.length === 0 ? (
            <EmptyState title="Aucune dépense" description="Les dépenses rattachées à ce fournisseur apparaîtront ici." />
          ) : (
            <Card className="gap-0 p-0">
              <Table>
                <TableCaption>Dépenses du fournisseur</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Libellé</TableHead>
                    <TableHead className="hidden md:table-cell">Catégorie</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead numeric>Montant</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <AppLink href={routes.expense(c, e.id)} className="text-primary hover:underline">
                          {e.label}
                        </AppLink>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{EXPENSE_CATEGORY_LABELS[e.category]}</TableCell>
                      <TableCell>{formatDate(e.expenseDate)}</TableCell>
                      <TableCell numeric>
                        <Amount value={e.amountMillimes} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="expense" status={e.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <span aria-hidden className="mt-0.5 text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <div>
        <dt className="sr-only">{label}</dt>
        <dd className="whitespace-pre-line">{value ?? '—'}</dd>
      </div>
    </div>
  );
}
