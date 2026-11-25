# Architecture de CashPilot

## Couches (clean architecture, monorepo Turborepo)

```
 apps/web  (Next.js — PRÉSENTATION)          pages serveur · server actions · route handlers (PDF, justificatifs)
   │  src/container ── seul point qui instancie les adaptateurs (Prisma ou mémoire)
   ▼
 packages/application   cas d'usage · ports · DTO · Result         ◄── faux en mémoire (tests, DEMO_IN_MEMORY)
   ▼
 packages/domain        entités riches · Money · LocalDate · politiques d'accès · moteur de prévision (pur, 0 dépendance)

 packages/infra  ── implémente les ports : dépôts Prisma, unité de travail, grand livre, Better Auth, React-PDF, stockage
 packages/db     ── schéma Prisma 7, migrations, client      packages/ui ── design system (props simples, aucun métier)
```

**Règle de dépendance** (vérifiée en CI par `pnpm depcruise`, `.dependency-cruiser.cjs`) :
`domain` n’importe rien (ni Prisma, ni Next, ni React, ni Zod) · `application` → `domain` uniquement ·
`infra` → `application`, `domain`, `db` · `apps/web` → `domain` (fonctions pures), `application`, `ui`, et `infra`
**uniquement depuis `src/container`** · `ui` n’importe aucun code métier · aucune dépendance circulaire.

Chemin d’une mutation : formulaire → server action `action(schéma, handler)` (session + appartenance → `Actor`,
validation Zod de forme, traduction des codes d’erreur en français) → cas d’usage (`assertCan` + filtrage `companyId`
+ transaction `uow.run` + entrée d’audit) → entité (invariants) → dépôts → `revalidatePath`.
Les pages sont des Server Components qui appellent directement les cas d’usage (jamais leur propre `/api`).

## Modèle de données (PostgreSQL, `packages/db/prisma/schema.prisma`)

`Company` 1─n `Membership` n─1 `User` (rôle `OWNER | FINANCE_MANAGER | EMPLOYEE`) · `Party` (CLIENT/SUPPLIER, archivé
jamais supprimé) · `Invoice` 1─n `InvoiceLine`, 1─n `Payment` (`reversesId` unique) · `InvoiceCounter (companyId, year)` ·
`Expense` (machine à états, justificatif) · `CashMovement` (grand livre, `@@unique(sourceType, sourceId)`, `seq`) ·
`PlannedFlow` · `Scenario` (hypothèses en JSON, table isolée) · `AuditEntry` · `AlertDismissal` · `Project` 1─n `Milestone`.
Toutes les tables métier portent `companyId` et un index qui commence par lui ; chaque méthode de dépôt exige `companyId`
(un identifiant d’une autre entreprise renvoie `NOT_FOUND`, jamais `FORBIDDEN`).

## Décisions clés

1. **Argent en millimes entiers** (`Money`, 1 DT = 1 000) : `BigInt` en base, entier sûr en mémoire ; seul `mulRatio`
   arrondit (demi supérieur, calcul en BigInt). TVA arrondie par ligne puis sommée. L’UI formate en fr-TN.
2. **Dates calendaires** (`LocalDate`, `@db.Date`) ; « aujourd’hui » vient du port `Clock` en `Africa/Tunis`.
3. **Grand livre append-only** : aucune mise à jour ni suppression ; corrections par contre-passation ou mouvement manuel
   motivé. `(sourceType, sourceId)` unique → une opération n’affecte le solde réel qu’une fois (clé d’idempotence côté formulaire).
4. **Statuts dérivés** : seuls `DRAFT | ISSUED | CANCELLED` sont stockés ; payée/partielle/en retard sont calculés.
5. **Numérotation sans trou** `FAC-AAAA-NNNN` : compteur incrémenté par `INSERT … ON CONFLICT DO UPDATE` dans la
   transaction de validation ; verrou de ligne (`FOR UPDATE`) sur la facture contre les paiements concurrents.
6. **Prévision pure** : `buildBaselineFlows → project → explainPoint` (restant dû uniquement, retards reportés ou exclus,
   dépenses en attente incluses par défaut, horizon inclusif). Chaque point est explicable.
7. **Isolation des scénarios** : la simulation ne dépend que d’un port de lecture et du dépôt de scénarios ; le navigateur
   recalcule en direct avec les mêmes fonctions du domaine, le serveur recalcule à l’enregistrement.
8. **Autorisation** : politique pure `can(actor, permission, ressource)` appliquée dans chaque cas d’usage ; le proxy ne fait
   que rediriger sans session, le layout `[company]` revérifie l’appartenance (défense en profondeur). Le dirigeant peut
   approuver sa propre dépense (cas d’une entreprise à un seul dirigeant), marqué `selfApproved` et audité.
9. **Fonctionnalité sectorielle (agence digitale)** : projets, jalons non facturés injectés dans la prévision, marge = facturé HT − dépenses engagées.
