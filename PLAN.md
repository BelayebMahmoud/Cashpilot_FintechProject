# CashPilot: implementation plan for Claude Code

The whole application is built in one pass, in dependency order: shared foundations first, then the brief's 10 modules, then delivery. Each phase is one branch and one PR, and the phase stays open until its **Done when** checks pass.

**Sources of truth.** The rules live in the skills in `.claude/skills/`, so this plan doesn't repeat them:
- `cashpilot-architecture`: layers, monorepo, Next.js/React rules, tests, CI
- `cashpilot-finance-domain`: business rules, calculations, permissions, golden test
- `cashpilot-design-system`: tokens, components, screens, states, copy, accessibility

## How to execute each phase

1. Read the phase and load the skills it lists.
2. State in 2 lines which files you'll touch, in order: domain → application → infra → web.
3. Implement in that order. Each layer's tests are written in the same phase.
4. Run `pnpm verify` (lint + typecheck + test + depcruise + build). Everything must pass.
5. Commit with Conventional Commits (`feat(invoices): …`), tick the phase's checkboxes here, and summarize in 3 bullets: what it does, where the rule lives, how to test it.
6. Stop and ask only for the team's sector (P13), the deployment target (P15) and secrets. Every other choice is already made in the skills.

## Parallel tracks (optional, via git worktrees)

```
P0 ─ P1 ─ P2 ─┬─ P4 ─┬─ P5 ─ P6 ─ P7 ─┐
              │      └─ P8 ───────────┼─ P9 ─ P10 ─ P11 ─ P12 ─ P13 ─ P14 ─ P15
P0 ─ P3 ──────┘   (P10 domain engine can start right after P1: pure code)
```

## Environment variables (`.env.example`)

`DATABASE_URL` · `BETTER_AUTH_SECRET` · `BETTER_AUTH_URL` · `NEXT_PUBLIC_APP_URL` · `STORAGE_DIR` (receipts, outside `public/`) · `APP_TIMEZONE=Africa/Tunis`

---

## P0: Monorepo skeleton
Skills: architecture

- [x] Root setup:
  - `package.json` (private, `packageManager: pnpm@10`), with scripts `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `db:generate`, `db:migrate`, `db:seed`, `depcruise`, and `verify` (which chains all checks)
  - `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `.nvmrc` (22), `.gitignore`, Prettier
- [x] `turbo.json`:
  - tasks `build` (`^build`, depends on `@cashpilot/db#db:generate`), `lint`, `typecheck`, `test`
  - `test:e2e`, and `dev` (`cache:false`, `persistent:true`)
  - declare the `env` list
- [x] `docker-compose.yml`: `postgres:16` with a volume and a healthcheck.
- [x] `packages/config`:
  - `tsconfig/{base,library,next}.json` (strict, `noUncheckedIndexedAccess`)
  - `eslint/{base,next}.js` (flat config, react-hooks plugin)
  - `vitest/preset.ts`
  - `src/env.ts` (zod, fails at boot)
- [x] `packages/{domain,application,infra,db,ui}`: `package.json` with `exports → ./src/index.ts`, `workspace:*` deps per the dependency table, `tsconfig.json`, `vitest.config.ts`, and one smoke test each.
- [x] `apps/web` (Next.js 16, App Router, `src/`, Turbopack, Tailwind v4):
  - `next.config.ts` with `transpilePackages`, `reactCompiler: true`, `typedRoutes: true`
  - a placeholder home page
- [x] `.dependency-cruiser.cjs` with the five rules from the skill.
- [x] `.github/workflows/ci.yml`: install `--frozen-lockfile`, then `turbo run lint typecheck test build`, then `depcruise`.

**Done when:** a fresh clone runs `pnpm i && docker compose up -d && pnpm verify` green, and `pnpm dev` serves the placeholder page. Add a deliberate import from `domain` → `@prisma/client`, confirm depcruise fails, then remove it.

## P1: Domain kernel (shared by every module)
Skills: architecture, finance-domain §1–2

- [x] `domain/shared`:
  - `Money` (`ofMillimes`, `parse`, `add`, `subtract`, `negate`, `compare`, `min`, `isZero`, `isNegative`, `mulRatio` half-up via BigInt, `toJSON` → number)
  - `LocalDate` (`parse`, `addDays`, `diffDays`, `compare`, `isBefore`, `max`, `toString`)
  - typed `Id` helper, `DomainError` base, `ErrorCode` union
