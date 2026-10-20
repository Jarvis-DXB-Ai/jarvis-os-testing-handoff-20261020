export const SUBSCRIPTION_CATEGORIES = [
  "ai",
  "infrastructure",
  "development",
  "research",
  "creative",
  "social",
  "analytics",
  "communication",
  "other",
] as const;
export const SUBSCRIPTION_CYCLES = [
  "monthly",
  "annual",
  "quarterly",
  "one_off",
] as const;
export const SUBSCRIPTION_STATUSES = ["active", "paused", "cancelled"] as const;
export const ALLOCATION_SCOPES = ["agency_wide", "client_specific"] as const;
export const INCOME_TYPES = [
  "recurring_service_revenue",
  "one_off_revenue",
  "other_revenue",
] as const;
export const PAYMENT_STATUSES = [
  "not_set",
  "expected",
  "invoiced",
  "paid",
  "overdue",
] as const;
export const EXPENSE_CATEGORIES = [
  "operating",
  "contractors",
  "software",
  "office",
  "advertising",
  "equipment",
  "professional_services",
  "travel",
  "other",
] as const;
export const FINANCE_DISPLAY_MODES = ["aed", "eur", "usd", "both"] as const;
export const UPCOMING_REVENUE_STATUSES = [
  "upcoming",
  "activated",
  "cancelled",
] as const;
export const PIPELINE_STAGES = [
  "not_contacted",
  "referred",
  "contacted",
  "talks_pending",
  "proposal",
  "negotiation",
  "verbal_agreement",
  "won",
  "lost",
] as const;
export const RECEIVABLE_STATUSES = ["outstanding", "settled", "written_off"] as const;

