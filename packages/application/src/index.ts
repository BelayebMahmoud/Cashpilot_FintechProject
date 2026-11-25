// Public API of @cashpilot/application: use cases, ports, DTOs and Result.
import { type Deps } from './shared/deps';
import * as company from './company/company-use-cases';
import * as parties from './parties/party-use-cases';
import * as invoices from './invoices/invoice-use-cases';
import * as payments from './payments/payment-use-cases';
import * as expenses from './expenses/expense-use-cases';
import * as treasury from './treasury/treasury-use-cases';
import * as forecast from './forecast/forecast-use-cases';
import * as simulation from './simulation/simulation-use-cases';
import * as dashboard from './dashboard/dashboard-use-cases';
import * as audit from './audit/audit-use-cases';
import * as projects from './projects/project-use-cases';

export type { Actor } from './shared/actor';
export type { Deps } from './shared/deps';
export { ok, fail, attempt, unwrap, paginate, PAGE_SIZE, type Result, type Page } from './shared/result';
export type * from './ports';
export { RepositoryForecastReadModel } from './forecast/repository-read-model';

export type { CompanyDto, MyCompany, CreateCompanyInput } from './company/company-use-cases';
export type { PartyDto, PartyDetailDto, PaymentRowDto, ListPartiesInput } from './parties/party-use-cases';
export type { InvoiceSummaryDto, InvoiceDetailDto, PaymentDto } from './invoices/invoice-dto';
export { INVOICE_TABS, type InvoiceTab, type InvoiceListDto, type InvoiceDraftInput, type ListInvoicesInput } from './invoices/invoice-use-cases';
export type { PaymentListRow, RecordPaymentInput } from './payments/payment-use-cases';
export type { ExpenseDto } from './expenses/expense-dto';
export { EXPENSE_TABS, type ExpenseTab, type ExpenseListDto, type ExpenseInput, type ReceiptUpload } from './expenses/expense-use-cases';
export type { TreasuryDto, LedgerRowDto, TreasuryInput } from './treasury/treasury-use-cases';
export type { ForecastDto, PlannedFlowDto, WeekRow } from './forecast/forecast-use-cases';
export type { SimulationDto, ScenarioDto, SimulationInput } from './simulation/simulation-use-cases';
export type { DashboardDto, AlertDto } from './dashboard/dashboard-use-cases';
export type { ListAuditInput } from './audit/audit-use-cases';
export type { ProjectSummaryDto, ProjectDetailDto, ProjectInputDto } from './projects/project-use-cases';

/**
 * Builds every use case from the adapters. Called once by the composition root
 * (apps/web/src/container) — plain constructor injection, no DI framework.
 */
export function createUseCases(deps: Deps) {
  return {
    // Entreprise et accès
    createCompany: new company.CreateCompany(deps),
    listMyCompanies: new company.ListMyCompanies(deps),
    resolveActor: new company.ResolveActor(deps),
    getCompany: new company.GetCompany(deps),
    updateCompanySettings: new company.UpdateCompanySettings(deps),
    listMembers: new company.ListMembers(deps),
    addMember: new company.AddMember(deps),
    changeRole: new company.ChangeRole(deps),
    removeMember: new company.RemoveMember(deps),
    // Clients et fournisseurs
    createParty: new parties.CreateParty(deps),
    updateParty: new parties.UpdateParty(deps),
    archiveParty: new parties.ArchiveParty(deps),
    listParties: new parties.ListParties(deps),
    getPartyDetail: new parties.GetPartyDetail(deps),
    // Facturation
    createInvoiceDraft: new invoices.CreateInvoiceDraft(deps),
    updateInvoiceDraft: new invoices.UpdateInvoiceDraft(deps),
    deleteInvoiceDraft: new invoices.DeleteInvoiceDraft(deps),
    validateInvoice: new invoices.ValidateInvoice(deps),
    cancelInvoice: new invoices.CancelInvoice(deps),
    listInvoices: new invoices.ListInvoices(deps),
    getInvoice: new invoices.GetInvoice(deps),
    renderInvoicePdf: new invoices.RenderInvoicePdf(deps),
    // Encaissements
    recordPayment: new payments.RecordPayment(deps),
    reversePayment: new payments.ReversePayment(deps),
    listPayments: new payments.ListPayments(deps),
    // Dépenses + validation
    createExpense: new expenses.CreateExpense(deps),
    updateExpenseDraft: new expenses.UpdateExpenseDraft(deps),
    attachReceipt: new expenses.AttachReceipt(deps),
    submitExpense: new expenses.SubmitExpense(deps),
    withdrawExpense: new expenses.WithdrawExpense(deps),
    approveExpense: new expenses.ApproveExpense(deps),
    rejectExpense: new expenses.RejectExpense(deps),
    markExpensePaid: new expenses.MarkExpensePaid(deps),
    reverseExpensePayment: new expenses.ReverseExpensePayment(deps),
    listExpenses: new expenses.ListExpenses(deps),
    getExpense: new expenses.GetExpense(deps),
    getReceipt: new expenses.GetReceipt(deps),
    // Trésorerie
    getTreasury: new treasury.GetTreasury(deps),
    recordAdjustment: new treasury.RecordAdjustment(deps),
    getBalanceHistory: new treasury.GetBalanceHistory(deps),
    // Prévisions
    getForecast: new forecast.GetForecast(deps),
    createPlannedFlow: new forecast.CreatePlannedFlow(deps),
    cancelPlannedFlow: new forecast.CancelPlannedFlow(deps),
    listPlannedFlows: new forecast.ListPlannedFlows(deps),
    // Simulation
    simulateScenario: new simulation.SimulateScenario(deps),
    saveScenario: new simulation.SaveScenario(deps),
    listScenarios: new simulation.ListScenarios(deps),
    getScenario: new simulation.GetScenario(deps),
    duplicateScenario: new simulation.DuplicateScenario(deps),
    deleteScenario: new simulation.DeleteScenario(deps),
    // Alertes et dashboard
    getAlerts: new dashboard.GetAlerts(deps),
    dismissAlert: new dashboard.DismissAlert(deps),
    getDashboard: new dashboard.GetDashboard(deps),
    // Traçabilité
    listAuditEntries: new audit.ListAuditEntries(deps),
    // Secteur : agence digitale
    createProject: new projects.CreateProject(deps),
    updateProject: new projects.UpdateProject(deps),
    addMilestone: new projects.AddMilestone(deps),
    removeMilestone: new projects.RemoveMilestone(deps),
    closeProject: new projects.CloseProject(deps),
    listProjects: new projects.ListProjects(deps),
    getProject: new projects.GetProject(deps),
  };
}

export type UseCases = ReturnType<typeof createUseCases>;
