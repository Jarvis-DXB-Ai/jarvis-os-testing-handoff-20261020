import "server-only";

import {
  clientBrainV2ServerClient as db,
  isUuid,
} from "@/lib/client-brain-v2-server-core";
import {
  isAllocationScope,
  isExpenseCategory,
  isFinanceDisplayMode,
  isIncomeType,
  isPaymentStatus,
  isPipelineStage,
  isSubscriptionCategory,
  isSubscriptionCycle,
  isSubscriptionStatus,
  isUpcomingRevenueStatus,
  monthlyCost,
  type CostSubscription,
  type FinanceBankStatement,
  type FinanceBankTransaction,
  type FinanceCapitalPolicy,
  type FinanceExpense,
  type FinanceFxRate,
  type FinanceIncome,
  type FinanceInvoice,
  type FinanceInvoiceAttachment,
  type FinanceInvestment,
  type FinanceOwnerDraw,
  type FinancePipelineRecord,
  type FinanceReceivable,
  type FinanceSettings,
  type FinanceSnapshot,
  type FinanceUpcomingRevenue,
  type PersonalExpense,
  type UsageCostRow,
} from "@/lib/finance-costs";

export class FinanceCostsError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const subscriptionColumns =
  "id,source_key,vendor,plan_name,category,currency,amount,billing_cycle,start_date,next_renewal_date,status,allocation_scope,client_id,notes,documentation_url,source_provenance,billing_day,billing_date_known,base_amount,discount_percent,discount_temporary,discount_end_date,fx_snapshot,created_at,updated_at";
const incomeColumns =
  "id,source_key,client_id,counterparty_name,description,income_type,net_amount,currency,vat_rate,vat_amount,gross_amount,vat_applicable,billing_cycle,start_date,end_date,next_billing_date,due_date,payment_date,payment_status,active,notes,created_at,updated_at";
const expenseColumns =
  "id,source_key,client_id,client_allocation_name,vendor,description,category,net_amount,currency,vat_rate,vat_amount,gross_amount,billing_cycle,expense_date,start_date,end_date,active,payment_status,payment_date,billing_day,next_deduction_date,source_provenance,source_reference,fx_snapshot,notes,created_at,updated_at";
const receivableColumns =
  "id,source_key,client_id,debtor_name,description,amount,currency,status,source_reference,notes,created_at,updated_at";
const fxColumns =
  "id,rate_date,base_currency,quote_currency,rate,source,source_url,fetched_at";
const ownerDrawColumns =
  "id,amount,currency,status,business_period_start,paid_at,notes,created_at,updated_at";
const personalExpenseColumns =
  "id,name,category,amount,currency,recurrence,expense_date,active,notes,created_at,updated_at";
const settingColumns =
  "id,source_currency,display_currency,aed_eur_rate,rate_source,rate_effective_at,created_at,updated_at";
const upcomingRevenueColumns =
  "id,source_key,client_id,counterparty_name,description,net_amount,currency,vat_rate,vat_amount,gross_amount,vat_applicable,billing_cycle,expected_start_date,status,notes,activated_income_id,created_at,updated_at";
const pipelineColumns =
  "id,source_key,client_id,name,description,stage,stage_detail,net_amount,currency,vat_rate,vat_amount,gross_amount,vat_applicable,billing_cycle,expected_start_date,probability,notes,created_at,updated_at";
const invoiceColumns =
  "id,source_key,income_record_id,client_id,counterparty_name,title,invoice_number,invoice_month,amount,currency,invoice_available_date,sent_at,due_at,paid_at,paid_amount,payment_reference,notes,provenance,created_at,updated_at";
const invoiceAttachmentColumns =
  "id,invoice_id,client_id,storage_bucket,storage_path,file_name,mime_type,byte_size,created_at";
const investmentColumns =
  "id,source_key,name,category,estimated_amount,currency,classification,priority,desired_purchase_date,status,allocated_amount,notes,source_provenance,created_at,updated_at";
const capitalPolicyColumns =
  "id,reserve_target_months,custom_reserve_aed,created_at,updated_at";
const bankStatementColumns =
  "id,client_id,account_label,statement_start_date,statement_end_date,original_filename,mime_type,byte_size,currency,opening_balance,closing_balance,parser,status,imported_at";
const bankTransactionColumns =
  "id,statement_id,transaction_date,posting_date,description,merchant,debit,credit,signed_amount,currency,reference,account_label,raw_source,scope,category,classification_status,confidence,classification_source,classification_reason,matched_record_type,matched_record_id,confirmed_at,notes,created_at,updated_at";
const DEFAULT_SETTINGS: FinanceSettings = {
  id: "mc-studios",
  source_currency: "AED",
  display_currency: "both",
  aed_eur_rate: null,
  rate_source: "manual",
  rate_effective_at: null,
  created_at: "",
  updated_at: "",
};
// Finance V2 tables are introduced by the paired migration. Keeping this cast
// server-only lets the workspace ship before generated database typings refresh.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- new tables ship before generated database typings.
const financeDb = db as any;

function text(value: unknown, label: string, max = 1000, required = false) {
  if (typeof value !== "string") {
    if (required) throw new FinanceCostsError(`${label} is required.`);
    return "";
  }
  const result = value.trim();
  if (result.length > max) throw new FinanceCostsError(`${label} is too long.`);
  if (required && !result) throw new FinanceCostsError(`${label} is required.`);
  return result;
}
const optionalText = (value: unknown, label: string, max = 1000) =>
  text(value, label, max) || null;