export type SubscriptionCategory = (typeof SUBSCRIPTION_CATEGORIES)[number];
export type SubscriptionCycle = (typeof SUBSCRIPTION_CYCLES)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type AllocationScope = (typeof ALLOCATION_SCOPES)[number];
export type IncomeType = (typeof INCOME_TYPES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type FinanceDisplayMode = (typeof FINANCE_DISPLAY_MODES)[number];
export type UpcomingRevenueStatus = (typeof UPCOMING_REVENUE_STATUSES)[number];
export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type ReceivableStatus = (typeof RECEIVABLE_STATUSES)[number];

export type CostSubscription = {
  id: string;
  source_key: string | null;
  vendor: string;
  plan_name: string | null;
  category: SubscriptionCategory;
  currency: string;
  amount: number;
  billing_cycle: SubscriptionCycle;
  start_date: string | null;
  next_renewal_date: string | null;
  status: SubscriptionStatus;
  allocation_scope: AllocationScope;
  client_id: string | null;
  notes: string | null;
  documentation_url: string | null;
  source_provenance: string | null;
  billing_day: number | null;
  billing_date_known: boolean;
  base_amount: number | null;
  discount_percent: number | null;
  discount_temporary: boolean;
  discount_end_date: string | null;
  fx_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};
export type FinanceIncome = {
  id: string;
  source_key: string | null;
  client_id: string | null;
  counterparty_name: string;
  description: string;
  income_type: IncomeType;
  net_amount: number;
  currency: string;
  vat_rate: number;
  vat_amount: number;
  gross_amount: number;
  vat_applicable: boolean;
  billing_cycle: SubscriptionCycle;
  start_date: string | null;
  end_date: string | null;
  next_billing_date: string | null;
  due_date: string | null;
  payment_date: string | null;
  payment_status: PaymentStatus;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
export type FinanceExpense = {
  id: string;
  source_key: string | null;
  client_id: string | null;
  client_allocation_name: string | null;
  vendor: string;
  description: string;
  category: ExpenseCategory;
  net_amount: number;
  currency: string;
  vat_rate: number;
  vat_amount: number;
  gross_amount: number;
  billing_cycle: SubscriptionCycle;
  expense_date: string | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  payment_status: "planned" | "committed" | "paid" | "cancelled";
  payment_date: string | null;
  billing_day: number | null;
  next_deduction_date: string | null;
  source_provenance: string | null;
  source_reference: string | null;
  fx_snapshot: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
export type FinanceReceivable = {
  id: string;
  source_key: string | null;
  client_id: string | null;
  debtor_name: string;
  description: string;
  amount: number;
  currency: string;
  status: ReceivableStatus;
  source_reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
export type FinanceFxRate = {
  id: string;
  rate_date: string;
  base_currency: string;
  quote_currency: string;
  rate: number;
  source: string;
  source_url: string | null;
  fetched_at: string;
};
export type FinanceOwnerDraw = {
  id: string;
  amount: number;
  currency: string;
  status: "planned" | "paid" | "cancelled";
  business_period_start: string;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
export type PersonalExpense = {
  id: string;
  name: string;
  category:
    | "rent"
    | "subscriptions"
    | "food"
    | "transport"
    | "travel"
    | "investing"
    | "savings"
    | "other";
  amount: number;
  currency: string;
  recurrence: SubscriptionCycle;
  expense_date: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
export type FinanceSettings = {
  id: string;
  source_currency: "AED";
  display_currency: FinanceDisplayMode;
  aed_eur_rate: number | null;
  rate_source: "manual";
  rate_effective_at: string | null;
  created_at: string;
  updated_at: string;
};
export type FinanceUpcomingRevenue = {
  id: string;
  source_key: string | null;
  client_id: string | null;
  counterparty_name: string;
  description: string;
  net_amount: number;
  currency: string;
  vat_rate: number;
  vat_amount: number;
  gross_amount: number;
  vat_applicable: boolean;
  billing_cycle: SubscriptionCycle;
  expected_start_date: string;
  status: UpcomingRevenueStatus;
  notes: string | null;
  activated_income_id: string | null;
  created_at: string;
  updated_at: string;
};
export type FinancePipelineRecord = {
  id: string;
  source_key: string | null;
  client_id: string | null;
  name: string;
  description: string | null;
  stage: PipelineStage;
  stage_detail: string | null;
  net_amount: number;
  currency: string;
  vat_rate: number;
  vat_amount: number;
  gross_amount: number;
  vat_applicable: boolean;
  billing_cycle: SubscriptionCycle;
  expected_start_date: string | null;
  probability: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
export type UsageCostRow = {
  id: string;
  provider: string;
  feature: string;
  client_id: string | null;
  cost_usd_actual: number;
  cost_usd_estimated: number;
  source: "ai_usage_logs" | "monthly_planner";
  recorded_at: string;
};
export type FinanceInvoiceStatus =
  "upcoming" | "ready_to_invoice" | "due" | "overdue" | "paid";
export type FinanceInvoiceAttachment = {
  id: string;
  invoice_id: string;
  client_id: string | null;
  storage_bucket: "finance-documents";
  storage_path: string;
  file_name: string;
  mime_type: "application/pdf" | "image/jpeg" | "image/png";
  byte_size: number;
  created_at: string;
  signed_url?: string | null;
};
export type FinanceInvoice = {
  id: string;
  source_key: string | null;
  income_record_id: string;
  client_id: string | null;
  counterparty_name: string;
  title: string;
  invoice_number: string | null;
  invoice_month: string;
  amount: number;
  currency: string;
  invoice_available_date: string | null;
  sent_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  payment_reference: string | null;
  notes: string | null;
  provenance: string;
  created_at: string;
  updated_at: string;
  status: FinanceInvoiceStatus;
  days_overdue: number | null;
  days_until_due: number | null;
  outstanding_amount: number;
  attachments: FinanceInvoiceAttachment[];
};
export type FinanceCapitalPolicy = {
  id: "mc-studios";
  reserve_target_months: number;
  custom_reserve_aed: number | null;
  created_at: string;
  updated_at: string;
};
export type FinanceInvestment = {
  id: string;
  source_key: string | null;
  name: string;
  category: string;
  estimated_amount: number;
  currency: string;
  classification: "business" | "personal";
  priority: "high" | "normal" | "low";
  desired_purchase_date: string | null;
  status:
    "planned" | "saving" | "affordable" | "purchased" | "paused" | "cancelled";
  allocated_amount: number;
  notes: string | null;
  source_provenance: string;
  created_at: string;
  updated_at: string;
};
export type FinanceBankStatement = {
  id: string;
  client_id: string | null;
  account_label: string;
  statement_start_date: string | null;
  statement_end_date: string | null;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  currency: string | null;
  opening_balance: number | null;
  closing_balance: number | null;
  parser: string;
  status: "parsing" | "review" | "reconciled" | "failed";
  imported_at: string;
  transaction_count: number;
  matched_count: number;
  unresolved_count: number;
  excluded_count: number;
};
export type FinanceBankTransaction = {
  id: string;
  statement_id: string;
  transaction_date: string;
  posting_date: string | null;
  description: string;
  merchant: string | null;
  debit: number;
  credit: number;
  signed_amount: number;
  currency: string;
  reference: string | null;
  account_label: string;
  raw_source: string;
  scope: "business" | "personal" | "transfer" | "unresolved" | "excluded";
  category: string | null;
  classification_status:
    | "needs_review"
    | "suggested"
    | "confirmed"
    | "reconciled"
    | "excluded"
    | "duplicate";
  confidence: "high" | "medium" | "low";
  classification_source: string;
  classification_reason: string | null;
  matched_record_type: string | null;
  matched_record_id: string | null;
  confirmed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
export type FinanceSummary = {
  selectedMonth: string;
  revenueEur: number | null;
  vatCollectedEur: number | null;
  grossInvoicedEur: number | null;
  mrrEur: number | null;
  recordedExpensesEur: number | null;
  subscriptionExpensesEur: number | null;
  knownOperatingCostsEur: number;
  knownSubscriptionExpensesEur: number;
  profitEur: number | null;
  inputVatEur: number | null;
  netVatEur: number | null;
  sourceTotals: {
    incomeAed: number;
    incomeEur: number;
    expensesAed: number;
    expensesEur: number;
    subscriptionsAed: number;
    subscriptionsEur: number;
    vatAed: number;
  };
  unresolvedOperatingCosts: Array<{
    kind: "expense" | "subscription";
    currency: string;
    amount: number;
    label: string;
  }>;
  aiApiSpendUsd: number;
  aiApiEstimatedUsd: number;
  upcomingRenewals: number;
  incomeByClient: Array<{
    clientId?: string | null;
    name: string;
    netEur: number | null;
    vatEur: number | null;
    grossEur: number | null;
    vatApplicable: boolean;
    knownDirectCostEur: number | null;
    contributionBeforeSharedCostsEur: number | null;
    sourceAmounts: Array<{
      currency: string;
      netAmount: number;
      vatAmount: number;
      grossAmount: number;
    }>;
  }>;
  profitExclusions: string[];
  usageDuplicatesSkipped: number;
  upcomingMrrEur: number | null;
  potentialPipelineEur: number | null;
  potentialPipelineUnconverted: Array<{
    currency: string;
    amount: number;
    label: string;
  }>;
  expectedRevenueAed: number;
  collectedRevenueAed: number;
  accountsReceivableAed: number;
  outstandingReceivableTotals: Array<{
    currency: string;
    amount: number;
    count: number;
  }>;
  committedBusinessExpensesAed: number;
  projectedBusinessExpensesAed: number;
  availableOwnerDrawAed: number;
  projectedOwnerDrawAed: number;
  paidOwnerDrawAed: number;
  personalExpensesAed: number;
  personalNetCashFlowAed: number;
  invoicedRevenueAed: number;
  outstandingRevenueAed: number;
  overdueRevenueAed: number;
  unresolvedRevenueAed: number;
  unresolvedRevenueCount: number;
  paidBusinessExpensesAed: number;
  upcomingCommittedObligationsAed: number;
  projectedVariableExpensesAed: number;
  totalBusinessCostsAed: number;
  netCashGeneratedAed: number;
  remainingProjectedDrawAed: number;
  expenseBreakdown: Array<{
    id: string;
    name: string;
    category: string;
    nativeAmount: number;
    currency: string;
    amountAed: number | null;
    recurrence: string;
    paymentStatus: "paid" | "committed" | "unresolved";
    dueDate: string | null;
    source: string;
  }>;
  revenueReconciliation: Array<{
    clientId?: string | null;
    id: string;
    client: string;
    expectedAed: number | null;
    invoicedAed: number;
    collectedAed: number;
    outstandingAed: number;
    overdueAed: number;
    unresolved: boolean;
    status: string;
  }>;
  expenseCategoryBreakdown: Array<{
    category: string;
    amountAed: number;
    percentage: number;
  }>;
  insights: string[];
  upcomingExpenses: Array<{
    id: string;
    vendor: string;
    amount: number;
    currency: string;
    amountAed: number | null;
    deductionDate: string | null;
    daysUntil: number | null;
    status: "scheduled" | "due_soon" | "needs_confirmation";
    source: string;
  }>;
  readyToInvoiceAed: number;
  dueRevenueAed: number;
  overdueInvoiceCount: number;
  averageDaysOverdue: number | null;
  nextExpectedPayment: {
    invoiceId: string;
    client: string;
    dueAt: string;
    amountAed: number | null;
  } | null;
  reserveTargetAed: number;
  reserveFundedAed: number | null;
  reinvestmentCapacityAed: number;
  unallocatedBusinessCashAed: number;
  timeline: Array<{
    id: string;
    kind: "invoice" | "expense";
    date: string | null;
    label: string;
    amountAed: number | null;
    state: string;
  }>;
  investmentSummary: {
    plannedAed: number;
    fundedAed: number;
    remainingAed: number;
    affordableNow: number;
    projectedAffordable: number;
  };
  investmentAffordability: Array<{
    id: string;
    affordableNow: boolean;
    projectedAffordable: boolean;
    shortfallNowAed: number;
    shortfallProjectedAed: number;
    availableNowAed: number;
    projectedAvailableAed: number;
  }>;
  bankReviewCount: number;
};
export type FinanceSnapshot = {
  settings: FinanceSettings;
  income: FinanceIncome[];
  invoices: FinanceInvoice[];
  capitalPolicy: FinanceCapitalPolicy;
  investments: FinanceInvestment[];
  bankStatements: FinanceBankStatement[];
  bankTransactions: FinanceBankTransaction[];
  upcomingRevenue: FinanceUpcomingRevenue[];
  pipeline: FinancePipelineRecord[];
  expenses: FinanceExpense[];
  receivables: FinanceReceivable[];
  subscriptions: CostSubscription[];
  fxRates: FinanceFxRate[];
  ownerDraws: FinanceOwnerDraw[];
  personalExpenses: PersonalExpense[];
  clients: Array<{ id: string; name: string }>;
  usage: UsageCostRow[];
  summary: FinanceSummary;
  generatedAt: string;
};

export const subscriptionCategoryLabel = (value: SubscriptionCategory) =>
  ({
    ai: "AI",
    infrastructure: "Infrastructure",
    development: "Development",
    research: "Research",
    creative: "Creative",
    social: "Social",
    analytics: "Analytics",
    communication: "Communication",
    other: "Other",
  })[value];
export const billingCycleLabel = (value: SubscriptionCycle) =>
  ({
    monthly: "Monthly",
    annual: "Annual",
    quarterly: "Quarterly",
    one_off: "One-off",
  })[value];
export const incomeTypeLabel = (value: IncomeType) =>
  ({
    recurring_service_revenue: "Recurring service revenue",
    one_off_revenue: "One-off revenue",
    other_revenue: "Other revenue",
  })[value];
export const paymentStatusLabel = (value: PaymentStatus) =>
  ({
    not_set: "Not set",
    expected: "Expected",
    invoiced: "Invoiced",
    paid: "Paid",
    overdue: "Overdue",
  })[value];
export const expenseCategoryLabel = (value: ExpenseCategory) =>
  ({
    operating: "Operating",
    contractors: "Contractors",
    software: "Software",
    office: "Office",
    advertising: "Advertising",
    equipment: "Equipment",
    professional_services: "Professional services",
    travel: "Travel",
    other: "Other",
  })[value];
export const upcomingRevenueStatusLabel = (value: UpcomingRevenueStatus) =>
  ({ upcoming: "Upcoming", activated: "Activated", cancelled: "Cancelled" })[
    value
  ];
export const pipelineStageLabel = (value: PipelineStage) =>
  ({
    not_contacted: "Not contacted",
    referred: "Referred",
    contacted: "Contacted",
    talks_pending: "Talks pending",
    proposal: "Proposal",
    negotiation: "Negotiation",
    verbal_agreement: "Verbal agreement",
    won: "Won",
    lost: "Lost",
  })[value];
export const monthlyCost = (row: {
  billing_cycle: SubscriptionCycle;
  amount?: number;
  net_amount?: number;
}) => {
  const amount = row.net_amount ?? row.amount ?? 0;
  return row.billing_cycle === "annual"
    ? amount / 12
    : row.billing_cycle === "quarterly"
      ? amount / 3
      : row.billing_cycle === "monthly"
        ? amount
        : 0;
};
export const isSubscriptionCategory = (
  value: unknown,
): value is SubscriptionCategory =>
  typeof value === "string" &&
  SUBSCRIPTION_CATEGORIES.includes(value as SubscriptionCategory);
export const isSubscriptionCycle = (
  value: unknown,
): value is SubscriptionCycle =>
  typeof value === "string" &&
  SUBSCRIPTION_CYCLES.includes(value as SubscriptionCycle);
export const isSubscriptionStatus = (
  value: unknown,
): value is SubscriptionStatus =>
  typeof value === "string" &&
  SUBSCRIPTION_STATUSES.includes(value as SubscriptionStatus);
export const isAllocationScope = (value: unknown): value is AllocationScope =>
  typeof value === "string" &&
  ALLOCATION_SCOPES.includes(value as AllocationScope);
export const isIncomeType = (value: unknown): value is IncomeType =>
  typeof value === "string" && INCOME_TYPES.includes(value as IncomeType);
export const isPaymentStatus = (value: unknown): value is PaymentStatus =>
  typeof value === "string" &&
  PAYMENT_STATUSES.includes(value as PaymentStatus);
export const isExpenseCategory = (value: unknown): value is ExpenseCategory =>
  typeof value === "string" &&
  EXPENSE_CATEGORIES.includes(value as ExpenseCategory);
export const isFinanceDisplayMode = (
  value: unknown,
): value is FinanceDisplayMode =>
  typeof value === "string" &&
  FINANCE_DISPLAY_MODES.includes(value as FinanceDisplayMode);
export const isUpcomingRevenueStatus = (
  value: unknown,
): value is UpcomingRevenueStatus =>
  typeof value === "string" &&
  UPCOMING_REVENUE_STATUSES.includes(value as UpcomingRevenueStatus);
export const isPipelineStage = (value: unknown): value is PipelineStage =>
  typeof value === "string" && PIPELINE_STAGES.includes(value as PipelineStage);
export const eurForAed = (amount: number, rate: number | null) =>
  rate === null ? null : amount * rate;
