# CashPilot

Gestion et prévision de trésorerie pour les petites entreprises : factures et encaissements partiels,
dépenses avec circuit de validation, trésorerie réelle (grand livre append-only), prévision à 30/60/90 jours,
simulation « et si… ? » et alertes. Secteur choisi : **agence digitale** (projets, jalons de paiement, rentabilité).

Stack : Next.js 16 (App Router, React 19.2, React Compiler) · TypeScript strict · Turborepo + pnpm ·
Prisma 7 + PostgreSQL 16 · Better Auth · Zod 4 · Tailwind CSS v4 + Radix · Recharts · Vitest · Testcontainers · Playwright.
L’architecture (couches, règle de dépendance, modèle de données, décisions) est décrite dans [ARCHITECTURE.md](ARCHITECTURE.md).

## Installation

Prérequis : Node 22+, pnpm 10 (`corepack enable`), Docker (PostgreSQL et tests d’intégration).

```bash
pnpm install
cp .env.example .env
docker compose up -d          # PostgreSQL 16 sur le port 5433
pnpm db:migrate               # applique les migrations
pnpm db:generate              # génère le client Prisma
pnpm db:seed                  # données de démonstration « Atlas Digital »
pnpm dev                      # http://localhost:3000
```

Avec Prisma 7, `pnpm db:migrate` applique les migrations. Lancez `pnpm db:generate` séparément pour générer le client.

Pour démarrer sans PostgreSQL, définissez `DEMO_IN_MEMORY=1` dans `.env`, puis exécutez `pnpm db:generate` et `pnpm dev`.
L’application charge automatiquement les données de démonstration en mémoire. Les modifications sont perdues au redémarrage.

## Configuration (`.env.example`)