function isoDate(value: unknown, label: string) {
  const raw = text(value, label, 10);
  if (!raw) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(raw) ||
    Number.isNaN(Date.parse(`${raw}T00:00:00Z`))
  )
    throw new FinanceCostsError(`${label} is invalid.`);
  return raw;
}
function positiveNumber(value: unknown, label: string, allowZero = true) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (
    !Number.isFinite(parsed) ||
    parsed < (allowZero ? 0 : 0.000001) ||
    parsed > 10_000_000
  )
    throw new FinanceCostsError(`${label} is invalid.`);
  return Math.round(parsed * 100) / 100;
}
function optionalNumber(value: unknown, label: string, maximum = 10_000_000) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum)
    throw new FinanceCostsError(`${label} is invalid.`);
  return Math.round(parsed * 100) / 100;
}
function billingDay(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31)
    throw new FinanceCostsError("Billing day must be between 1 and 31.");
  return parsed;
}
function currency(value: unknown, fallback = "AED") {
  const result = text(value ?? fallback, "Currency", 3, true).toUpperCase();
  if (!/^[A-Z]{3}$/.test(result))
    throw new FinanceCostsError("Currency must be a three-letter code.");
  return result;
}
function normalizeSubscription(row: Record<string, unknown>) {
  return {
    ...row,
    source_key: typeof row.source_key === "string" ? row.source_key : null,
    source_provenance:
      typeof row.source_provenance === "string" ? row.source_provenance : null,
    billing_day: row.billing_day === null ? null : Number(row.billing_day),
    billing_date_known: row.billing_date_known !== false,
    base_amount: row.base_amount === null ? null : Number(row.base_amount),
    discount_percent:
      row.discount_percent === null ? null : Number(row.discount_percent),
    discount_temporary: row.discount_temporary === true,
    discount_end_date:
      typeof row.discount_end_date === "string" ? row.discount_end_date : null,
    fx_snapshot:
      row.fx_snapshot && typeof row.fx_snapshot === "object"
        ? (row.fx_snapshot as Record<string, unknown>)
        : null,
    amount: Number(row.amount),
  } as CostSubscription;
}
function normalizeIncome(row: Record<string, unknown>) {
  return {
    ...row,
    vat_applicable: row.vat_applicable !== false,
    net_amount: Number(row.net_amount),
    vat_rate: Number(row.vat_rate),
    vat_amount: Number(row.vat_amount),
    gross_amount: Number(row.gross_amount),
  } as FinanceIncome;
}
function normalizeExpense(row: Record<string, unknown>) {
  return {
    ...row,
    client_allocation_name:
      typeof row.client_allocation_name === "string"
        ? row.client_allocation_name
        : null,
    payment_status: ["planned", "committed", "paid", "cancelled"].includes(
      String(row.payment_status),
    )
      ? row.payment_status
      : "committed",
    payment_date:
      typeof row.payment_date === "string" ? row.payment_date : null,
    billing_day: row.billing_day === null ? null : Number(row.billing_day),
    next_deduction_date:
      typeof row.next_deduction_date === "string"
        ? row.next_deduction_date
        : null,
    source_provenance:
      typeof row.source_provenance === "string" ? row.source_provenance : null,
    source_reference:
      typeof row.source_reference === "string" ? row.source_reference : null,
    fx_snapshot:
      row.fx_snapshot && typeof row.fx_snapshot === "object"
        ? (row.fx_snapshot as Record<string, unknown>)
        : null,
    net_amount: Number(row.net_amount),
    vat_rate: Number(row.vat_rate),
    vat_amount: Number(row.vat_amount),
    gross_amount: Number(row.gross_amount),
  } as FinanceExpense;
}
function normalizeReceivable(row: Record<string, unknown>) {
  return {
    ...row,
    source_key: typeof row.source_key === "string" ? row.source_key : null,
    client_id: typeof row.client_id === "string" ? row.client_id : null,
    source_reference:
      typeof row.source_reference === "string" ? row.source_reference : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    amount: Number(row.amount),
    status: ["outstanding", "settled", "written_off"].includes(
      String(row.status),
    )
      ? row.status
      : "outstanding",
  } as FinanceReceivable;
}
function normalizeFx(row: Record<string, unknown>) {
  return { ...row, rate: Number(row.rate) } as FinanceFxRate;
}
function normalizeOwnerDraw(row: Record<string, unknown>) {
  return {
    ...row,
    amount: Number(row.amount),
    status:
      row.status === "paid" || row.status === "cancelled"
        ? row.status
        : "planned",
    paid_at: typeof row.paid_at === "string" ? row.paid_at : null,
  } as FinanceOwnerDraw;
}
function normalizePersonalExpense(row: Record<string, unknown>) {
  return {
    ...row,
    amount: Number(row.amount),
    expense_date:
      typeof row.expense_date === "string" ? row.expense_date : null,
    active: row.active !== false,
  } as PersonalExpense;
}
function normalizeSettings(row: Record<string, unknown> | null) {
  return row
    ? ({
        ...row,
        aed_eur_rate:
          row.aed_eur_rate === null ? null : Number(row.aed_eur_rate),
      } as FinanceSettings)
    : DEFAULT_SETTINGS;
}
function normalizeUpcomingRevenue(row: Record<string, unknown>) {
  return {
    ...row,
    vat_applicable: row.vat_applicable !== false,
    net_amount: Number(row.net_amount),
    vat_rate: Number(row.vat_rate),
    vat_amount: Number(row.vat_amount),
    gross_amount: Number(row.gross_amount),
  } as FinanceUpcomingRevenue;
}
function normalizePipeline(row: Record<string, unknown>) {
  return {
    ...row,
    vat_applicable: row.vat_applicable !== false,
    net_amount: Number(row.net_amount),
    vat_rate: Number(row.vat_rate),
    vat_amount: Number(row.vat_amount),
    gross_amount: Number(row.gross_amount),
    probability: row.probability === null ? null : Number(row.probability),
  } as FinancePipelineRecord;
}
function normalizeInvoiceAttachment(row: Record<string, unknown>) {
  return {
    ...row,
    client_id: typeof row.client_id === "string" ? row.client_id : null,
    storage_bucket: "finance-documents",
    byte_size: Number(row.byte_size),
  } as FinanceInvoiceAttachment;
}
function invoiceStatus(row: {
  sent_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  amount: number;
  invoice_available_date: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  if (row.paid_at && (row.paid_amount ?? 0) >= row.amount)
    return {
      status: "paid" as const,
      days_overdue: null,
      days_until_due: null,
    };
  if (!row.sent_at)
    return {
      status:
        row.invoice_available_date && row.invoice_available_date <= today
          ? ("ready_to_invoice" as const)
          : ("upcoming" as const),
      days_overdue: null,
      days_until_due: null,
    };
  const days = Math.round(
    (Date.parse(`${row.due_at}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
  return days < 0
    ? {
        status: "overdue" as const,
        days_overdue: Math.abs(days),
        days_until_due: null,
      }
    : { status: "due" as const, days_overdue: null, days_until_due: days };
}
function normalizeInvoice(
  row: Record<string, unknown>,
  attachments: FinanceInvoiceAttachment[],
) {
  const amount = Number(row.amount);
  const paid = row.paid_amount === null ? null : Number(row.paid_amount);
  const status = invoiceStatus({
    sent_at: typeof row.sent_at === "string" ? row.sent_at : null,
    due_at: typeof row.due_at === "string" ? row.due_at : null,
    paid_at: typeof row.paid_at === "string" ? row.paid_at : null,
    paid_amount: paid,
    amount,
    invoice_available_date:
      typeof row.invoice_available_date === "string"
        ? row.invoice_available_date
        : null,
  });
  return {
    ...row,
    client_id: typeof row.client_id === "string" ? row.client_id : null,
    invoice_number:
      typeof row.invoice_number === "string" ? row.invoice_number : null,
    invoice_available_date:
      typeof row.invoice_available_date === "string"
        ? row.invoice_available_date
        : null,
    sent_at: typeof row.sent_at === "string" ? row.sent_at : null,
    due_at: typeof row.due_at === "string" ? row.due_at : null,
    paid_at: typeof row.paid_at === "string" ? row.paid_at : null,
    paid_amount: paid,
    payment_reference:
      typeof row.payment_reference === "string" ? row.payment_reference : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    amount,
    outstanding_amount: Math.max(
      0,
      Math.round((amount - (paid ?? 0)) * 100) / 100,
    ),
    attachments,
    ...status,
  } as FinanceInvoice;
}
function normalizeInvestment(row: Record<string, unknown>) {
  return {
    ...row,
    estimated_amount: Number(row.estimated_amount),
    allocated_amount: Number(row.allocated_amount ?? 0),
    desired_purchase_date:
      typeof row.desired_purchase_date === "string"
        ? row.desired_purchase_date
        : null,
    notes: typeof row.notes === "string" ? row.notes : null,
  } as FinanceInvestment;
}
function normalizeCapitalPolicy(row: Record<string, unknown> | null) {
  return row
    ? ({
        ...row,
        reserve_target_months: Number(row.reserve_target_months),
        custom_reserve_aed:
          row.custom_reserve_aed === null
            ? null
            : Number(row.custom_reserve_aed),
      } as FinanceCapitalPolicy)
    : {
        id: "mc-studios" as const,
        reserve_target_months: 1,
        custom_reserve_aed: null,
        created_at: "",
        updated_at: "",
      };
}
function normalizeBankTransaction(row: Record<string, unknown>) {
  return {
    ...row,
    posting_date:
      typeof row.posting_date === "string" ? row.posting_date : null,
    merchant: typeof row.merchant === "string" ? row.merchant : null,
    reference: typeof row.reference === "string" ? row.reference : null,
    category: typeof row.category === "string" ? row.category : null,
    classification_reason:
      typeof row.classification_reason === "string"
        ? row.classification_reason
        : null,
    matched_record_type:
      typeof row.matched_record_type === "string"
        ? row.matched_record_type
        : null,
    matched_record_id:
      typeof row.matched_record_id === "string" ? row.matched_record_id : null,
    confirmed_at:
      typeof row.confirmed_at === "string" ? row.confirmed_at : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    debit: Number(row.debit),
    credit: Number(row.credit),
    signed_amount: Number(row.signed_amount),
  } as FinanceBankTransaction;
}
function monthStart(month?: string) {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, value] = month.split("-").map(Number);
    if (value >= 1 && value <= 12)
      return new Date(Date.UTC(year, value - 1, 1)).toISOString();
  }
  const date = new Date();
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
  ).toISOString();
}
function currentMonthBounds(month?: string) {
  const start = new Date(monthStart(month));
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
  );
  return {
    key: start.toISOString().slice(0, 7),
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}
function currentRecurring(
  row: {
    active: boolean;
    billing_cycle: string;
    start_date: string | null;
    end_date: string | null;
  },
  month?: string,
) {
  const { start, end } = currentMonthBounds(month);
  return (
    row.active &&
    row.billing_cycle !== "one_off" &&
    (!row.start_date || row.start_date <= end) &&
    (!row.end_date || row.end_date >= start)
  );
}
function rowForThisMonth(
  row: {
    active: boolean;
    billing_cycle: string;
    start_date: string | null;
    end_date: string | null;
    expense_date?: string | null;
  },
  month?: string,
) {
  const { start, end } = currentMonthBounds(month);
  if (!row.active) return false;
  if (row.billing_cycle !== "one_off") return currentRecurring(row, month);
  const date = row.expense_date ?? row.start_date;
  return Boolean(date && date >= start && date <= end);
}
function providerFor(model: string | null) {
  return model?.includes("claude")
    ? "Anthropic"
    : model?.includes("gemini")
      ? "Google Gemini"
      : (model ?? "Unknown");
}
function plannerFeature(action: string | null) {
  return action === "visual_direction"
    ? "monthly_visual_direction"
    : action === "feed_plan"
      ? "monthly_plan"
      : `monthly_planner:${action ?? "unassigned"}`;
}
function sameUsage(log: UsageCostRow, planner: UsageCostRow) {
  return (
    log.provider === planner.provider &&
    Math.abs(log.cost_usd_actual - planner.cost_usd_actual) < 0.0000001 &&
    log.feature === planner.feature &&
    Math.abs(
      new Date(log.recorded_at).getTime() -
        new Date(planner.recorded_at).getTime(),
    ) <= 180_000
  );
}
async function ensureClient(clientId: string | null) {
  if (!clientId) return;
  const { data, error } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (error || !data) throw new FinanceCostsError("Client was not found.", 404);
}
async function activity(
  recordType: string,
  recordId: string,
  action: string,
  detail: Record<string, unknown> = {},
) {
  await financeDb
    .from("jarvis_finance_activity")
    .insert({ record_type: recordType, record_id: recordId, action, detail });
}

function subscriptionValues(
  input: Record<string, unknown>,
  existing?: CostSubscription,
) {
  const category = input.category ?? existing?.category;
  const billingCycle = input.billing_cycle ?? existing?.billing_cycle;
  const status = input.status ?? existing?.status;
  const scope = input.allocation_scope ?? existing?.allocation_scope;
  if (
    !isSubscriptionCategory(category) ||
    !isSubscriptionCycle(billingCycle) ||
    !isSubscriptionStatus(status) ||
    !isAllocationScope(scope)
  )
    throw new FinanceCostsError("Subscription category or status is invalid.");
  const rawClientId =
    input.client_id === ""
      ? null
      : (input.client_id ?? existing?.client_id ?? null);
  const clientId = typeof rawClientId === "string" ? rawClientId : null;
  if (scope === "client_specific" && (!clientId || !isUuid(clientId)))
    throw new FinanceCostsError("A client allocation requires a valid client.");
  if (scope === "agency_wide" && clientId)
    throw new FinanceCostsError(
      "Agency-wide subscriptions cannot have a client allocation.",
    );
  return {
    vendor: text(input.vendor ?? existing?.vendor, "Vendor", 160, true),
    plan_name: optionalText(
      input.plan_name ?? existing?.plan_name,
      "Plan name",
      160,
    ),
    category,
    currency: currency(input.currency ?? existing?.currency ?? "USD"),
    amount:
      input.amount === undefined && existing
        ? existing.amount
        : positiveNumber(input.amount, "Amount"),
    billing_cycle: billingCycle,
    start_date:
      input.start_date === undefined && existing
        ? existing.start_date
        : isoDate(input.start_date, "Start date"),
    next_renewal_date:
      input.next_renewal_date === undefined && existing
        ? existing.next_renewal_date
        : isoDate(input.next_renewal_date, "Next renewal date"),
    status,
    allocation_scope: scope,
    client_id: scope === "agency_wide" ? null : clientId,
    notes: optionalText(input.notes ?? existing?.notes, "Notes", 3000),
    documentation_url: optionalText(
      input.documentation_url ?? existing?.documentation_url,
      "Reference URL",
      2000,
    ),
    source_provenance: optionalText(
      input.source_provenance ?? existing?.source_provenance,
      "Source provenance",
      1000,
    ),
    billing_day:
      input.billing_day === undefined && existing
        ? existing.billing_day
        : billingDay(input.billing_day),
    billing_date_known:
      input.billing_date_known === undefined && existing
        ? existing.billing_date_known
        : input.billing_date_known !== false,
    base_amount:
      input.base_amount === undefined && existing
        ? existing.base_amount
        : optionalNumber(input.base_amount, "Base amount"),
    discount_percent:
      input.discount_percent === undefined && existing
        ? existing.discount_percent
        : optionalNumber(input.discount_percent, "Discount percentage", 100),
    discount_temporary:
      input.discount_temporary === undefined && existing
        ? existing.discount_temporary
        : input.discount_temporary === true,
    discount_end_date:
      input.discount_end_date === undefined && existing
        ? existing.discount_end_date
        : isoDate(input.discount_end_date, "Discount end date"),
  };
}
function financeValues(
  input: Record<string, unknown>,
  existing: FinanceIncome | FinanceExpense | undefined,
  kind: "income" | "expense",
) {
  const net =
    input.net_amount === undefined && existing
      ? existing.net_amount
      : positiveNumber(input.net_amount, "Net amount");
  const vatRate =
    input.vat_rate === undefined && existing
      ? existing.vat_rate
      : positiveNumber(input.vat_rate ?? 0, "VAT rate");
  if (vatRate > 100)
    throw new FinanceCostsError("VAT rate cannot exceed 100%.");
  const vat = Math.round(net * vatRate) / 100;
  const gross = Math.round((net + vat) * 100) / 100;
  const billingCycle =
    input.billing_cycle ?? existing?.billing_cycle ?? "one_off";
  if (!isSubscriptionCycle(billingCycle))
    throw new FinanceCostsError("Billing cycle is invalid.");
  const rawClientId =
    input.client_id === ""
      ? null
      : (input.client_id ?? existing?.client_id ?? null);
  const clientId = typeof rawClientId === "string" ? rawClientId : null;
  if (clientId && !isUuid(clientId))
    throw new FinanceCostsError("Client is invalid.");
  const common = {
    client_id: clientId,
    net_amount: net,
    currency: currency(input.currency ?? existing?.currency ?? "AED"),
    vat_rate: vatRate,
    vat_amount: vat,
    gross_amount: gross,
    billing_cycle: billingCycle,
    start_date:
      input.start_date === undefined && existing
        ? existing.start_date
        : isoDate(input.start_date, "Start date"),
    end_date:
      input.end_date === undefined && existing
        ? existing.end_date
        : isoDate(input.end_date, "End date"),
    active:
      input.active === undefined && existing
        ? existing.active
        : Boolean(input.active),
    notes: optionalText(input.notes ?? existing?.notes, "Notes", 3000),
  };
  if (kind === "income") {
    const income = existing as FinanceIncome | undefined;
    const incomeType =
      input.income_type ?? income?.income_type ?? "one_off_revenue";
    const paymentStatus =
      input.payment_status ?? income?.payment_status ?? "not_set";
    if (!isIncomeType(incomeType) || !isPaymentStatus(paymentStatus))
      throw new FinanceCostsError("Income type or payment status is invalid.");
    return {
      ...common,
      counterparty_name: text(
        input.counterparty_name ?? income?.counterparty_name,
        "Client or counterparty",
        180,
        true,
      ),
      description: text(
        input.description ?? income?.description,
        "Description",
        300,
        true,
      ),
      income_type: incomeType,
      next_billing_date:
        input.next_billing_date === undefined && income
          ? income.next_billing_date
          : isoDate(input.next_billing_date, "Next billing date"),
      due_date:
        input.due_date === undefined && income
          ? income.due_date
          : isoDate(input.due_date, "Due date"),
      payment_date:
        input.payment_date === undefined && income
          ? income.payment_date
          : isoDate(input.payment_date, "Payment date"),
      payment_status: paymentStatus,
    };
  }
  const expense = existing as FinanceExpense | undefined;
  const category = input.category ?? expense?.category ?? "operating";
  const paymentStatus =
    input.payment_status ?? expense?.payment_status ?? "committed";
  if (
    !isExpenseCategory(category) ||
    typeof paymentStatus !== "string" ||
    !["planned", "committed", "paid", "cancelled"].includes(paymentStatus)
  )
    throw new FinanceCostsError(
      "Expense category or payment status is invalid.",
    );
  return {
    ...common,
    client_allocation_name: optionalText(
      input.client_allocation_name ?? expense?.client_allocation_name,
      "Client allocation",
      180,
    ),
    vendor: text(input.vendor ?? expense?.vendor, "Vendor", 160, true),
    description: text(
      input.description ?? expense?.description,
      "Description",
      300,
      true,
    ),
    category,
    expense_date:
      input.expense_date === undefined && expense
        ? expense.expense_date
        : isoDate(input.expense_date, "Expense date"),
    payment_status: paymentStatus,
    payment_date:
      input.payment_date === undefined && expense
        ? expense.payment_date
        : isoDate(input.payment_date, "Payment date"),
    billing_day:
      input.billing_day === undefined && expense
        ? expense.billing_day
        : billingDay(input.billing_day),
    next_deduction_date:
      input.next_deduction_date === undefined && expense
        ? expense.next_deduction_date
        : isoDate(input.next_deduction_date, "Next deduction date"),
    source_provenance: optionalText(
      input.source_provenance ?? expense?.source_provenance,
      "Source provenance",
      1000,
    ),
    source_reference: optionalText(
      input.source_reference ?? expense?.source_reference,
      "Source reference",
      2000,
    ),
  };
}
function receivableValues(
  input: Record<string, unknown>,
  existing?: FinanceReceivable,
) {
  const rawClientId =
    input.client_id === ""
      ? null
      : (input.client_id ?? existing?.client_id ?? null);
  const clientId = typeof rawClientId === "string" ? rawClientId : null;
  if (clientId && !isUuid(clientId))
    throw new FinanceCostsError("Client is invalid.");
  const status = input.status ?? existing?.status ?? "outstanding";
  if (!['outstanding', 'settled', 'written_off'].includes(String(status)))
    throw new FinanceCostsError("Receivable status is invalid.");
  return {
    source_key: optionalText(
      input.source_key ?? existing?.source_key,
      "Source key",
      180,
    ),
    client_id: clientId,
    debtor_name: text(
      input.debtor_name ?? existing?.debtor_name,
      "Debtor",
      180,
      true,
    ),
    description: text(
      input.description ?? existing?.description,
      "Description",
      300,
      true,
    ),
    amount:
      input.amount === undefined && existing
        ? existing.amount
        : positiveNumber(input.amount, "Receivable amount", false),
    currency: currency(input.currency ?? existing?.currency ?? "AED"),
    status,
    source_reference: optionalText(
      input.source_reference ?? existing?.source_reference,
      "Source reference",
      2000,
    ),
    notes: optionalText(input.notes ?? existing?.notes, "Notes", 3000),
  };
}
function futureRevenueValues(
  input: Record<string, unknown>,
  existing?: FinanceUpcomingRevenue,
) {
  const net =
    input.net_amount === undefined && existing
      ? existing.net_amount
      : positiveNumber(input.net_amount, "Net amount");
  const vatRate =
    input.vat_rate === undefined && existing
      ? existing.vat_rate
      : positiveNumber(input.vat_rate ?? 0, "VAT rate");
  if (vatRate > 100)
    throw new FinanceCostsError("VAT rate cannot exceed 100%.");
  const billingCycle =
    input.billing_cycle ?? existing?.billing_cycle ?? "monthly";
  const status = input.status ?? existing?.status ?? "upcoming";
  if (!isSubscriptionCycle(billingCycle) || !isUpcomingRevenueStatus(status))
    throw new FinanceCostsError(
      "Upcoming revenue status or billing cycle is invalid.",
    );
  const rawClientId =
    input.client_id === ""
      ? null
      : (input.client_id ?? existing?.client_id ?? null);
  const clientId = typeof rawClientId === "string" ? rawClientId : null;
  if (clientId && !isUuid(clientId))
    throw new FinanceCostsError("Client is invalid.");
  const vat = Math.round(net * vatRate) / 100;
  return {
    client_id: clientId,
    counterparty_name: text(
      input.counterparty_name ?? existing?.counterparty_name,
      "Client or counterparty",
      180,
      true,
    ),
    description: text(
      input.description ?? existing?.description,
      "Description",
      300,
      true,
    ),
    net_amount: net,
    currency: currency(input.currency ?? existing?.currency ?? "AED"),
    vat_rate: vatRate,
    vat_amount: vat,
    gross_amount: Math.round((net + vat) * 100) / 100,
    vat_applicable: vatRate > 0,
    billing_cycle: billingCycle,
    expected_start_date:
      input.expected_start_date === undefined && existing
        ? existing.expected_start_date
        : isoDate(input.expected_start_date, "Expected start date"),
    status,
    notes: optionalText(input.notes ?? existing?.notes, "Notes", 3000),
  };
}

function invoiceValues(
  input: Record<string, unknown>,
  existing?: FinanceInvoice,
) {
  const incomeRecordId = input.income_record_id ?? existing?.income_record_id;
  if (typeof incomeRecordId !== "string" || !isUuid(incomeRecordId))
    throw new FinanceCostsError("A valid income record is required.");
  const clientRaw =
    input.client_id === ""
      ? null
      : (input.client_id ?? existing?.client_id ?? null);
  const clientId = typeof clientRaw === "string" ? clientRaw : null;
  if (clientId && !isUuid(clientId))
    throw new FinanceCostsError("Client is invalid.");
  const amount =
    input.amount === undefined && existing
      ? existing.amount
      : positiveNumber(input.amount, "Invoice amount", false);
  const paidAmount =
    input.paid_amount === undefined && existing
      ? existing.paid_amount
      : optionalNumber(input.paid_amount, "Amount paid");
  const paidAt =
    input.paid_at === undefined && existing
      ? existing.paid_at
      : isoDate(input.paid_at, "Paid date");
  if ((paidAt === null) !== (paidAmount === null))
    throw new FinanceCostsError(
      "Paid date and amount paid must be recorded together.",
    );
  if (paidAmount !== null && paidAmount > amount)
    throw new FinanceCostsError(
      "Amount paid cannot exceed the invoice amount.",
    );
  const month = isoDate(
    input.invoice_month ?? existing?.invoice_month,
    "Invoice month",
  );
  if (!month || !month.endsWith("-01"))
    throw new FinanceCostsError(
      "Invoice month must be the first day of the month.",
    );
  return {
    income_record_id: incomeRecordId,
    client_id: clientId,
    counterparty_name: text(
      input.counterparty_name ?? existing?.counterparty_name,
      "Client or counterparty",
      180,
      true,
    ),
    title: text(input.title ?? existing?.title, "Invoice title", 300, true),
    invoice_number: optionalText(
      input.invoice_number ?? existing?.invoice_number,
      "Invoice number",
      120,
    ),
    invoice_month: month,
    amount,
    currency: currency(input.currency ?? existing?.currency ?? "AED"),
    invoice_available_date:
      input.invoice_available_date === undefined && existing
        ? existing.invoice_available_date
        : isoDate(input.invoice_available_date, "Invoice available date"),
    sent_at:
      input.sent_at === undefined && existing
        ? existing.sent_at
        : isoDate(input.sent_at, "Sent date"),
    paid_at: paidAt,
    paid_amount: paidAmount,
    payment_reference: optionalText(
      input.payment_reference ?? existing?.payment_reference,
      "Payment reference",
      500,
    ),
    notes: optionalText(input.notes ?? existing?.notes, "Notes", 3000),
    provenance:
      optionalText(
        input.provenance ?? existing?.provenance,
        "Provenance",
        1000,
      ) ?? "Finance invoice record",
  };
}
function investmentValues(
  input: Record<string, unknown>,
  existing?: FinanceInvestment,
) {
  const classification =
    input.classification ?? existing?.classification ?? "business";
  const priority = input.priority ?? existing?.priority ?? "normal";
  const status = input.status ?? existing?.status ?? "planned";
  if (
    !["business", "personal"].includes(String(classification)) ||
    !["high", "normal", "low"].includes(String(priority)) ||
    ![
      "planned",
      "saving",
      "affordable",
      "purchased",
      "paused",
      "cancelled",
    ].includes(String(status))
  )
    throw new FinanceCostsError(
      "Investment classification, priority or status is invalid.",
    );
  const amount =
    input.estimated_amount === undefined && existing
      ? existing.estimated_amount
      : positiveNumber(input.estimated_amount, "Estimated cost", false);
  const allocated =
    input.allocated_amount === undefined && existing
      ? existing.allocated_amount
      : positiveNumber(input.allocated_amount ?? 0, "Allocated amount");
  if (allocated > amount)
    throw new FinanceCostsError(
      "Allocated amount cannot exceed the estimated cost.",
    );
  return {
    name: text(input.name ?? existing?.name, "Investment name", 180, true),
    category: text(input.category ?? existing?.category, "Category", 180, true),
    estimated_amount: amount,
    currency: currency(input.currency ?? existing?.currency ?? "AED"),
    classification,
    priority,
    desired_purchase_date:
      input.desired_purchase_date === undefined && existing
        ? existing.desired_purchase_date
        : isoDate(input.desired_purchase_date, "Desired purchase date"),
    status,
    allocated_amount: allocated,
    notes: optionalText(input.notes ?? existing?.notes, "Notes", 3000),
    source_provenance:
      optionalText(
        input.source_provenance ?? existing?.source_provenance,
        "Source provenance",
        1000,
      ) ?? "Finance planned purchase",
  };
}
function pipelineValues(
  input: Record<string, unknown>,
  existing?: FinancePipelineRecord,
) {
  const net =
    input.net_amount === undefined && existing
      ? existing.net_amount
      : positiveNumber(input.net_amount, "Net amount");
  const vatRate =
    input.vat_rate === undefined && existing
      ? existing.vat_rate
      : positiveNumber(input.vat_rate ?? 0, "VAT rate");
  if (vatRate > 100)
    throw new FinanceCostsError("VAT rate cannot exceed 100%.");
  const billingCycle =
    input.billing_cycle ?? existing?.billing_cycle ?? "monthly";
  const stage = input.stage ?? existing?.stage ?? "not_contacted";
  if (!isSubscriptionCycle(billingCycle) || !isPipelineStage(stage))
    throw new FinanceCostsError("Pipeline stage or billing cycle is invalid.");
  const rawClientId =
    input.client_id === ""
      ? null
      : (input.client_id ?? existing?.client_id ?? null);
  const clientId = typeof rawClientId === "string" ? rawClientId : null;
  if (clientId && !isUuid(clientId))
    throw new FinanceCostsError("Client is invalid.");
  const probabilityRaw =
    input.probability === undefined && existing
      ? existing.probability
      : input.probability;
  const probability =
    probabilityRaw === "" ||
    probabilityRaw === null ||
    probabilityRaw === undefined
      ? null
      : positiveNumber(probabilityRaw, "Probability");
  if (probability !== null && probability > 100)
    throw new FinanceCostsError("Probability cannot exceed 100%.");
  const vat = Math.round(net * vatRate) / 100;
  return {
    client_id: clientId,
    name: text(input.name ?? existing?.name, "Prospect name", 180, true),
    description: optionalText(
      input.description ?? existing?.description,
      "Description",
      300,
    ),
    stage,
    stage_detail: optionalText(
      input.stage_detail ?? existing?.stage_detail,
      "Stage detail",
      300,
    ),
    net_amount: net,
    currency: currency(input.currency ?? existing?.currency ?? "AED"),
    vat_rate: vatRate,
    vat_amount: vat,
    gross_amount: Math.round((net + vat) * 100) / 100,
    vat_applicable: vatRate > 0,
    billing_cycle: billingCycle,
    expected_start_date:
      input.expected_start_date === undefined && existing
        ? existing.expected_start_date
        : isoDate(input.expected_start_date, "Expected start date"),
    probability,
    notes: optionalText(input.notes ?? existing?.notes, "Notes", 3000),
  };
}

export async function loadFinanceSnapshot(
  month?: string,
): Promise<FinanceSnapshot> {
  const selectedMonth = currentMonthBounds(month);
  const [
    settings,
    income,
    invoices,
    invoiceAttachments,
    capitalPolicy,
    investments,
    bankStatements,
    bankTransactions,
    upcomingRevenue,
    pipeline,
    expenses,
    receivables,
    subscriptions,
    fx,
    ownerDraws,
    personalExpenses,
    clients,
    usage,
    planner,
  ] = await Promise.all([
    financeDb
      .from("jarvis_finance_settings")
      .select(settingColumns)
      .eq("id", "mc-studios")
      .maybeSingle(),
    financeDb
      .from("jarvis_finance_income_records")
      .select(incomeColumns)
      .order("active", { ascending: false })
      .order("counterparty_name"),
    financeDb
      .from("jarvis_finance_invoices")
      .select(invoiceColumns)
      .eq("invoice_month", selectedMonth.start)
      .order("invoice_available_date", { ascending: true, nullsFirst: false })
      .order("created_at"),
    financeDb
      .from("jarvis_finance_invoice_attachments")
      .select(invoiceAttachmentColumns)
      .order("created_at", { ascending: false }),
    financeDb
      .from("jarvis_finance_capital_policy")
      .select(capitalPolicyColumns)
      .eq("id", "mc-studios")
      .maybeSingle(),
    financeDb
      .from("jarvis_finance_investments")
      .select(investmentColumns)
      .order("priority")
      .order("estimated_amount"),
    financeDb
      .from("jarvis_finance_bank_statements")
      .select(bankStatementColumns)
      .order("imported_at", { ascending: false }),
    financeDb
      .from("jarvis_finance_bank_transactions")
      .select(bankTransactionColumns)
      .order("transaction_date", { ascending: false }),
    financeDb
      .from("jarvis_finance_upcoming_revenue")
      .select(upcomingRevenueColumns)
      .order("expected_start_date")
      .order("counterparty_name"),
    financeDb
      .from("jarvis_finance_pipeline")
      .select(pipelineColumns)
      .order("expected_start_date", { ascending: true, nullsFirst: false })
      .order("name"),
    financeDb
      .from("jarvis_finance_expenses")
      .select(expenseColumns)
      .order("expense_date", { ascending: false, nullsFirst: false })
      .order("vendor"),
    financeDb
      .from("jarvis_finance_receivables")
      .select(receivableColumns)
      .order("status")
      .order("currency")
      .order("debtor_name"),
    db
      .from("jarvis_cost_subscriptions")
      .select(subscriptionColumns)
      .order("next_renewal_date", { ascending: true, nullsFirst: false })
      .order("vendor"),
    financeDb
      .from("jarvis_finance_fx_rates")
      .select(fxColumns)
      .lte("rate_date", selectedMonth.end)
      .order("rate_date", { ascending: false }),
    financeDb
      .from("jarvis_finance_owner_draws")
      .select(ownerDrawColumns)
      .order("business_period_start", { ascending: false }),
    financeDb
      .from("jarvis_personal_expenses")
      .select(personalExpenseColumns)
      .order("expense_date", { ascending: false, nullsFirst: false }),
    db.from("clients").select("id,name").order("name"),
    db
      .from("ai_usage_logs")
      .select(
        "id,model,feature,client_id,cost_usd_actual,cost_usd_estimated,created_at",
      )
      .gte("created_at", monthStart(selectedMonth.key))
      .lt("created_at", `${selectedMonth.end}T23:59:59.999Z`),
    db
      .from("social_monthly_plan_ai_executions")
      .select("id,provider,model,action_type,cost_usd_actual,created_at")
      .gte("created_at", monthStart(selectedMonth.key))
      .lt("created_at", `${selectedMonth.end}T23:59:59.999Z`),
  ]);
  if (
    settings.error ||
    income.error ||
    invoices.error ||
    invoiceAttachments.error ||
    capitalPolicy.error ||
    investments.error ||
    bankStatements.error ||
    bankTransactions.error ||
    upcomingRevenue.error ||
    pipeline.error ||
    expenses.error ||
    receivables.error ||
    subscriptions.error ||
    fx.error ||
    ownerDraws.error ||
    personalExpenses.error ||
    clients.error ||
    usage.error ||
    planner.error
  )
    throw new FinanceCostsError("Finance records could not be loaded.", 500);
  const bankTransactionRows: FinanceBankTransaction[] = (
    (bankTransactions.data ?? []) as Record<string, unknown>[]
  ).map(normalizeBankTransaction);
  const bankTransactionsThisMonth = bankTransactionRows.filter((row) =>
    row.transaction_date.startsWith(selectedMonth.key),
  );
  const statementCounts = new Map<
    string,
    { count: number; matched: number; unresolved: number; excluded: number }
  >();
  bankTransactionRows.forEach((row) => {
    const count = statementCounts.get(row.statement_id) ?? {
      count: 0,
      matched: 0,
      unresolved: 0,
      excluded: 0,
    };
    count.count++;
    if (row.classification_status === "reconciled") count.matched++;
    if (row.classification_status === "excluded") count.excluded++;
    if (
      row.classification_status === "needs_review" ||
      row.scope === "unresolved"
    )
      count.unresolved++;
    statementCounts.set(row.statement_id, count);
  });
  const bankStatementRows: FinanceBankStatement[] = (
    (bankStatements.data ?? []) as Record<string, unknown>[]
  ).map(
    (row) =>
      ({
        ...row,
        client_id: typeof row.client_id === "string" ? row.client_id : null,
        statement_start_date:
          typeof row.statement_start_date === "string"
            ? row.statement_start_date
            : null,
        statement_end_date:
          typeof row.statement_end_date === "string"
            ? row.statement_end_date
            : null,
        currency: typeof row.currency === "string" ? row.currency : null,
        opening_balance:
          row.opening_balance === null ? null : Number(row.opening_balance),
        closing_balance:
          row.closing_balance === null ? null : Number(row.closing_balance),
        byte_size: Number(row.byte_size),
        ...(() => {
          const count = statementCounts.get(String(row.id)) ?? {
            count: 0,
            matched: 0,
            unresolved: 0,
            excluded: 0,
          };
          return {
            transaction_count: count.count,
            matched_count: count.matched,
            unresolved_count: count.unresolved,
            excluded_count: count.excluded,
          };
        })(),
      }) as FinanceBankStatement,
  );
  const attachmentRows: FinanceInvoiceAttachment[] = (
    (invoiceAttachments.data ?? []) as Record<string, unknown>[]
  ).map(normalizeInvoiceAttachment);
  const invoicesById = new Map<string, FinanceInvoiceAttachment[]>();
  attachmentRows.forEach((row) =>
    invoicesById.set(row.invoice_id, [
      ...(invoicesById.get(row.invoice_id) ?? []),
      row,
    ]),
  );
  const invoiceRows: FinanceInvoice[] = (
    (invoices.data ?? []) as Record<string, unknown>[]
  ).map((row) => normalizeInvoice(row, invoicesById.get(String(row.id)) ?? []));
  const capitalPolicyRow = normalizeCapitalPolicy(
    capitalPolicy.data as Record<string, unknown> | null,
  );
  const investmentRows: FinanceInvestment[] = (
    (investments.data ?? []) as Record<string, unknown>[]
  ).map(normalizeInvestment);
  const incomeRows: FinanceIncome[] = (
    (income.data ?? []) as Record<string, unknown>[]
  ).map(normalizeIncome);
  const upcomingRows: FinanceUpcomingRevenue[] = (
    (upcomingRevenue.data ?? []) as Record<string, unknown>[]
  ).map(normalizeUpcomingRevenue);
  const pipelineRows: FinancePipelineRecord[] = (
    (pipeline.data ?? []) as Record<string, unknown>[]
  ).map(normalizePipeline);
  const expenseRows: FinanceExpense[] = (
    (expenses.data ?? []) as Record<string, unknown>[]
  ).map(normalizeExpense);
  const receivableRows: FinanceReceivable[] = (
    (receivables.data ?? []) as Record<string, unknown>[]
  ).map(normalizeReceivable);
  const subscriptionRows: CostSubscription[] = (subscriptions.data ?? []).map(
    normalizeSubscription,
  );
  const fxRows: FinanceFxRate[] = (
    (fx.data ?? []) as Record<string, unknown>[]
  ).map(normalizeFx);
  const ownerDrawRows: FinanceOwnerDraw[] = (
    (ownerDraws.data ?? []) as Record<string, unknown>[]
  ).map(normalizeOwnerDraw);
  const personalExpenseRows: PersonalExpense[] = (
    (personalExpenses.data ?? []) as Record<string, unknown>[]
  ).map(normalizePersonalExpense);
  const usageLogs: UsageCostRow[] = (usage.data ?? []).map((row) => ({
    id: row.id,
    provider: providerFor(row.model),
    feature: row.feature ?? "Unassigned",
    client_id: row.client_id,
    cost_usd_actual: Number(row.cost_usd_actual ?? 0),
    cost_usd_estimated: Number(row.cost_usd_estimated ?? 0),
    source: "ai_usage_logs",
    recorded_at: row.created_at,
  }));
  const plannerRows: UsageCostRow[] = (planner.data ?? []).map((row) => ({
    id: row.id,
    provider:
      row.provider === "anthropic"
        ? "Anthropic"
        : row.provider === "google-gemini"
          ? "Google Gemini"
          : (row.provider ?? "Unknown"),
    feature: plannerFeature(row.action_type),
    client_id: null,
    cost_usd_actual: Number(row.cost_usd_actual ?? 0),
    cost_usd_estimated: 0,
    source: "monthly_planner",
    recorded_at: row.created_at,
  }));
  const financeSettings = normalizeSettings(settings.data);
  const latestRate = (base: string, quote: string) =>
    fxRows.find(
      (row) => row.base_currency === base && row.quote_currency === quote,
    )?.rate ?? null;
  const usdAed = latestRate("USD", "AED");
  const usdEur = latestRate("USD", "EUR");
  const toUsd = (amount: number, sourceCurrency: string) =>
    sourceCurrency === "USD"
      ? amount
      : sourceCurrency === "AED" && usdAed !== null
        ? amount / usdAed
        : sourceCurrency === "EUR" && usdEur !== null
          ? amount / usdEur
          : null;
  const toAed = (amount: number, sourceCurrency: string) =>
    sourceCurrency === "AED"
      ? amount
      : toUsd(amount, sourceCurrency) === null || usdAed === null
        ? null
        : toUsd(amount, sourceCurrency)! * usdAed;
  const toEur = (amount: number, sourceCurrency: string) =>
    sourceCurrency === "EUR"
      ? amount
      : sourceCurrency === "AED" && financeSettings.aed_eur_rate !== null
        ? amount * financeSettings.aed_eur_rate
        : null;
  const outstandingReceivableTotals = [...receivableRows
    .filter((row) => row.status === "outstanding")
    .reduce((totals, row) => {
      const prior = totals.get(row.currency) ?? { currency: row.currency, amount: 0, count: 0 };
      prior.amount += row.amount;
      prior.count += 1;
      totals.set(row.currency, prior);
      return totals;
    }, new Map<string, { currency: string; amount: number; count: number }>())
    .values()]
    .map((row) => ({ ...row, amount: Math.round(row.amount * 100) / 100 }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
  const sumResolvedEur = (rows: Array<{ amount: number; currency: string }>) =>
    rows.reduce<number | null>((sum, row) => {
      const converted = toEur(row.amount, row.currency);
      return sum === null || converted === null ? null : sum + converted;
    }, 0);
  const uniquePlanner = plannerRows.filter(
    (row) => !usageLogs.some((log) => sameUsage(log, row)),
  );
  const usageRows = [...usageLogs, ...uniquePlanner];
  const recurringIncome = incomeRows.filter((row) =>
    currentRecurring(row, selectedMonth.key),
  );
  const incomeThisMonth = incomeRows.filter((row) =>
    rowForThisMonth(row, selectedMonth.key),
  );
  const expensesThisMonth = expenseRows.filter((row) =>
    rowForThisMonth(row, selectedMonth.key),
  );
  const activeSubscriptions = subscriptionRows.filter(
    (row) => row.status === "active",
  );
  const subscriptionMonthly = activeSubscriptions.map((row) => ({
    row,
    amount: monthlyCost(row),
  }));
  const unresolvedOperatingCosts = [
    ...expensesThisMonth.map((row) => ({
      kind: "expense" as const,
      currency: row.currency,
      amount: row.net_amount,
      label: row.description,
    })),
    ...subscriptionMonthly.map(({ row, amount }) => ({
      kind: "subscription" as const,
      currency: row.currency,
      amount,
      label: row.vendor,
    })),
  ].filter((row) => toEur(row.amount, row.currency) === null);
  const sourceTotals = {
    incomeAed: incomeThisMonth
      .filter((row) => row.currency === "AED")
      .reduce((sum, row) => sum + row.net_amount, 0),
    incomeEur: incomeThisMonth
      .filter((row) => row.currency === "EUR")
      .reduce((sum, row) => sum + row.net_amount, 0),
    expensesAed: expensesThisMonth
      .filter((row) => row.currency === "AED")
      .reduce((sum, row) => sum + row.net_amount, 0),
    expensesEur: expensesThisMonth
      .filter((row) => row.currency === "EUR")
      .reduce((sum, row) => sum + row.net_amount, 0),
    subscriptionsAed: subscriptionMonthly
      .filter(({ row }) => row.currency === "AED")
      .reduce((sum, { amount }) => sum + amount, 0),
    subscriptionsEur: subscriptionMonthly
      .filter(({ row }) => row.currency === "EUR")
      .reduce((sum, { amount }) => sum + amount, 0),
    vatAed: incomeThisMonth
      .filter((row) => row.currency === "AED")
      .reduce((sum, row) => sum + row.vat_amount, 0),
  };
  const revenueEur = sumResolvedEur(
    incomeThisMonth.map((row) => ({
      amount: row.net_amount,
      currency: row.currency,
    })),
  );
  const vatCollectedEur = sumResolvedEur(
    incomeThisMonth.map((row) => ({
      amount: row.vat_amount,
      currency: row.currency,
    })),
  );
  const grossInvoicedEur = sumResolvedEur(
    incomeThisMonth.map((row) => ({
      amount: row.gross_amount,
      currency: row.currency,
    })),
  );
  const mrrEur = sumResolvedEur(
    recurringIncome.map((row) => ({
      amount: monthlyCost(row),
      currency: row.currency,
    })),
  );
  const upcomingMrrEur = sumResolvedEur(
    upcomingRows
      .filter((row) => row.status === "upcoming")
      .map((row) => ({ amount: monthlyCost(row), currency: row.currency })),
  );
  const potentialPipeline = pipelineRows.filter(
    (row) => row.stage !== "won" && row.stage !== "lost",
  );
  const potentialPipelineEur = sumResolvedEur(
    potentialPipeline.map((row) => ({
      amount: monthlyCost(row),
      currency: row.currency,
    })),
  );
  const potentialPipelineUnconverted = potentialPipeline
    .filter((row) => toEur(monthlyCost(row), row.currency) === null)
    .map((row) => ({
      currency: row.currency,
      amount: monthlyCost(row),
      label: row.name,
    }));
  const recordedExpensesEur = sumResolvedEur(
    expensesThisMonth.map((row) => ({
      amount: row.net_amount,
      currency: row.currency,
    })),
  );
  const subscriptionExpensesEur = sumResolvedEur(
    subscriptionMonthly.map(({ row, amount }) => ({
      amount,
      currency: row.currency,
    })),
  );
  const inputVatEur = sumResolvedEur(
    expensesThisMonth.map((row) => ({
      amount: row.vat_amount,
      currency: row.currency,
    })),
  );
  const knownRecordedExpensesEur = expensesThisMonth.reduce(
    (sum, row) => sum + (toEur(row.net_amount, row.currency) ?? 0),
    0,
  );
  const knownSubscriptionExpensesEur = subscriptionMonthly.reduce(
    (sum, { row, amount }) => sum + (toEur(amount, row.currency) ?? 0),
    0,
  );
  const profitEur =
    revenueEur === null
      ? null
      : revenueEur - knownRecordedExpensesEur - knownSubscriptionExpensesEur;
  const netVatEur =
    vatCollectedEur === null || inputVatEur === null
      ? null
      : vatCollectedEur - inputVatEur;
  const aiApiSpendUsd = usageRows.reduce(
    (sum, row) => sum + row.cost_usd_actual,
    0,
  );
  const aiApiEstimatedUsd = usageRows.reduce(
    (sum, row) => sum + row.cost_usd_estimated,
    0,
  );
  const { start: currentMonthStart, end: currentMonthEnd } = selectedMonth;
  const inCurrentMonth = (value: string | null) =>
    Boolean(value && value >= currentMonthStart && value <= currentMonthEnd);
  const sumAed = (rows: Array<{ amount: number; currency: string }>) =>
    Math.round(
      rows.reduce(
        (sum, row) => sum + (toAed(row.amount, row.currency) ?? 0),
        0,
      ) * 100,
    ) / 100;
  const aedLabel = (amount: number) =>
    `AED ${new Intl.NumberFormat("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)}`;
  const expectedRevenueRows = incomeRows.filter((row) =>
    rowForThisMonth(row, selectedMonth.key),
  );
  // Legacy income payment fields remain visible for provenance, but cash truth
  // now comes from explicit invoice payment confirmations whenever present.
  const collectedRevenueRows = incomeRows.filter(
    (row) => row.payment_status === "paid" && inCurrentMonth(row.payment_date),
  );
  const legacyInvoicedRows = expectedRevenueRows.filter(
    (row) => row.payment_status === "invoiced",
  );
  const legacyOverdueRows = expectedRevenueRows.filter(
    (row) => row.payment_status === "overdue",
  );
  const unresolvedRevenueRows = expectedRevenueRows.filter(
    (row) => row.payment_status === "not_set",
  );
  const invoiceReadyRows = invoiceRows.filter(
    (row) => row.status === "ready_to_invoice",
  );
  const invoiceSentRows = invoiceRows.filter((row) =>
    ["due", "overdue", "paid"].includes(row.status),
  );
  const invoiceDueRows = invoiceRows.filter((row) => row.status === "due");
  const invoiceOverdueRows = invoiceRows.filter(
    (row) => row.status === "overdue",
  );
  const committedExpenseRows = expensesThisMonth.filter((row) =>
    ["committed", "paid"].includes(row.payment_status),
  );
  const paidExpenseRows = expensesThisMonth.filter(
    (row) => row.payment_status === "paid" && inCurrentMonth(row.payment_date),
  );
  const unpaidCommittedExpenseRows = expensesThisMonth.filter(
    (row) => row.payment_status === "committed",
  );
  const projectedExpenseRows = expensesThisMonth.filter(
    (row) => row.payment_status !== "cancelled",
  );
  const subscriptionCostRows = subscriptionMonthly.map(({ row, amount }) => ({
    amount,
    currency: row.currency,
  }));
  const actualUsageRows = usageRows.map((row) => ({
    amount: row.cost_usd_actual,
    currency: "USD",
  }));
  const expectedRevenueAed = sumAed(
    expectedRevenueRows.map((row) => ({
      amount: row.net_amount,
      currency: row.currency,
    })),
  );
  const legacyCollectedAed = sumAed(
    collectedRevenueRows.map((row) => ({
      amount: row.net_amount,
      currency: row.currency,
    })),
  );
  const invoiceCollectedAed = sumAed(
    invoiceRows.filter((row) => row.paid_amount !== null).map((row) => ({
      amount: row.paid_amount ?? 0,
      currency: row.currency,
    })),
  );
  const collectedRevenueAed = legacyCollectedAed + invoiceCollectedAed;
  const invoicedRevenueAed = sumAed([
    ...legacyInvoicedRows.map((row) => ({
      amount: row.net_amount,
      currency: row.currency,
    })),
    ...invoiceSentRows.map((row) => ({
      amount: row.amount,
      currency: row.currency,
    })),
  ]);
  const outstandingRevenueAed = sumAed([
    ...legacyInvoicedRows.map((row) => ({
      amount: row.net_amount,
      currency: row.currency,
    })),
    ...legacyOverdueRows.map((row) => ({
      amount: row.net_amount,
      currency: row.currency,
    })),
    ...invoiceRows
      .filter((row) => ["due", "overdue"].includes(row.status))
      .map((row) => ({
        amount: row.outstanding_amount,
        currency: row.currency,
      })),
  ]);
  const overdueRevenueAed = sumAed([
    ...legacyOverdueRows.map((row) => ({
      amount: row.net_amount,
      currency: row.currency,
    })),
    ...invoiceOverdueRows.map((row) => ({
      amount: row.outstanding_amount,
      currency: row.currency,
    })),
  ]);
  const unresolvedRevenueAed = sumAed(
    unresolvedRevenueRows.map((row) => ({
      amount: row.net_amount,
      currency: row.currency,
    })),
  );
  const accountsReceivableAed = outstandingRevenueAed;
  // Reconciled debit evidence is actual cash truth. A manually marked paid
  // expense without bank provenance remains visible, but cannot double-count
  // an expense that was posted from a bank allocation.
  const reconciledBusinessDebitRows = bankTransactionsThisMonth.filter(
    (row) =>
      row.signed_amount < 0 &&
      row.scope === "business" &&
      row.classification_status === "reconciled" &&
      row.matched_record_type === "expense",
  );
  const manuallyPaidExpenseRows = paidExpenseRows.filter(
    (row) => !row.source_reference?.startsWith("Bank reconciliation "),
  );
  const paidBusinessExpensesAed = sumAed([
    ...reconciledBusinessDebitRows.map((row) => ({
      amount: Math.abs(row.signed_amount),
      currency: row.currency,
    })),
    ...manuallyPaidExpenseRows.map((row) => ({
      amount: row.net_amount,
      currency: row.currency,
    })),
  ]);
  const upcomingCommittedObligationsAed = sumAed([
    ...subscriptionCostRows,
    ...unpaidCommittedExpenseRows.map((row) => ({
      amount: row.net_amount,
      currency: row.currency,
    })),
    ...actualUsageRows,
  ]);
  const projectedVariableExpensesAed = sumAed(
    usageRows.map((row) => ({
      amount: row.cost_usd_estimated,
      currency: "USD",
    })),
  );
  const committedBusinessExpensesAed = sumAed([
    ...subscriptionCostRows,
    ...committedExpenseRows.map((row) => ({
      amount: row.net_amount,
      currency: row.currency,
    })),
    ...actualUsageRows,
  ]);
  const projectedBusinessExpensesAed = sumAed([
    ...subscriptionCostRows,
    ...projectedExpenseRows.map((row) => ({
      amount: row.net_amount,
      currency: row.currency,
    })),
    ...actualUsageRows,
  ]);
  const paidOwnerDrawAed = sumAed(
    ownerDrawRows
      .filter((row) => row.status === "paid" && inCurrentMonth(row.paid_at))
      .map((row) => ({ amount: row.amount, currency: row.currency })),
  );
  const reserveTargetAed =
    Math.round(
      (capitalPolicyRow.custom_reserve_aed ??
        upcomingCommittedObligationsAed *
          capitalPolicyRow.reserve_target_months) * 100,
    ) / 100;
  const cashBeforeReserveAed =
    Math.round(
      (collectedRevenueAed -
        paidBusinessExpensesAed -
        upcomingCommittedObligationsAed -
        paidOwnerDrawAed) *
        100,
    ) / 100;
  const reinvestmentCapacityAed = Math.max(
    0,
    Math.round((cashBeforeReserveAed - reserveTargetAed) * 100) / 100,
  );
  const availableOwnerDrawAed = reinvestmentCapacityAed;
  const projectedOwnerDrawAed =
    Math.round((expectedRevenueAed - projectedBusinessExpensesAed) * 100) / 100;
  const personalExpensesAed = sumAed(
    personalExpenseRows
      .filter(
        (row) =>
          row.active &&
          (row.recurrence !== "one_off" || inCurrentMonth(row.expense_date)),
      )
      .map((row) => ({
        amount:
          row.recurrence === "one_off"
            ? row.amount
            : monthlyCost({
                billing_cycle: row.recurrence,
                amount: row.amount,
              }),
        currency: row.currency,
      })),
  );
  const expenseBreakdown = [
    ...subscriptionMonthly.map(({ row, amount }) => ({
      id: `subscription:${row.id}`,
      name: row.vendor,
      category: row.category,
      nativeAmount: amount,
      currency: row.currency,
      amountAed: toAed(amount, row.currency),
      recurrence: row.billing_cycle,
      paymentStatus: "committed" as const,
      dueDate: row.billing_date_known ? row.next_renewal_date : null,
      source: row.source_provenance ?? "Finance subscription record",
    })),
    ...committedExpenseRows.map((row) => ({
      id: `expense:${row.id}`,
      name: `${row.vendor} — ${row.description}`,
      category: row.category,
      nativeAmount: row.net_amount,
      currency: row.currency,
      amountAed: toAed(row.net_amount, row.currency),
      recurrence: row.billing_cycle,
      paymentStatus:
        row.payment_status === "paid"
          ? ("paid" as const)
          : ("committed" as const),
      dueDate: row.next_deduction_date,
      source:
        row.source_provenance ??
        "Legacy Finance expense record; source provenance not recorded.",
    })),
    ...(aiApiSpendUsd > 0
      ? [
          {
            id: `usage:${selectedMonth.key}`,
            name: "Recorded AI / API usage",
            category: "ai_usage",
            nativeAmount: aiApiSpendUsd,
            currency: "USD",
            amountAed: toAed(aiApiSpendUsd, "USD"),
            recurrence: "variable",
            paymentStatus: "unresolved" as const,
            dueDate: null,
            source: `${usageRows.length} canonical usage-ledger entries; payment timing is not recorded.`,
          },
        ]
      : []),
  ].sort((a, b) => (b.amountAed ?? 0) - (a.amountAed ?? 0));
  const categoryTotals = new Map<string, number>();
  expenseBreakdown.forEach((row) =>
    categoryTotals.set(
      row.category,
      (categoryTotals.get(row.category) ?? 0) + (row.amountAed ?? 0),
    ),
  );
  const expenseCategoryBreakdown = [...categoryTotals.entries()]
    .map(([category, amountAed]) => ({
      category,
      amountAed: Math.round(amountAed * 100) / 100,
      percentage: committedBusinessExpensesAed
        ? Math.round((amountAed / committedBusinessExpensesAed) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => b.amountAed - a.amountAed);
  const revenueReconciliation = expectedRevenueRows.map((row) => ({
    clientId: row.client_id,
    id: row.id,
    client: row.counterparty_name,
    expectedAed: toAed(row.net_amount, row.currency),
    invoicedAed:
      row.payment_status === "invoiced"
        ? (toAed(row.net_amount, row.currency) ?? 0)
        : 0,
    collectedAed:
      row.payment_status === "paid" && inCurrentMonth(row.payment_date)
        ? (toAed(row.net_amount, row.currency) ?? 0)
        : 0,
    outstandingAed: ["invoiced", "overdue"].includes(row.payment_status)
      ? (toAed(row.net_amount, row.currency) ?? 0)
      : 0,
    overdueAed:
      row.payment_status === "overdue"
        ? (toAed(row.net_amount, row.currency) ?? 0)
        : 0,
    unresolved: row.payment_status === "not_set",
    status:
      row.payment_status === "not_set"
        ? "Needs payment confirmation"
        : row.payment_status,
  }));
  const readyToInvoiceAed = sumAed(
    invoiceReadyRows.map((row) => ({
      amount: row.amount,
      currency: row.currency,
    })),
  );
  const dueRevenueAed = sumAed(
    invoiceDueRows.map((row) => ({
      amount: row.outstanding_amount,
      currency: row.currency,
    })),
  );
  const averageDaysOverdue = invoiceOverdueRows.length
    ? Math.round(
        (invoiceOverdueRows.reduce(
          (sum, row) => sum + (row.days_overdue ?? 0),
          0,
        ) /
          invoiceOverdueRows.length) *
          10,
      ) / 10
    : null;
  const nextInvoice =
    [...invoiceRows]
      .filter((row) => row.status === "due")
      .sort((a, b) =>
        (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"),
      )[0] ?? null;
  const nextExpectedPayment = nextInvoice
    ? {
        invoiceId: nextInvoice.id,
        client: nextInvoice.counterparty_name,
        dueAt: nextInvoice.due_at!,
        amountAed: toAed(nextInvoice.outstanding_amount, nextInvoice.currency),
      }
    : null;
  const activeInvestments = investmentRows.filter(
    (row) => !["purchased", "cancelled"].includes(row.status),
  );
  const investmentAed = (
    row: FinanceInvestment,
    amount = row.estimated_amount,
  ) => toAed(amount, row.currency);
  const plannedInvestmentAed = activeInvestments.reduce(
    (sum, row) => sum + (investmentAed(row) ?? 0),
    0,
  );
  const fundedInvestmentAed = activeInvestments.reduce(
    (sum, row) => sum + (investmentAed(row, row.allocated_amount) ?? 0),
    0,
  );
  const projectedReinvestmentAed = Math.max(
    0,
    Math.round(
      (expectedRevenueAed -
        projectedBusinessExpensesAed -
        reserveTargetAed -
        paidOwnerDrawAed) *
        100,
    ) / 100,
  );
  const priorityWeight = (value: FinanceInvestment["priority"]) =>
    value === "high" ? 0 : value === "normal" ? 1 : 2;
  let committedHigherNow = 0;
  let committedHigherProjected = 0;
  const investmentAffordability = [...activeInvestments]
    .sort(
      (a, b) =>
        priorityWeight(a.priority) - priorityWeight(b.priority) ||
        (investmentAed(a) ?? 0) - (investmentAed(b) ?? 0),
    )
    .map((row) => {
      const remaining = Math.max(
        0,
        (investmentAed(row) ?? 0) -
          (investmentAed(row, row.allocated_amount) ?? 0),
      );
      const nowAvailable = Math.max(
        0,
        reinvestmentCapacityAed - committedHigherNow,
      );
      const projectedAvailable = Math.max(
        0,
        projectedReinvestmentAed - committedHigherProjected,
      );
      const result = {
        id: row.id,
        affordableNow: remaining <= nowAvailable,
        projectedAffordable: remaining <= projectedAvailable,
        shortfallNowAed: Math.max(
          0,
          Math.round((remaining - nowAvailable) * 100) / 100,
        ),
        shortfallProjectedAed: Math.max(
          0,
          Math.round((remaining - projectedAvailable) * 100) / 100,
        ),
        availableNowAed: nowAvailable,
        projectedAvailableAed: projectedAvailable,
      };
      committedHigherNow += remaining;
      committedHigherProjected += remaining;
      return result;
    });
  const insights = [
    unresolvedRevenueRows.length
      ? `${unresolvedRevenueRows.length} client payment${unresolvedRevenueRows.length === 1 ? "" : "s"} need status confirmation (${aedLabel(unresolvedRevenueAed)}).`
      : null,
    upcomingCommittedObligationsAed
      ? `${aedLabel(upcomingCommittedObligationsAed)} of current commitments is reserved before any owner draw.`
      : null,
    readyToInvoiceAed
      ? `${aedLabel(readyToInvoiceAed)} is ready to invoice.`
      : null,
    invoiceOverdueRows.length
      ? `${aedLabel(overdueRevenueAed)} is overdue across ${invoiceOverdueRows.length} invoice${invoiceOverdueRows.length === 1 ? "" : "s"}.`
      : null,
    `Projected owner draw is ${aedLabel(projectedOwnerDrawAed - availableOwnerDrawAed)} higher than available cash because expected revenue has not been collected.`,
  ].filter((value): value is string => Boolean(value));
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const upcomingExpenses = subscriptionRows
    .filter((row) => row.status === "active")
    .map((row) => {
      const deductionDate = row.billing_date_known
        ? row.next_renewal_date
        : null;
      const daysUntil = deductionDate
        ? Math.ceil(
            (Date.parse(`${deductionDate}T00:00:00Z`) -
              Date.parse(`${today}T00:00:00Z`)) /
              86_400_000,
          )
        : null;
      return {
        id: row.id,
        vendor: row.vendor,
        amount: monthlyCost(row),
        currency: row.currency,
        amountAed: toAed(monthlyCost(row), row.currency),
        deductionDate,
        daysUntil,
        status:
          deductionDate === null
            ? ("needs_confirmation" as const)
            : daysUntil !== null && daysUntil <= 7
              ? ("due_soon" as const)
              : ("scheduled" as const),
        source: row.source_provenance ?? "Finance record",
      };
    })
    .sort((a, b) =>
      (a.deductionDate ?? "9999-12-31").localeCompare(
        b.deductionDate ?? "9999-12-31",
      ),
    );
  const timeline = [
    ...invoiceRows.map((row) => ({
      id: `invoice:${row.id}`,
      kind: "invoice" as const,
      date:
        row.status === "ready_to_invoice" || row.status === "upcoming"
          ? row.invoice_available_date
          : row.due_at,
      label: `${row.counterparty_name} · ${row.title}`,
      amountAed: toAed(row.outstanding_amount, row.currency),
      state:
        row.status === "overdue"
          ? `${row.days_overdue} days overdue`
          : row.status === "due"
            ? row.days_until_due === 0
              ? "Due today"
              : `Due in ${row.days_until_due} days`
            : row.status === "ready_to_invoice"
              ? "Ready to invoice"
              : row.status,
    })),
    ...upcomingExpenses.map((row) => ({
      id: `expense:${row.id}`,
      kind: "expense" as const,
      date: row.deductionDate,
      label: row.vendor,
      amountAed: row.amountAed,
      state:
        row.status === "due_soon"
          ? "Due soon"
          : row.status === "needs_confirmation"
            ? "Timing needs confirmation"
            : "Scheduled",
    })),
  ].sort((a, b) =>
    (a.date ?? "9999-12-31").localeCompare(b.date ?? "9999-12-31"),
  );
  const inSixtyDays = new Date();
  inSixtyDays.setDate(inSixtyDays.getDate() + 60);
  const upcomingRenewals = subscriptionRows.filter(
    (row) =>
      row.status === "active" &&
      row.next_renewal_date &&
      new Date(`${row.next_renewal_date}T00:00:00Z`) <= inSixtyDays,
  ).length;
  const names = new Map(
    (clients.data ?? []).map((client) => [client.id, client.name]),
  );
  const keyForIncome = (row: FinanceIncome) =>
    row.client_id
      ? `client:${row.client_id}`
      : `allocation:${row.counterparty_name.toLowerCase()}`;
  const keyForExpense = (row: FinanceExpense) =>
    row.client_id
      ? `client:${row.client_id}`
      : row.client_allocation_name
        ? `allocation:${row.client_allocation_name.toLowerCase()}`
        : null;
  const aggregate = new Map<
    string,
    {
      clientId: string | null;
      name: string;
      netEur: number | null;
      vatEur: number | null;
      grossEur: number | null;
      vatApplicable: boolean;
      directCostEur: number;
      sourceAmounts: Map<
        string,
        {
          currency: string;
          netAmount: number;
          vatAmount: number;
          grossAmount: number;
        }
      >;
    }
  >();
  incomeThisMonth.forEach((row) => {
    const key = keyForIncome(row);
    const name = row.client_id
      ? (names.get(row.client_id) ?? row.counterparty_name)
      : row.counterparty_name;
    const prior = aggregate.get(key) ?? {
      clientId: row.client_id,
      name,
      netEur: 0,
      vatEur: 0,
      grossEur: 0,
      vatApplicable: true,
      directCostEur: 0,
      sourceAmounts: new Map(),
    };
    const net = toEur(row.net_amount, row.currency);
    const vat = toEur(row.vat_amount, row.currency);
    const gross = toEur(row.gross_amount, row.currency);
    prior.netEur =
      prior.netEur === null || net === null ? null : prior.netEur + net;
    prior.vatEur =
      prior.vatEur === null || vat === null ? null : prior.vatEur + vat;
    prior.grossEur =
      prior.grossEur === null || gross === null ? null : prior.grossEur + gross;
    prior.vatApplicable = prior.vatApplicable && row.vat_applicable;
    const source = prior.sourceAmounts.get(row.currency) ?? {
      currency: row.currency,
      netAmount: 0,
      vatAmount: 0,
      grossAmount: 0,
    };
    source.netAmount += row.net_amount;
    source.vatAmount += row.vat_amount;
    source.grossAmount += row.gross_amount;
    prior.sourceAmounts.set(row.currency, source);
    aggregate.set(key, prior);
  });
  expensesThisMonth.forEach((row) => {
    const key = keyForExpense(row);
    if (!key) return;
    const prior = aggregate.get(key);
    const converted = toEur(row.net_amount, row.currency);
    if (prior && converted !== null) prior.directCostEur += converted;
  });
  const incomeByClient = [...aggregate.values()]
    .map((row) => ({
      clientId: row.clientId,
      name: row.name,
      netEur: row.netEur,
      vatEur: row.vatEur,
      grossEur: row.grossEur,
      vatApplicable: row.vatApplicable,
      knownDirectCostEur: row.directCostEur || 0,
      contributionBeforeSharedCostsEur:
        row.netEur === null ? null : row.netEur - row.directCostEur,
      sourceAmounts: [...row.sourceAmounts.values()],
    }))
    .sort((a, b) => (b.netEur ?? -Infinity) - (a.netEur ?? -Infinity));
  const profitExclusions = [
    ...new Set([
      ...unresolvedOperatingCosts.map((row) => `${row.currency} ${row.kind}`),
      ...(aiApiSpendUsd ? ["USD AI/API spend"] : []),
    ]),
  ];
  return {
    settings: financeSettings,
    income: incomeRows,
    invoices: invoiceRows,
    capitalPolicy: capitalPolicyRow,
    investments: investmentRows,
    bankStatements: bankStatementRows,
    bankTransactions: bankTransactionRows,
    upcomingRevenue: upcomingRows,
    pipeline: pipelineRows,
    expenses: expenseRows,
    receivables: receivableRows,
    subscriptions: subscriptionRows,
    fxRates: fxRows,
    ownerDraws: ownerDrawRows,
    personalExpenses: personalExpenseRows,
    clients: clients.data ?? [],
    usage: usageRows,
    summary: {
      selectedMonth: selectedMonth.key,
      revenueEur,
      vatCollectedEur,
      grossInvoicedEur,
      mrrEur,
      upcomingMrrEur,
      potentialPipelineEur,
      potentialPipelineUnconverted,
      recordedExpensesEur,
      subscriptionExpensesEur,
      knownOperatingCostsEur:
        knownRecordedExpensesEur + knownSubscriptionExpensesEur,
      knownSubscriptionExpensesEur,
      profitEur,
      inputVatEur,
      netVatEur,
      sourceTotals,
      unresolvedOperatingCosts,
      aiApiSpendUsd,
      aiApiEstimatedUsd,
      upcomingRenewals,
      incomeByClient,
      profitExclusions,
      usageDuplicatesSkipped: plannerRows.length - uniquePlanner.length,
      expectedRevenueAed,
      collectedRevenueAed,
      accountsReceivableAed,
      outstandingReceivableTotals,
      invoicedRevenueAed,
      outstandingRevenueAed,
      overdueRevenueAed,
      unresolvedRevenueAed,
      unresolvedRevenueCount: unresolvedRevenueRows.length,
      paidBusinessExpensesAed,
      upcomingCommittedObligationsAed,
      projectedVariableExpensesAed,
      totalBusinessCostsAed: committedBusinessExpensesAed,
      netCashGeneratedAed:
        Math.round((collectedRevenueAed - paidBusinessExpensesAed) * 100) / 100,
      committedBusinessExpensesAed,
      projectedBusinessExpensesAed,
      availableOwnerDrawAed,
      projectedOwnerDrawAed,
      paidOwnerDrawAed,
      remainingProjectedDrawAed:
        Math.round((projectedOwnerDrawAed - paidOwnerDrawAed) * 100) / 100,
      personalExpensesAed,
      personalNetCashFlowAed:
        Math.round((paidOwnerDrawAed - personalExpensesAed) * 100) / 100,
      expenseBreakdown,
      revenueReconciliation,
      expenseCategoryBreakdown,
      insights,
      upcomingExpenses,
      readyToInvoiceAed,
      dueRevenueAed,
      overdueInvoiceCount: invoiceOverdueRows.length,
      averageDaysOverdue,
      nextExpectedPayment,
      reserveTargetAed,
      reserveFundedAed: null,
      reinvestmentCapacityAed,
      unallocatedBusinessCashAed: reinvestmentCapacityAed,
      timeline,
      investmentSummary: {
        plannedAed: Math.round(plannedInvestmentAed * 100) / 100,
        fundedAed: Math.round(fundedInvestmentAed * 100) / 100,
        remainingAed:
          Math.round((plannedInvestmentAed - fundedInvestmentAed) * 100) / 100,
        affordableNow: investmentAffordability.filter(
          (row) => row.affordableNow,
        ).length,
        projectedAffordable: investmentAffordability.filter(
          (row) => row.projectedAffordable,
        ).length,
      },
      investmentAffordability,
      bankReviewCount: bankTransactionsThisMonth.filter(
        (row) =>
          row.classification_status === "needs_review" ||
          row.scope === "unresolved",
      ).length,
    },
    generatedAt: new Date().toISOString(),
  };
}

async function mutate(
  table: "jarvis_finance_income_records" | "jarvis_finance_expenses",
  recordType: "income" | "expense",
  id: string,
  expectedUpdatedAt: string | undefined,
  input: Record<string, unknown>,
  kind: "income" | "expense",
) {
  if (id !== "new" && (!isUuid(id) || !expectedUpdatedAt))
    throw new FinanceCostsError(`${recordType} update is invalid.`);
  const columns = kind === "income" ? incomeColumns : expenseColumns;
  const current =
    id === "new"
      ? undefined
      : await financeDb.from(table).select(columns).eq("id", id).maybeSingle();
  if (current?.error || (id !== "new" && !current?.data))
    throw new FinanceCostsError(
      `${recordType[0].toUpperCase() + recordType.slice(1)} was not found.`,
      404,
    );
  const existing = current?.data
    ? kind === "income"
      ? normalizeIncome(current.data as Record<string, unknown>)
      : normalizeExpense(current.data as Record<string, unknown>)
    : undefined;
  if (existing && existing.updated_at !== expectedUpdatedAt)
    throw new FinanceCostsError(
      `This ${recordType} changed elsewhere. Refresh before saving.`,
      409,
    );
  const values = financeValues(input, existing, kind);
  await ensureClient(values.client_id);
  const response =
    id === "new"
      ? await financeDb.from(table).insert(values).select("id").single()
      : await financeDb
          .from(table)
          .update(values)
          .eq("id", id)
          .eq("updated_at", expectedUpdatedAt!)
          .select("id")
          .maybeSingle();
  if (response.error || !response.data)
    throw new FinanceCostsError(
      `${recordType[0].toUpperCase() + recordType.slice(1)} could not be saved.`,
      500,
    );
  await activity(
    recordType,
    response.data.id,
    id === "new" ? "created" : "updated",
  );
  return loadFinanceSnapshot();
}
async function remove(
  table: "jarvis_finance_income_records" | "jarvis_finance_expenses",
  recordType: "income" | "expense",
  id: string,
  expectedUpdatedAt: string,
) {
  if (!isUuid(id) || !expectedUpdatedAt)
    throw new FinanceCostsError(`${recordType} deletion is invalid.`);
  const { data, error } = await financeDb
    .from(table)
    .delete()
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle();
  if (error || !data)
    throw new FinanceCostsError(
      `This ${recordType} changed elsewhere. Refresh before deleting.`,
      409,
    );
  await activity(recordType, id, "deleted");
  return loadFinanceSnapshot();
}
export const createIncome = (input: Record<string, unknown>) =>
  mutate(
    "jarvis_finance_income_records",
    "income",
    "new",
    undefined,
    input,
    "income",
  );
export const updateIncome = (
  id: string,
  expectedUpdatedAt: string,
  input: Record<string, unknown>,
) =>
  mutate(
    "jarvis_finance_income_records",
    "income",
    id,
    expectedUpdatedAt,
    input,
    "income",
  );
export const deleteIncome = (id: string, expectedUpdatedAt: string) =>
  remove("jarvis_finance_income_records", "income", id, expectedUpdatedAt);
export const createExpense = (input: Record<string, unknown>) =>
  mutate(
    "jarvis_finance_expenses",
    "expense",
    "new",
    undefined,
    input,
    "expense",
  );
export const updateExpense = (
  id: string,
  expectedUpdatedAt: string,
  input: Record<string, unknown>,
) =>
  mutate(
    "jarvis_finance_expenses",
    "expense",
    id,
    expectedUpdatedAt,
    input,
    "expense",
  );
export const deleteExpense = (id: string, expectedUpdatedAt: string) =>
  remove("jarvis_finance_expenses", "expense", id, expectedUpdatedAt);
export async function createReceivable(input: Record<string, unknown>) {
  const values = receivableValues(input);
  await ensureClient(values.client_id);
  const { data, error } = await financeDb
    .from("jarvis_finance_receivables")
    .insert(values)
    .select("id")
    .single();
  if (error || !data)
    throw new FinanceCostsError("Receivable could not be saved.", 500);
  await activity("receivable", data.id, "created");
  return loadFinanceSnapshot();
}
export async function createInvoice(input: Record<string, unknown>) {
  const values = invoiceValues(input);
  await ensureClient(values.client_id);
  const { data: income, error: incomeError } = await financeDb
    .from("jarvis_finance_income_records")
    .select("id,client_id,counterparty_name")
    .eq("id", values.income_record_id)
    .maybeSingle();
  if (incomeError || !income)
    throw new FinanceCostsError("The linked income record was not found.", 404);
  if (
    income.client_id &&
    values.client_id &&
    income.client_id !== values.client_id
  )
    throw new FinanceCostsError(
      "Invoice client must match the linked income record.",
    );
  const { data, error } = await financeDb
    .from("jarvis_finance_invoices")
    .insert({
      ...values,
      client_id: values.client_id ?? income.client_id,
      counterparty_name: values.counterparty_name || income.counterparty_name,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new FinanceCostsError(
      error?.code === "23505"
        ? "An invoice already exists for this revenue record and month."
        : "Invoice could not be saved.",
      500,
    );
  await activity("invoice", data.id, "created", {
    income_record_id: values.income_record_id,
  });
  return loadFinanceSnapshot(values.invoice_month.slice(0, 7));
}
export async function updateInvoice(
  id: string,
  expectedUpdatedAt: string,
  input: Record<string, unknown>,
) {
  if (!isUuid(id) || !expectedUpdatedAt)
    throw new FinanceCostsError("Invoice update is invalid.");
  const { data: current, error } = await financeDb
    .from("jarvis_finance_invoices")
    .select(invoiceColumns)
    .eq("id", id)
    .maybeSingle();
  if (error || !current)
    throw new FinanceCostsError("Invoice was not found.", 404);
  const existing = normalizeInvoice(current as Record<string, unknown>, []);
  if (existing.updated_at !== expectedUpdatedAt)
    throw new FinanceCostsError(
      "This invoice changed elsewhere. Refresh before saving.",
      409,
    );
  const values = invoiceValues(input, existing);
  await ensureClient(values.client_id);
  const { data, error: saveError } = await financeDb
    .from("jarvis_finance_invoices")
    .update(values)
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle();
  if (saveError || !data)
    throw new FinanceCostsError(
      "This invoice changed elsewhere. Refresh before saving.",
      409,
    );
  const action =
    values.paid_at && !existing.paid_at
      ? "paid"
      : values.sent_at && !existing.sent_at
        ? "sent"
        : "updated";
  await activity("invoice", id, action);
  return loadFinanceSnapshot(values.invoice_month.slice(0, 7));
}
export async function deleteInvoice(id: string, expectedUpdatedAt: string) {
  if (!isUuid(id) || !expectedUpdatedAt)
    throw new FinanceCostsError("Invoice deletion is invalid.");
  const { data, error } = await financeDb
    .from("jarvis_finance_invoices")
    .delete()
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle();
  if (error || !data)
    throw new FinanceCostsError(
      "This invoice changed elsewhere. Refresh before deleting.",
      409,
    );
  await activity("invoice", id, "deleted");
  return loadFinanceSnapshot();
}
export async function createInvestment(input: Record<string, unknown>) {
  const values = investmentValues(input);
  const { data, error } = await financeDb
    .from("jarvis_finance_investments")
    .insert(values)
    .select("id")
    .single();
  if (error || !data)
    throw new FinanceCostsError("Investment could not be saved.", 500);
  await activity("investment", data.id, "created");
  return loadFinanceSnapshot();
}
export async function updateInvestment(
  id: string,
  expectedUpdatedAt: string,
  input: Record<string, unknown>,
) {
  if (!isUuid(id) || !expectedUpdatedAt)
    throw new FinanceCostsError("Investment update is invalid.");
  const { data: current, error } = await financeDb
    .from("jarvis_finance_investments")
    .select(investmentColumns)
    .eq("id", id)
    .maybeSingle();
  if (error || !current)
    throw new FinanceCostsError("Investment was not found.", 404);
  const existing = normalizeInvestment(current as Record<string, unknown>);
  if (existing.updated_at !== expectedUpdatedAt)
    throw new FinanceCostsError(
      "This investment changed elsewhere. Refresh before saving.",
      409,
    );
  const values = investmentValues(input, existing);
  const { data, error: saveError } = await financeDb
    .from("jarvis_finance_investments")
    .update(values)
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle();
  if (saveError || !data)
    throw new FinanceCostsError(
      "This investment changed elsewhere. Refresh before saving.",
      409,
    );
  await activity(
    "investment",
    id,
    values.allocated_amount > existing.allocated_amount
      ? "allocated"
      : "updated",
  );
  return loadFinanceSnapshot();
}
export async function updateCapitalPolicy(
  input: Record<string, unknown>,
  expectedUpdatedAt?: string,
) {
  const { data: current, error } = await financeDb
    .from("jarvis_finance_capital_policy")
    .select(capitalPolicyColumns)
    .eq("id", "mc-studios")
    .maybeSingle();
  if (error)
    throw new FinanceCostsError("Capital policy could not be loaded.", 500);
  if (current && expectedUpdatedAt && current.updated_at !== expectedUpdatedAt)
    throw new FinanceCostsError(
      "Capital policy changed elsewhere. Refresh before saving.",
      409,
    );
  const months = optionalNumber(
    input.reserve_target_months,
    "Reserve months",
    24,
  );
  const custom = optionalNumber(
    input.custom_reserve_aed,
    "Custom reserve",
    10_000_000,
  );
  if (months === null)
    throw new FinanceCostsError("Reserve months is required.");
  const { error: saveError } = await financeDb
    .from("jarvis_finance_capital_policy")
    .upsert(
      {
        id: "mc-studios",
        reserve_target_months: months,
        custom_reserve_aed: custom,
      },
      { onConflict: "id" },
    );
  if (saveError)
    throw new FinanceCostsError("Capital policy could not be saved.", 500);
  await activity("capital_policy", "mc-studios", "updated");
  return loadFinanceSnapshot();
}
async function mutateForecast(
  table: "jarvis_finance_upcoming_revenue" | "jarvis_finance_pipeline",
  recordType: "upcoming_revenue" | "pipeline",
  id: string,
  expectedUpdatedAt: string | undefined,
  input: Record<string, unknown>,
) {
  if (id !== "new" && (!isUuid(id) || !expectedUpdatedAt))
    throw new FinanceCostsError(`${recordType} update is invalid.`);
  const columns =
    recordType === "upcoming_revenue"
      ? upcomingRevenueColumns
      : pipelineColumns;
  const current =
    id === "new"
      ? undefined
      : await financeDb.from(table).select(columns).eq("id", id).maybeSingle();
  if (current?.error || (id !== "new" && !current?.data))
    throw new FinanceCostsError(
      `${recordType === "pipeline" ? "Pipeline record" : "Upcoming revenue"} was not found.`,
      404,
    );
  const existing = current?.data
    ? recordType === "upcoming_revenue"
      ? normalizeUpcomingRevenue(current.data as Record<string, unknown>)
      : normalizePipeline(current.data as Record<string, unknown>)
    : undefined;
  if (existing && existing.updated_at !== expectedUpdatedAt)
    throw new FinanceCostsError(
      "This record changed elsewhere. Refresh before saving.",
      409,
    );
  const values =
    recordType === "upcoming_revenue"
      ? futureRevenueValues(
          input,
          existing as FinanceUpcomingRevenue | undefined,
        )
      : pipelineValues(input, existing as FinancePipelineRecord | undefined);
  await ensureClient(values.client_id);
  const response =
    id === "new"
      ? await financeDb.from(table).insert(values).select("id").single()
      : await financeDb
          .from(table)
          .update(values)
          .eq("id", id)
          .eq("updated_at", expectedUpdatedAt!)
          .select("id")
          .maybeSingle();
  if (response.error || !response.data)
    throw new FinanceCostsError("Forecast record could not be saved.", 500);
  await activity(
    recordType,
    response.data.id,
    id === "new"
      ? "created"
      : input.stage === "won"
        ? "won"
        : input.stage === "lost"
          ? "lost"
          : "updated",
  );
  return loadFinanceSnapshot();
}
export const createUpcomingRevenue = (input: Record<string, unknown>) =>
  mutateForecast(
    "jarvis_finance_upcoming_revenue",
    "upcoming_revenue",
    "new",
    undefined,
    input,
  );
export const updateUpcomingRevenue = (
  id: string,
  expectedUpdatedAt: string,
  input: Record<string, unknown>,
) =>
  mutateForecast(
    "jarvis_finance_upcoming_revenue",
    "upcoming_revenue",
    id,
    expectedUpdatedAt,
    input,
  );
export const createPipelineRecord = (input: Record<string, unknown>) =>
  mutateForecast(
    "jarvis_finance_pipeline",
    "pipeline",
    "new",
    undefined,
    input,
  );
export const updatePipelineRecord = (
  id: string,
  expectedUpdatedAt: string,
  input: Record<string, unknown>,
) =>
  mutateForecast(
    "jarvis_finance_pipeline",
    "pipeline",
    id,
    expectedUpdatedAt,
    input,
  );
export async function createOwnerDraw(input: Record<string, unknown>) {
  const status =
    input.status === "paid" || input.status === "cancelled"
      ? input.status
      : "planned";
  const paidAt = status === "paid" ? isoDate(input.paid_at, "Paid date") : null;
  if (status === "paid" && !paidAt)
    throw new FinanceCostsError("A paid owner draw requires its paid date.");
  const values = {
    amount: positiveNumber(input.amount, "Owner draw amount", false),
    currency: currency(input.currency ?? "AED"),
    status,
    business_period_start:
      isoDate(input.business_period_start, "Business period") ??
      currentMonthBounds().start,
    paid_at: paidAt,
    notes: optionalText(input.notes, "Notes", 3000),
  };
  const { data, error } = await financeDb
    .from("jarvis_finance_owner_draws")
    .insert(values)
    .select("id")
    .single();
  if (error || !data)
    throw new FinanceCostsError("Owner draw could not be recorded.", 500);
  await activity(
    "owner_draw",
    data.id,
    status === "paid" ? "paid" : "created",
    { linked_personal_income: status === "paid" },
  );
  return loadFinanceSnapshot();
}
export async function createPersonalExpense(input: Record<string, unknown>) {
  const category = input.category ?? "other";
  const recurrence = input.recurrence ?? "one_off";
  if (
    typeof category !== "string" ||
    ![
      "rent",
      "subscriptions",
      "food",
      "transport",
      "travel",
      "investing",
      "savings",
      "other",
    ].includes(category) ||
    !isSubscriptionCycle(recurrence)
  )
    throw new FinanceCostsError(
      "Personal expense category or recurrence is invalid.",
    );
  const values = {
    name: text(input.name, "Personal expense name", 160, true),
    category,
    amount: positiveNumber(input.amount, "Personal expense amount"),
    currency: currency(input.currency ?? "AED"),
    recurrence,
    expense_date: isoDate(input.expense_date, "Expense date"),
    active: input.active !== false,
    notes: optionalText(input.notes, "Notes", 3000),
  };
  const { data, error } = await financeDb
    .from("jarvis_personal_expenses")
    .insert(values)
    .select("id")
    .single();
  if (error || !data)
    throw new FinanceCostsError("Personal expense could not be recorded.", 500);
  await activity("personal_expense", data.id, "created");
  return loadFinanceSnapshot();
}
export async function activateUpcomingRevenue(
  id: string,
  expectedUpdatedAt: string,
) {
  if (!isUuid(id) || !expectedUpdatedAt)
    throw new FinanceCostsError("Upcoming revenue activation is invalid.");
  const { data: incomeId, error } = await financeDb.rpc(
    "activate_jarvis_finance_upcoming_revenue",
    { p_id: id, p_expected_updated_at: expectedUpdatedAt },
  );
  if (error || !incomeId)
    throw new FinanceCostsError(
      error?.message ??
        "Upcoming revenue changed elsewhere. Refresh before activating.",
      409,
    );
  await activity("upcoming_revenue", id, "activated", { income_id: incomeId });
  await activity("income", incomeId, "created", {
    source: "upcoming_revenue",
    upcoming_revenue_id: id,
  });
  return loadFinanceSnapshot();
}
export async function createSubscription(input: Record<string, unknown>) {
  const values = subscriptionValues(input);
  await ensureClient(values.client_id);
  const { data, error } = await db
    .from("jarvis_cost_subscriptions")
    .insert(values)
    .select("id")
    .single();
  if (error || !data)
    throw new FinanceCostsError("Subscription could not be created.", 500);
  await activity("subscription", data.id, "created");
  return loadFinanceSnapshot();
}
export async function updateSubscription(
  id: string,
  expectedUpdatedAt: string,
  input: Record<string, unknown>,
) {
  if (!isUuid(id) || !expectedUpdatedAt)
    throw new FinanceCostsError("Subscription update is invalid.");
  const { data: current, error } = await db
    .from("jarvis_cost_subscriptions")
    .select(subscriptionColumns)
    .eq("id", id)
    .maybeSingle();
  if (error || !current)
    throw new FinanceCostsError("Subscription not found.", 404);
  const existing = normalizeSubscription(current);
  if (existing.updated_at !== expectedUpdatedAt)
    throw new FinanceCostsError(
      "This subscription changed elsewhere. Refresh before saving.",
      409,
    );
  const values = subscriptionValues(input, existing);
  await ensureClient(values.client_id);
  const { data } = await db
    .from("jarvis_cost_subscriptions")
    .update(values)
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle();
  if (!data)
    throw new FinanceCostsError(
      "This subscription changed elsewhere. Refresh before saving.",
      409,
    );
  await activity("subscription", id, "updated");
  return loadFinanceSnapshot();
}
export async function deleteSubscription(
  id: string,
  expectedUpdatedAt: string,
) {
  if (!isUuid(id) || !expectedUpdatedAt)
    throw new FinanceCostsError("Subscription deletion is invalid.");
  const { data, error } = await db
    .from("jarvis_cost_subscriptions")
    .delete()
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle();
  if (error || !data)
    throw new FinanceCostsError(
      "This subscription changed elsewhere. Refresh before deleting.",
      409,
    );
  await activity("subscription", id, "deleted");
  return loadFinanceSnapshot();
}
export async function updateFinanceSettings(
  input: Record<string, unknown>,
  expectedUpdatedAt?: string,
) {
  const displayCurrency = input.display_currency;
  if (!isFinanceDisplayMode(displayCurrency))
    throw new FinanceCostsError("Display currency is invalid.");
  const hasAedPerEurRate = Object.prototype.hasOwnProperty.call(
    input,
    "aed_per_eur_rate",
  );
  const rawRate = hasAedPerEurRate
    ? input.aed_per_eur_rate
    : input.aed_eur_rate;
  const enteredRate =
    rawRate === "" || rawRate === null || rawRate === undefined
      ? null
      : positiveNumber(
          rawRate,
          hasAedPerEurRate
            ? "AED per EUR exchange rate"
            : "AED to EUR exchange rate",
          false,
        );
  const rate =
    enteredRate === null
      ? null
      : hasAedPerEurRate
        ? 1 / enteredRate
        : enteredRate;
  const { data: current, error } = await financeDb
    .from("jarvis_finance_settings")
    .select(settingColumns)
    .eq("id", "mc-studios")
    .maybeSingle();
  if (error)
    throw new FinanceCostsError("Finance settings could not be loaded.", 500);
  if (current && expectedUpdatedAt && current.updated_at !== expectedUpdatedAt)
    throw new FinanceCostsError(
      "Finance settings changed elsewhere. Refresh before saving.",
      409,
    );
  const { error: saveError } = await financeDb
    .from("jarvis_finance_settings")
    .upsert(
      {
        id: "mc-studios",
        source_currency: "AED",
        display_currency: displayCurrency,
        aed_eur_rate: rate,
        rate_source: "manual",
        rate_effective_at: rate === null ? null : new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  if (saveError)
    throw new FinanceCostsError("Finance settings could not be saved.", 500);
  await activity("settings", "mc-studios", "updated", {
    display_currency: displayCurrency,
    has_manual_rate: rate !== null,
  });
  return loadFinanceSnapshot();
}