- [x] `domain/access`: `Role` (`OWNER`, `FINANCE_MANAGER`, `EMPLOYEE`), the `Permission` union, `can(actor, permission, resource?)` implementing the matrix (OWNER may approve their own expenses), and `assertCan` → `Forbidden`.
- [x] `application/shared`: `Result`, `ok()`, `fail()`, the `Actor` type, and the `Clock` and `IdGenerator` ports.
- [x] Tests:
  - `Money.parse`: `"1 234,5"`, `"1234.500"`, `"-20"`, `"1,005"`, `"abc"`, `"1.0001"`, `""`
  - `mulRatio` rounding, including negatives
  - `LocalDate` across month and year boundaries
  - "today" in Africa/Tunis from a fixed instant at 23:30 UTC
  - the full permission matrix (every role × permission)

**Done when:** coverage of `domain/shared` and `domain/access` is ≥ 95 %.

## P2: Persistence & app plumbing
Skills: architecture, finance-domain §3 (Prisma essentials)

- [x] `packages/db`:
  - the **complete** `schema.prisma`, with all models and enums for every module: Company, Membership, User/Session/Account (Better Auth), Party, Invoice, InvoiceLine, InvoiceCounter, Payment, Expense, CashMovement, PlannedFlow, Scenario, AuditEntry, AlertDismissal, plus the P13 sector tables once known
  - `prisma.config.ts`, a client singleton with `@prisma/adapter-pg`, the initial migration, and a seed stub
- [x] `application/ports`: every repository port (invoices, parties, expenses, ledger, plannedFlows, scenarios, companies, memberships), `UnitOfWork`, `AuditLog`, `FileStorage`, `InvoicePdfRenderer`, `ForecastReadModel`.
- [x] `application/test/fakes`: `InMemoryUnitOfWork` (all repositories, with copy-on-commit rollback), `FixedClock`, `SequentialIds`.
- [x] `infra`:
  - `PrismaUnitOfWork` (`$transaction`), `SystemClock` (Africa/Tunis), `UuidGenerator`
  - `PrismaAuditLog`, the bigint↔number mapper helper
  - `LocalFileStorage` (outside `public/`, random keys)
  - Testcontainers helper `withTestDb()`
- [x] `apps/web`:
  - `src/container/index.ts` (composition root)
  - `src/lib/action.ts` (`action(schema, handler)`: actor → `safeParse` → `fieldErrors` → code→message map)
  - `src/lib/errors.ts` (French messages for every `ErrorCode`)

**Done when:** infra tests prove that a transaction which throws persists nothing, that an audit entry is written inside the same transaction, and that the bigint mapper rejects unsafe integers.

## P3: Design system & app shell (parallel with P2)
Skills: design-system

- [x] `packages/ui`:
  - `globals.css` (exact tokens from the skill), shadcn monorepo init (`components.json` mirrored in web)
  - all listed primitives, `lib/format.ts` (`formatMoney`, `formatDate`, `formatRelativeDue`, `compactMoney`)
- [x] Composites: Amount, MoneyInput, DateField, StatusBadge (invoice and expense maps), KpiCard, RunwayGauge, PageHeader, FilterBar (URL-synced), DataTable (server pagination, `mobileCard`), EmptyState, ErrorState, ConfirmDialog (optional reason), FileDropzone, AlertItem.
- [x] `apps/web` shell:
  - Geist fonts, `ThemeProvider` (next-themes), Toaster, root layout + skip link
  - `(auth)` layout
  - `(app)/[company]/layout.tsx` with Sidebar (collapsible, mobile Sheet, nav config filtered by role), Topbar (company switcher, ⌘K palette, "Nouveau" menu, alerts bell, theme, user menu)
- [x] Placeholder route per module with `page.tsx` (EmptyState), `loading.tsx` (skeleton), `error.tsx`, and a global `not-found.tsx`.
- [x] Tests: `formatMoney` → `1 234,500 DT`, negative and compact forms; MoneyInput parse/blur; StatusBadge renders icon + text.

**Done when:** every nav route renders in light and dark, at 375 px and 1440 px, and is usable by keyboard.