Un seul fichier `.env` à la racine du monorepo. L’environnement est validé au démarrage (`packages/config/src/env.ts`) :
une variable manquante fait échouer le démarrage immédiatement.

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Connexion PostgreSQL (obligatoire sauf `DEMO_IN_MEMORY=1`) |
| `BETTER_AUTH_SECRET` | Secret de session (≥ 32 caractères, `openssl rand -base64 32`) |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` | URL publique de l’application |
| `STORAGE_DIR` | Dossier des justificatifs, **hors de `public/`** (servis uniquement après contrôle d’accès) |
| `APP_TIMEZONE` | Fuseau du « jour courant » métier (`Africa/Tunis`) |
| `DEMO_IN_MEMORY` | `1` = mode démo sans base de données |

## Base de données et données de démonstration

- Schéma : `packages/db/prisma/schema.prisma` (Prisma 7, client généré dans `packages/db/src/generated`).
- `pnpm db:migrate` (développement) / `pnpm db:deploy` (production, étape séparée du démarrage).
- `pnpm db:seed` recrée l’entreprise **Atlas Digital** à chaque exécution (idempotent) **en passant par les cas d’usage** :
  chaque mouvement de trésorerie et chaque entrée du journal sont donc réels. Les dates sont relatives au jour d’exécution.
  Contenu : 6 clients, 3 fournisseurs, 13 factures dans tous les états (brouillons, émises, partiellement payées, payées,
  2 en retard, annulée, encaissement contre-passé), 10 dépenses dans tous les états (dont une auto-approbation tracée),
  3 flux prévus (salaires et loyer mensuels, rentrée attendue), un projet avec jalons et un scénario enregistré.

## Comptes de démonstration

Mot de passe commun : **`CashPilot2026!`**

| Rôle | E-mail | Accueil |
|---|---|---|
| Dirigeant (`OWNER`) | `dirigeant@cashpilot.demo` | Tableau de bord, validation des dépenses, membres |
| Gestionnaire financier (`FINANCE_MANAGER`) | `gestion@cashpilot.demo` | Factures, encaissements, paiements, prévisions |
| Collaborateur (`EMPLOYEE`) | `collab@cashpilot.demo` | « Mes dépenses » (soumission mobile) |

## Scénario de soutenance

Prenez le jour de la démonstration comme **J**, avec les comptes de démonstration disponibles. Créez une nouvelle entreprise
pour partir d’un solde connu et éviter que les flux d’Atlas Digital entrent dans le calcul.

1. **Dirigeant** — Inscrivez-vous avec un nouveau compte et créez une entreprise avec **5 000 DT** de solde initial.
   Dans **Entreprise → Membres**, ajoutez `gestion@cashpilot.demo` comme gestionnaire financier et
   `collab@cashpilot.demo` comme collaborateur. Vérifiez que la trésorerie affiche **5 000 DT**.
2. **Gestionnaire financier** — Connectez-vous avec `gestion@cashpilot.demo` et sélectionnez la nouvelle entreprise.
   Créez un client et validez une facture de **3 000 DT** à 0 % de TVA, avec une échéance à **J+10**.
   Enregistrez un encaissement de **1 000 DT** daté de **J**. La facture passe à **Partiellement payée**,
   le reste à payer est de **2 000 DT** et le solde réel passe à **6 000 DT**.
3. **Collaborateur** — Connectez-vous avec `collab@cashpilot.demo` et sélectionnez la même entreprise.
   Soumettez une dépense de **6 000 DT** avec une catégorie, un justificatif et une échéance à **J+15**.
   Vérifiez qu’elle apparaît comme **Soumise · à valider** dans **Mes dépenses**.
4. **Dirigeant** — Reconnectez-vous avec le compte créé à la première étape. Approuvez la dépense, puis laissez-la
   au statut **Approuvée** pour qu’elle reste dans les décaissements prévus. Le solde réel est toujours de **6 000 DT**.
5. **Dirigeant** — Ouvrez **Prévisions** à 30 jours. Le solde prévu à **J+30** est de **2 000 DT** après avoir ajouté
   les **2 000 DT** à encaisser au solde réel de **6 000 DT** et déduit les **6 000 DT** à décaisser.
6. **Dirigeant** — Dans **Simulations**, ajoutez l’hypothèse **Retarder un encaissement** et décalez la facture
   de **20 jours**, de **J+10** à **J+30**. Comparez les deux courbes, enregistrez le scénario et vérifiez
   que le solde réel reste à **6 000 DT** dans **Trésorerie**.

| Date | Prévision de référence | Scénario avec retard |
|---|---:|---:|
| J | 6 000 DT | 6 000 DT |
| J+10 | 8 000 DT | 6 000 DT |
| J+15 | 2 000 DT | 0 DT |
| J+30 | 2 000 DT | 2 000 DT |

Le retard fait passer le point bas de **2 000 DT** à **0 DT**. Les deux scénarios aboutissent à **2 000 DT** à J+30.
Le [test Playwright de soutenance](apps/web/e2e/soutenance.spec.ts) automatise ce parcours.

## Scripts

| Commande | Effet |
|---|---|
| `pnpm dev` | Serveur de développement (Turbopack) |
| `pnpm build` | Build de production (`output: standalone`) |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | ESLint, TypeScript, Vitest sur tous les paquets |
| `pnpm test:e2e` | Playwright (soutenance, permissions, flux dépense, mobile 375 px, accessibilité axe) |
| `pnpm depcruise` | Vérifie la règle de dépendance entre couches |
| `pnpm verify` | lint + typecheck + test + build + depcruise (ce que fait la CI) |
| `pnpm db:generate` / `db:migrate` / `db:deploy` / `db:seed` | Prisma |

Tests par couche : domaine (calculs, transitions, test « golden » du sujet), cas d’usage (faux en mémoire : permissions,
isolation entre entreprises, codes d’erreur), infrastructure (PostgreSQL réel via Testcontainers : rollback, audit
transactionnel, unicité du grand livre, numérotation sans trou sous concurrence), E2E. Les noms de tests reprennent
les critères de validation du sujet (ex. `rejects payment > remaining with INVOICE_OVERPAID`).

## Déploiement

- **URL de production : à compléter** (cible à choisir par l’équipe : Vercel + PostgreSQL managé, ou Docker).
- **Vercel** : racine `apps/web`, variables d’environnement ci-dessus, `pnpm db:deploy` lancé comme étape séparée
  (stockage des justificatifs à remplacer par un stockage objet : le port `FileStorage` le permet sans toucher au métier).
- **Docker** : `docker build -t cashpilot .` puis `docker run --env-file .env cashpilot migrate` et
  `docker run -p 3000:3000 --env-file .env -v cashpilot-storage:/app/storage cashpilot`.
- Sonde : `GET /api/health`. Retour arrière : redéployer l’image précédente (les migrations sont additives).
  Sauvegarde : `pg_dump` planifié de la base ; restauration testée avec `pg_restore` sur une base vide.

## Utilisation de l’IA et de ressources externes (déclaration obligatoire)

- **Assistant IA** : ce dépôt a été produit avec l’aide de **Claude (Anthropic) via Claude Code**, à partir du plan
  `PLAN.md` et des règles d’architecture, de domaine et de design fournies. L’équipe doit relire, comprendre et savoir
  modifier chaque partie du code : il sera expliqué et modifié en direct pendant la soutenance.
- **Ressources externes** : documentation officielle de Next.js, React, Prisma, Better Auth, Zod, Tailwind CSS,
  Radix UI / shadcn/ui (patrons des composants primitifs), Recharts, Playwright et dependency-cruiser ;
  supports de cours « Introduction à React et aux Hooks » et « Next.js, Clean Architecture et Monorepo ».
- Aucune intégration bancaire : les opérations financières sont enregistrées ou simulées, conformément au sujet.