## P4: Module "Entreprise et accès" (company, members, permissions)
Skills: all three

- [x] Auth: Better Auth (email + password, Prisma adapter) in `infra/auth`, exposed only through a `SessionReader` used by `getActor()`. `src/proxy.ts` redirects unauthenticated `/(app)` requests to `/login`.
- [x] Domain: `Company` (name, slug, sector, openingBalance, openingDate, settings) and `Membership` (role changes; last-owner guard). Ledger: `CashMovement` with `fromOpening`.
- [x] Use cases:
  - `CreateCompany` (creator = OWNER plus the OPENING movement, all in one transaction, audited)
  - `ListMyCompanies`, `ResolveActor(userId, slug)` (non-member → NOT_FOUND)
  - `AddMember(email, role)`, `ChangeRole`, `RemoveMember`, `UpdateCompanySettings`
- [x] Web:
  - `/register` and `/login`
  - `/onboarding` ("Créer votre entreprise": name, sector, opening balance, opening date)
  - `[company]/layout` membership check, company switcher
  - `settings/members` (table, add dialog, role select, remove with ConfirmDialog)
  - `settings` (company info)
- [x] Tests: last owner can't be removed or demoted; the opening movement is created exactly once; cross-tenant ResolveActor; EMPLOYEE is refused on members management.

**Done when:** you can register, create a company with 5 000 DT, invite two accounts with different roles, and confirm that the sidebar differs per role.

## P5: Module "Clients et fournisseurs" (clients and suppliers)
Skills: all three

- [x] Domain: `Party` (kind, name ≥ 2, email/phone format, address, taxId (matricule fiscal), notes, archived). It's archived rather than deleted when referenced.
- [x] Use cases: `CreateParty`, `UpdateParty`, `ArchiveParty`, `ListParties(kind, q, page)`, `GetPartyDetail`.
  - Client detail: invoices with remaining amounts, payment history, and totals (invoiced, received, outstanding, overdue).
  - Supplier detail: expenses and total paid.
- [x] Web:
  - `/clients` and `/suppliers` (DataTable with URL search, create/edit in a Sheet)
  - detail page: contact card, KPI row, tabs "Factures" / "Encaissements" or "Dépenses"
- [x] Tests: validation, archive rules, tenant scoping, detail totals from known data.

## P6: Module "Facturation" (invoicing)
Skills: all three

- [x] Domain: `Invoice` + `InvoiceLine`.
  - `computeTotals` (per-line VAT rounding) is exported pure, for the editor.
  - Actions: draft, `updateDraft`, `validate(number)`, `cancel(reason)`.
  - Derived values: settlement, `overdue`, `remaining`. Plus the `InvoiceNumber` value object.
- [x] Use cases: `CreateInvoiceDraft`, `UpdateInvoiceDraft`, `DeleteInvoiceDraft`, `ValidateInvoice` (InvoiceCounter in the same transaction), `CancelInvoice`, `ListInvoices` (tab, client, q, due range, page), `GetInvoice`, `RenderInvoicePdf`.
- [x] Infra: `PrismaInvoiceRepository` (lines, atomic counter increment) and `ReactPdfInvoiceRenderer` (company header, lines, VAT summary, total, remaining, "ANNULÉE" watermark).
- [x] Web:
  - `/invoices` (status tabs, filters)
  - `/invoices/new` and `/[id]/edit` (editor with a `useReducer` line editor and live totals from `computeTotals`)
  - `/invoices/[id]` (header, payment progress, timeline, actions)
  - `api/invoices/[id]/pdf/route.ts` (actor + use case, `Content-Disposition`)
- [x] Tests:
  - totals and VAT rounding table
  - transitions (editing after validation is refused; cancelling with payments → `INVOICE_HAS_PAYMENTS`)
  - numbering gapless, including a concurrent infra test (2 parallel validations → 0001 and 0002)
  - the PDF route refuses another tenant

## P7: Module "Encaissements" (incoming payments)
Skills: all three

- [x] Domain: `Invoice.recordPayment(amount, date, today)` and `reversePayment(paymentId, reason)`, plus `Payment`.
- [x] Use cases: `RecordPayment` (Payment + IN movement + audit, one transaction), `ReversePayment` (counter-entry + OUT movement), `ListPayments(filters, page)`.
- [x] Web:
  - the "Enregistrer un encaissement" dialog on the invoice detail ("Solder" chip, max = remaining, future dates disabled)
  - the payments timeline with reversals
  - a `/payments` list page (Opérations nav)
- [x] Tests, mapped to the brief's acceptance criteria:
  - a partial payment reduces the remaining amount
  - overpaying → `INVOICE_OVERPAID`
  - a retried action keeps the balance unchanged (ledger unique constraint)
  - a reversal keeps the original and writes an audit entry
  - a payment on a DRAFT or CANCELLED invoice is refused

## P8: Modules "Dépenses" + "Validation des dépenses" (expenses and their approval)
Skills: all three

- [x] Domain: the `Expense` state machine and fixed categories (Loyer, Salaires, Fournitures, Logiciels & abonnements, Marketing, Déplacements, Sous-traitance, Impôts & taxes, Autre). Self-approval sets `selfApproved`.
- [x] Use cases:
  - `CreateExpenseDraft`, `UpdateExpenseDraft`, `AttachReceipt` (MIME + 5 MB check, FileStorage)
  - `SubmitExpense`, `WithdrawExpense`
  - `ApproveExpense`, `RejectExpense(reason)`
  - `MarkExpensePaid` (OUT movement), `ReverseExpensePayment`
  - `ListExpenses` (EMPLOYEE: own only), `GetExpense`, `GetReceipt`
- [x] Web:
  - `/expenses/mine` (mobile-first cards plus a status timeline)
  - `/expenses/new` (amount, category chips, date, receipt with camera)
  - `/expenses/approvals` (OWNER master/detail, receipt preview, J/K/A/R shortcuts)
  - `/expenses` (finance view, "À payer" tab, "Marquer comme payée" dialog)
  - receipt route handler with an auth check
- [x] Tests:
  - a REJECTED expense can't be paid
  - an EMPLOYEE can't read others' expenses
  - a reason is required to reject
  - self-approval is audited with the flag
  - an invalid file type or size is refused

## P9: Module "Trésorerie" (treasury)
Skills: all three

- [x] Use cases:
  - `GetTreasury`: real balance today, plus movements with a running balance (`balanceAt(day before first row)` + cumulative), filters by date, source and direction, paginated
  - `RecordAdjustment(direction, amount, date, reason)`
  - `GetBalanceHistory(days)`
- [x] Web: `/treasury` (balance header, a 90-day real-balance mini chart, the ledger table with source links and reversal badges, a "Mouvement manuel" dialog for finance). No edit or delete actions anywhere.
- [x] Tests:
  - the balance after a sequence (opening + 2 payments + 1 reversal + 1 expense paid + 1 adjustment) equals the hand-computed value
  - no movement is allowed before the opening date
  - the running balance is correct across pages

## P10: Module "Prévisions" (forecasts)
Skills: all three (+ `dataviz` for the chart)

- [x] Domain `forecast/`: `buildBaselineFlows`, `project` (inclusive horizon), and `explainPoint`. `PlannedFlow` handles MONTHLY expansion.
- [x] Application:
  - `ForecastReadModel` port (real balance, open receivables with remaining, open payables, planned flows)
  - `GetForecast(horizon, assumptions)`
  - `CreatePlannedFlow`, `CancelPlannedFlow`, `ListPlannedFlows`
- [x] Infra: `PrismaForecastReadModel`, built from a few aggregated queries.
- [x] UI:
  - `ForecastChart` (step line, zero line, shortfall areas, today marker, tooltip, aria summary, "Voir les données" table) and `ExplanationPanel` in `packages/ui`
  - `/forecast` (30/60/90 toggle, assumption chips, chart, explanation for the clicked day, weekly flows table)
  - "Flux prévus" tab for managing planned flows
- [x] Tests:
  - the **golden baseline**
  - remaining-only after a partial payment
  - both overdue policies
  - the pending-expenses toggle
  - MONTHLY recurrence across the horizon
  - 31 points for 30 days

## P11: Module "Simulation" (what-if scenarios)
Skills: all three

- [x] Domain: the `Adjustment` union, `applyAdjustments` (pure, new array), and `compare` (deltas for min, first negative date, autonomy, end balance, shortfalls).
- [x] Application:
  - `SimulateScenario` and `SaveScenario`, which depend on the read model + ScenarioRepository only
  - `ListScenarios`, `GetScenario`, `DuplicateScenario`, `DeleteScenario` (scenarios are not financial operations)
- [x] Web:
  - `/simulations` (list), plus `/simulations/new` and `/[id]` with the three-zone layout
  - a `useReducer` of adjustments, recomputed live on the client with domain functions + `useDeferredValue`
  - the comparison strip, the permanent "aucune donnée réelle n'est modifiée" banner, and a save action
- [x] Tests:
  - the **golden simulation** (shortfall 12-16 → 12-30, −1 000 DT)
  - isolation: invoice and ledger snapshots are deep-equal after simulate and save
  - unknown target → `ADJUSTMENT_TARGET_NOT_FOUND`
  - reducer unit tests

## P12: Module "Alertes et dashboard" (alerts and dashboard)
Skills: all three

- [x] Application: `GetAlerts(actor)` (the 4 derived rules, filtered by role), `DismissAlert(key)`, `GetDashboard` (KPIs, runway, 90-day forecast summary, top-5 overdue, pending approvals).
- [x] Web:
  - `/dashboard` (KPI row + RunwayGauge, forecast chart + alerts, overdue table, approvals; each widget in `<Suspense>`)
  - `/alerts`, the Topbar bell count
  - EMPLOYEE home redirects to `/expenses/mine`
- [x] Tests: each alert rule with boundary dates (due today, due in 7 days, overdue by 1 day); role filtering; the dashboard KPIs from a known dataset.

## P13: Sector feature (required by the brief)
Skills: finance-domain §8

- [x] **Ask the team for its sector.** If there's no answer, implement the default for a **digital agency**: `Project`, linked to a client, invoices and expenses.
  - budget, and margin = invoiced HT − expenses
  - milestones as planned receivables feeding the forecast
  - `/projects` list and detail with a profitability KPI
- [x] Domain, use cases, UI and tests, following the same pattern as every other module.

## P14: Traceability & hardening
Skills: architecture, finance-domain

- [x] `settings/audit`: a filterable audit log (actor, action, entity, date) with before/after diffs, for OWNER and FINANCE.
- [x] Sweep every server action and route handler for zod + actor + permission + tenant + transaction + audit. Add a test that lists all actions, so none is missed.
- [x] Security:
  - receipts are never public
  - security headers in `next.config.ts`
  - login rate limiting (Better Auth)
  - sanitized error messages, structured logs with a request id (`Logger` port)
- [x] Accessibility: `@axe-core/playwright` on every main page, with zero serious violations.

## P15: Seed, end-to-end tests, documentation, deployment
Skills: all three

- [x] Write `seed.ts` exactly as the finance skill §7 specifies: Atlas Digital, 3 demo accounts, every state covered, idempotent, dates relative to the run date.
- [x] Playwright:
  - `soutenance.spec.ts`: the brief's full defense scenario
  - `permissions.spec.ts`: EMPLOYEE can't reach invoices or treasury; cross-company URL → 404
  - `expense-flow.spec.ts`
  - `mobile.spec.ts` at 375 px
- [x] `README.md`: install, configuration, DB + seed, demo accounts, scripts, deployed URL, **AI and external-resource usage disclosure**.
- [x] `ARCHITECTURE.md`: one page.
- [ ] Deploy: Vercel (root `apps/web`) + a managed Postgres, or Docker `standalone`. `prisma migrate deploy` runs as its own step. **Ask the target.**
- [ ] Final checklist (from the course): env validated at boot, CI green, depcruise green, every server action validated and authorized, rendering strategy chosen per page, logs and error tracking, DB backup tested, rollback documented, Web Vitals budget met.

---

## Definition of done (whole project)

- All 10 modules work end-to-end for the three roles.
- Each of the brief's 9 acceptance criteria has a passing test with the name the finance skill gives it.
- The golden forecast and simulation tests pass exactly.
- `pnpm verify` and Playwright pass in CI, and depcruise reports 0 violations.
- Every data view has loading, empty and error states, works at 375 px, and passes keyboard and axe checks in light and dark.
- The README and ARCHITECTURE.md are the only docs. The demo data matches the defense scenario.
