"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  ALLOCATION_SCOPES,
  EXPENSE_CATEGORIES,
  FINANCE_DISPLAY_MODES,
  INCOME_TYPES,
  PAYMENT_STATUSES,
  PIPELINE_STAGES,
  SUBSCRIPTION_CATEGORIES,
  SUBSCRIPTION_CYCLES,
  SUBSCRIPTION_STATUSES,
  UPCOMING_REVENUE_STATUSES,
  billingCycleLabel,
  expenseCategoryLabel,
  incomeTypeLabel,
  monthlyCost,
  paymentStatusLabel,
  pipelineStageLabel,
  subscriptionCategoryLabel,
  upcomingRevenueStatusLabel,
  type CostSubscription,
  type FinanceDisplayMode,
  type FinanceExpense,
  type FinanceIncome,
  type FinancePipelineRecord,
  type FinanceSnapshot,
  type FinanceUpcomingRevenue,
} from "@/lib/finance-costs";

type Section =
  | "overview"
  | "income"
  | "banking"
  | "invoices"
  | "forecast"
  | "expenses"
  | "subscriptions"
  | "investments"
  | "usage"
  | "personal"
  | "vat";
type Editor =
  | { kind: "income"; record: FinanceIncome | null }
  | { kind: "upcoming"; record: FinanceUpcomingRevenue | null }
  | { kind: "pipeline"; record: FinancePipelineRecord | null }
  | { kind: "expense"; record: FinanceExpense | null }
  | { kind: "subscription"; record: CostSubscription | null }
  | { kind: "owner_draw"; record: null }
  | { kind: "personal_expense"; record: null }
  | { kind: "settings" }
  | null;
const sections: Array<{ id: Section; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "income", label: "Revenue" },
  { id: "banking", label: "Banking" },
  { id: "expenses", label: "Costs" },
  { id: "investments", label: "Investments" },
  { id: "personal", label: "Personal" },
];
const inputClass =
  "mt-1 w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-300/45";

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Finance request failed.");
  return data as FinanceSnapshot;
}
function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value}T00:00:00Z`))
    : "Not set";
}
function sourceMoney(amount: number, currency = "AED") {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
function eur(amount: number) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
const CurrencyContext = createContext<{
  mode: FinanceDisplayMode;
  usdAed: number | null;
  usdEur: number | null;
}>({ mode: "aed", usdAed: null, usdEur: null });
function CurrencyAed({ amount }: { amount: number }) {
  return (
    <Money amount={amount} currency="AED" {...useContext(CurrencyContext)} />
  );
}
function aed(amount: number) {
  return <CurrencyAed amount={amount} />;
}

function OperatingMonthView({
  snapshot,
  monthLoading,
  onMonthChange,
}: {
  snapshot: FinanceSnapshot;
  monthLoading: boolean;
  onMonthChange: (offset: number) => void;
}) {
  const s = snapshot.summary;
  const title = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${s.selectedMonth}-01T00:00:00Z`));
  return (
    <section className="mt-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-emerald-200/70">Monthly money management</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="flex items-center gap-2">
        <button disabled={monthLoading} onClick={() => onMonthChange(-1)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 disabled:opacity-40">Previous</button>
        <button disabled={monthLoading} onClick={() => onMonthChange(1)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 disabled:opacity-40">Next</button>
      </div>
    </section>
  );
}

export function FinanceWorkspace({
  initialSnapshot,
}: {
  initialSnapshot: FinanceSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [section, setSection] = useState<Section>("overview");
  const [editor, setEditor] = useState<Editor>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [monthLoading, setMonthLoading] = useState(false);
  const display = snapshot.settings.display_currency;
  const usdAed =
    snapshot.fxRates.find(
      (row) => row.base_currency === "USD" && row.quote_currency === "AED",
    )?.rate ?? null;
  const usdEur =
    snapshot.fxRates.find(
      (row) => row.base_currency === "USD" && row.quote_currency === "EUR",
    )?.rate ?? null;
  const money = (amount: number, currency = "AED") => (
    <Money
      amount={amount}
      currency={currency}
      mode={display}
      usdAed={usdAed}
      usdEur={usdEur}
    />
  );
  async function setDisplay(next: FinanceDisplayMode) {
    try {
      setError(null);
      setSnapshot(
        await requestJson("/api/finance", {
          method: "PUT",
          body: JSON.stringify({
            expectedUpdatedAt: snapshot.settings.updated_at || undefined,
            settings: {
              display_currency: next,
              aed_eur_rate: snapshot.settings.aed_eur_rate,
            },
          }),
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Display preference could not be saved.",
      );
    }
  }
  return (
    <CurrencyContext.Provider value={{ mode: display, usdAed, usdEur }}>
      <main className="min-h-screen overflow-x-hidden bg-[#050806] text-white md:pl-[72px]">
        <div className="mx-auto max-w-[1580px] px-4 py-7 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-emerald-200/70">
                MC Studios operating workspace
              </p>
              <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
                Finance
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/50">
                AED canonical ledger · native currency preserved · collected
                cash remains separate from expected revenue.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-md border border-white/10 bg-black/20 p-1">
                {FINANCE_DISPLAY_MODES.map((mode) => (
                  <button
                    key={mode}
                    onClick={() => void setDisplay(mode)}
                    className={`rounded px-3 py-1.5 text-xs font-semibold uppercase ${display === mode ? "bg-emerald-300 text-[#062016]" : "text-white/48 hover:text-white"}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setEditor({ kind: "settings" })}
                className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.05]"
              >
                FX settings
              </button>
            </div>
          </header>
          <nav
            aria-label="Finance sections"
            className="mt-5 flex gap-1 overflow-x-auto border-b border-white/10 pb-3"
          >
            {sections.map((item) => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`shrink-0 rounded-md px-3 py-2 text-xs font-semibold transition ${section === item.id ? "bg-emerald-300 text-[#062016]" : "text-white/48 hover:bg-white/[0.05] hover:text-white"}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-md border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"
            >
              {error}
            </p>
          )}
          {section === "overview" && (
            <Overview
              snapshot={snapshot}
              onSelect={setSection}
              monthLoading={monthLoading}
              onMonthChange={(offset) => {
                const [year, month] = snapshot.summary.selectedMonth
                  .split("-")
                  .map(Number);
                const next = new Date(Date.UTC(year, month - 1 + offset, 1))
                  .toISOString()
                  .slice(0, 7);
                setMonthLoading(true);
                window.location.assign(`/finance?month=${next}`);
              }}
            />
          )}
          {section === "income" && (
            <RevenueWorkspace
              snapshot={snapshot}
              money={money}
              onEditIncome={(record) => setEditor({ kind: "income", record })}
              onEditUpcoming={(record) => setEditor({ kind: "upcoming", record })}
              onEditPipeline={(record) => setEditor({ kind: "pipeline", record })}
              onActivated={setSnapshot}
              onError={setError}
            />
          )}
          {section === "banking" && (
            <BankingSection
              snapshot={snapshot}
              onSaved={setSnapshot}
              onError={setError}
            />
          )}
          {section === "expenses" && (
            <CostsWorkspace
              snapshot={snapshot}
              money={money}
              onEditExpense={(record) => setEditor({ kind: "expense", record })}
              onEditSubscription={(record) => setEditor({ kind: "subscription", record })}
            />
          )}
          {section === "investments" && (
            <InvestmentsSection snapshot={snapshot} money={money} />
          )}
          {section === "personal" && (
            <PersonalWorkspace
              snapshot={snapshot}
              onRecordDraw={() =>
                setEditor({ kind: "owner_draw", record: null })
              }
              onRecordExpense={() =>
                setEditor({ kind: "personal_expense", record: null })
              }
            />
          )}
          {editor && (
            <EditorDialog
              editor={editor}
              snapshot={snapshot}
              saving={saving}
              onClose={() => setEditor(null)}
              onSaved={(next) => {
                setSnapshot(next);
                setEditor(null);
              }}
              onError={setError}
              setSaving={setSaving}
            />
          )}
        </div>
      </main>
    </CurrencyContext.Provider>
  );
}

function Money({
  amount,
  currency,
  mode,
  usdAed,
  usdEur,
}: {
  amount: number;
  currency: string;
  mode: FinanceDisplayMode;
  usdAed: number | null;
  usdEur: number | null;
}) {
  const native = sourceMoney(amount, currency);
  const aedAmount =
    currency === "AED"
      ? amount
      : currency === "USD" && usdAed !== null
        ? amount * usdAed
        : currency === "EUR" && usdAed !== null && usdEur !== null
          ? (amount * usdAed) / usdEur
          : null;
  const usdAmount =
    currency === "USD"
      ? amount
      : currency === "AED" && usdAed !== null
        ? amount / usdAed
        : currency === "EUR" && usdEur !== null
          ? amount / usdEur
          : null;
  const eurAmount =
    currency === "EUR"
      ? amount
      : currency === "USD" && usdEur !== null
        ? amount * usdEur
        : currency === "AED" && usdAed !== null && usdEur !== null
          ? (amount * usdEur) / usdAed
          : null;
  const selected =
    mode === "aed"
      ? aedAmount === null
        ? null
        : sourceMoney(aedAmount, "AED")
      : mode === "eur"
        ? eurAmount === null
          ? null
          : eur(eurAmount)
        : mode === "usd"
          ? usdAmount === null
            ? null
            : sourceMoney(usdAmount, "USD")
          : native;
  if (selected === null)
    return (
      <span className="inline-flex flex-col">
        <strong className="font-semibold text-inherit">{native}</strong>
        <span className="mt-0.5 text-xs font-medium text-white/48">
          FX rate required
        </span>
      </span>
    );
  return (
    <span className="inline-flex flex-col">
      <strong className="font-semibold text-inherit">{selected}</strong>
      {mode !== "both" && selected !== native && (
        <span className="mt-0.5 text-xs font-medium text-white/48">
          {native}
        </span>
      )}
    </span>
  );
}
function ReportMoney({ amount }: { amount: number | null }) {
  const displayCurrency = useContext(CurrencyContext);
  return (
    <span>
      {amount === null ? (
        "Conversion required"
      ) : (
        <Money amount={amount} currency="EUR" {...displayCurrency} />
      )}
    </span>
  );
}
function Overview({
  snapshot,
  onSelect,
  monthLoading,
  onMonthChange,
}: {
  snapshot: FinanceSnapshot;
  onSelect: (section: Section) => void;
  monthLoading: boolean;
  onMonthChange: (offset: number) => void;
}) {
  const s = snapshot.summary;
  const aedPerEur =
    snapshot.settings.aed_eur_rate === null
      ? null
      : 1 / snapshot.settings.aed_eur_rate;
  const unresolved = s.unresolvedOperatingCosts
    .map((row) => `${sourceMoney(row.amount, row.currency)} ${row.kind}`)
    .join(" · ");
  const incomeSource = `AED source ${sourceMoney(s.sourceTotals.incomeAed)}${s.sourceTotals.incomeEur ? ` · EUR source ${sourceMoney(s.sourceTotals.incomeEur, "EUR")}` : ""}`;
  const clientRowsWithDirectCosts = s.incomeByClient.filter(
    (row) => (row.knownDirectCostEur ?? 0) > 0,
  );
  const needsInput = [
    s.unresolvedRevenueCount > 0
      ? { label: `${s.unresolvedRevenueCount} client payment ${s.unresolvedRevenueCount === 1 ? "status needs" : "statuses need"} confirmation`, section: "income" as Section }
      : null,
    s.bankReviewCount > 0
      ? { label: `${s.bankReviewCount} bank ${s.bankReviewCount === 1 ? "record needs" : "records need"} review`, section: "banking" as Section }
      : null,
    s.upcomingExpenses.filter((row) => row.status === "needs_confirmation").length > 0
      ? { label: `${s.upcomingExpenses.filter((row) => row.status === "needs_confirmation").length} recurring cost ${s.upcomingExpenses.filter((row) => row.status === "needs_confirmation").length === 1 ? "needs" : "need"} confirmation`, section: "expenses" as Section }
      : null,
  ].filter((item): item is { label: string; section: Section } => item !== null);
  return (
    <>
      <OperatingMonthView
        snapshot={snapshot}
        monthLoading={monthLoading}
        onMonthChange={onMonthChange}
      />
      {needsInput.length > 0 && (
        <section className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[0.055] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-amber-100/75">Needs your input</p><p className="mt-1 text-sm text-white/62">Only recorded reconciliation, bank, and recurring-cost states are shown.</p></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">{needsInput.map((item) => <button key={item.label} onClick={() => onSelect(item.section)} className="rounded-full border border-amber-200/18 bg-black/20 px-3 py-2 text-xs font-semibold text-amber-50/90 hover:bg-amber-200/[.08]">{item.label} →</button>)}</div>
        </section>
      )}
      <section className="mt-6 overflow-hidden rounded-3xl border border-emerald-300/18 bg-[radial-gradient(circle_at_80%_0%,rgba(110,231,183,.12),transparent_38%),linear-gradient(135deg,rgba(22,48,31,.92),rgba(6,11,8,.96)_58%)] p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-emerald-100/70">
              Business cash position
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Cash position</h2>
          </div>
          <p className="text-xs text-white/45">
            Collected revenue − paid / committed business costs
          </p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Collected revenue"
            value={aed(s.collectedRevenueAed)}
            note="Cash actually marked paid this month"
          />
          <Metric
            label="Committed business costs"
            value={aed(s.committedBusinessExpensesAed)}
            note="Recurring costs, committed expenses and actual AI/API usage"
          />
          <Metric
            label="Available owner draw"
            value={aed(s.availableOwnerDrawAed)}
            note="Capacity only; not a personal transfer until paid"
          />
          <Metric
            label="Accounts receivable"
            value={aed(s.accountsReceivableAed)}
            note="Expected, invoiced or overdue client revenue"
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/[0.09] bg-black/20 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-white/42">
              Projected owner draw
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {aed(s.projectedOwnerDrawAed)}
            </p>
            <p className="mt-2 text-xs leading-5 text-white/45">
              Expected revenue {aed(s.expectedRevenueAed)} less projected
              business expenses {aed(s.projectedBusinessExpensesAed)}. This is
              not cash available.
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.09] bg-black/20 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-white/42">
              Personal finance link
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {aed(s.paidOwnerDrawAed)}
            </p>
            <p className="mt-2 text-xs leading-5 text-white/45">
              Actual owner draws paid this month. Owner draws are excluded from
              business expenses to prevent double counting.
            </p>
          </div>
        </div>
      </section>
      <section className="mt-6 rounded-2xl border border-white/[0.09] bg-white/[0.025] p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-emerald-100/70">Collection</p><h2 className="mt-1 text-xl font-semibold">Revenue reconciliation</h2></div><button onClick={() => onSelect("income")} className="text-xs font-semibold text-emerald-100 hover:text-emerald-50">Open Revenue →</button></div>
        <RecordTable headers={["Client", "Expected", "Invoiced", "Collected", "Outstanding", "Status"]} empty="No revenue records for this month.">
          {s.revenueReconciliation.map((row) => <div key={row.id} className="contents"><span className="font-semibold">{row.client}</span><span>{row.expectedAed === null ? "FX required" : aed(row.expectedAed)}</span><span>{aed(row.invoicedAed)}</span><span>{aed(row.collectedAed)}</span><span>{aed(row.outstandingAed)}</span><Status label={row.status} tone={row.unresolved ? "paused" : row.status} /></div>)}
        </RecordTable>
      </section>
      <section className="mt-6 rounded-2xl border border-white/[0.09] bg-white/[0.025] p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-amber-100/70">Balance-sheet awareness</p>
            <h2 className="mt-1 text-xl font-semibold">Outstanding receivables</h2>
            <p className="mt-1 text-sm text-white/50">Amounts owed to MC Studios. They are not added to monthly revenue or cash.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.outstandingReceivableTotals.map((total) => (
              <span key={total.currency} className="rounded-full border border-amber-200/15 bg-amber-200/[.06] px-3 py-1.5 text-xs font-semibold text-amber-50">
                {sourceMoney(total.amount, total.currency)} outstanding
              </span>
            ))}
          </div>
        </div>
        <RecordTable headers={["Debtor", "Reason", "Amount", "Status"]} empty="No standalone receivables are recorded.">
          {snapshot.receivables.filter((row) => row.status === "outstanding").map((row) => {
            const client = row.client_id ? snapshot.clients.find((item) => item.id === row.client_id)?.name : null;
            return <div key={row.id} className="contents"><span className="font-semibold">{row.debtor_name}{client ? <small className="ml-2 text-xs font-normal text-white/45">{client}</small> : null}</span><span>{row.description}</span><span>{sourceMoney(row.amount, row.currency)}</span><Status label="Outstanding" tone="paused" /></div>;
          })}
        </RecordTable>
      </section>
      <section className="mt-6 grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
        <div className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-emerald-100/70">
                Upcoming expenses
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Scheduled deductions
              </h2>
            </div>
            <button
              onClick={() => onSelect("expenses")}
              className="text-xs font-semibold text-emerald-100"
            >
              Manage subscriptions
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {s.upcomingExpenses.map((row) => (
              <div
                key={row.id}
                className="grid gap-2 rounded-xl border border-white/[0.08] bg-black/20 p-3 sm:grid-cols-[1fr_auto_auto]"
              >
                <div>
                  <p className="font-semibold">{row.vendor}</p>
                  <p className="mt-1 text-xs text-white/42">
                    {row.deductionDate
                      ? `${date(row.deductionDate)}${row.daysUntil === null ? "" : ` · ${row.daysUntil < 0 ? "overdue" : `${row.daysUntil} days`}`}`
                      : "Billing date needs confirmation"}
                  </p>
                </div>
                <p className="text-sm text-white/72">
                  {sourceMoney(row.amount, row.currency)}
                  {row.amountAed === null ? (
                    ""
                  ) : (
                    <span className="block text-xs text-white/42">
                      {aed(row.amountAed)}
                    </span>
                  )}
                </p>
                <Status
                  label={
                    row.status === "needs_confirmation"
                      ? "Needs confirmation"
                      : row.status === "due_soon"
                        ? "Due soon"
                        : "Scheduled"
                  }
                  tone={
                    row.status === "due_soon"
                      ? "overdue"
                      : row.status === "needs_confirmation"
                        ? "paused"
                        : "active"
                  }
                />
              </div>
            ))}
            {s.upcomingExpenses.length === 0 && (
              <p className="text-sm text-white/42">
                No active recurring expenses are recorded.
              </p>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-emerald-100/70">
            FX basis
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            Indicative reporting rates
          </h2>
          <div className="mt-4 space-y-3">
            {snapshot.fxRates.map((rate) => (
              <div
                key={rate.id}
                className="rounded-xl border border-white/[0.08] bg-black/20 p-3"
              >
                <p className="font-semibold">
                  1 {rate.base_currency} ={" "}
                  {rate.rate.toFixed(rate.quote_currency === "AED" ? 4 : 6)}{" "}
                  {rate.quote_currency}
                </p>
                <p className="mt-1 text-xs leading-5 text-white/42">
                  {rate.source} · {date(rate.rate_date)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-white/42">
            Current reporting uses the latest rate. Booked transactions retain
            their native amount and can carry a dated FX snapshot.
          </p>
        </div>
      </section>
      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Revenue"
          value={<ReportMoney amount={s.revenueEur} />}
          note={`This month, excluding VAT. ${incomeSource}`}
        />
        <Metric
          label="Expenses"
          value={<ReportMoney amount={s.knownOperatingCostsEur} />}
          note={
            unresolved
              ? `Known costs only. Unresolved: ${unresolved}`
              : "Recorded operating costs, excluding VAT"
          }
        />
        <Metric
          label="Recorded operating profit"
          value={<ReportMoney amount={s.profitEur} />}
          note={
            unresolved
              ? `Before unresolved USD operating costs: ${unresolved}`
              : "Revenue less recorded operating costs, excluding VAT"
          }
        />
        <Metric
          label="VAT collected"
          value={<ReportMoney amount={s.vatCollectedEur} />}
          note={`Output VAT, not revenue. AED source: ${sourceMoney(s.sourceTotals.vatAed)}`}
        />
      </section>
      <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Monthly recurring revenue"
          value={<ReportMoney amount={s.mrrEur} />}
          note="Active recurring revenue, excluding VAT"
        />
        <Metric
          label="Upcoming / future MRR"
          value={<ReportMoney amount={s.upcomingMrrEur} />}
          note="Confirmed future revenue. Not current revenue or VAT."
        />
        <Metric
          label="Potential monthly pipeline"
          value={<ReportMoney amount={s.potentialPipelineEur} />}
          note="Unweighted prospects. Not actual revenue or profit."
        />
        <Metric
          label="Gross invoiced"
          value={<ReportMoney amount={s.grossInvoicedEur} />}
          note="Revenue plus VAT"
        />
        <Metric
          label="Subscription costs"
          value={<ReportMoney amount={s.knownSubscriptionExpensesEur} />}
          note={
            unresolved
              ? `AED subscriptions converted; ${unresolved} remains unconverted`
              : "Monthly normalised subscriptions"
          }
        />
        <Metric
          label="AI / API spend"
          value={sourceMoney(s.aiApiSpendUsd, "USD")}
          note={
            s.usageDuplicatesSkipped
              ? `${s.usageDuplicatesSkipped} duplicated ledger rows excluded`
              : "Recorded variable usage"
          }
        />
      </section>
      <section className="mt-8 grid gap-4 xl:grid-cols-2">
        <div className="border-t border-white/10 pt-4">
          <SectionHeading
            eyebrow="Confirmed future revenue"
            title="Upcoming"
            action="Forecast"
            onAction={() => onSelect("income")}
          />
          <div className="mt-4 space-y-3">
            {snapshot.upcomingRevenue
              .filter((row) => row.status === "upcoming")
              .map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-sky-300/15 bg-sky-300/[0.035] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{row.counterparty_name}</p>
                      <p className="mt-1 text-sm text-white/50">
                        {row.description}
                      </p>
                    </div>
                    <Status
                      label={upcomingRevenueStatusLabel(row.status)}
                      tone={row.status}
                    />
                  </div>
                  <p className="mt-3 text-sm text-white/72">
                    {sourceMoney(row.net_amount, row.currency)} net monthly ·
                    starts {date(row.expected_start_date)}
                  </p>
                  <p className="mt-1 text-xs text-white/42">
                    Excluded from current revenue, profit and VAT until
                    explicitly activated.
                  </p>
                </div>
              ))}
            {snapshot.upcomingRevenue.filter((row) => row.status === "upcoming")
              .length === 0 && (
              <p className="text-sm text-white/42">
                No confirmed future revenue is recorded.
              </p>
            )}
          </div>
        </div>
        <div className="border-t border-white/10 pt-4">
          <SectionHeading
            eyebrow="Unweighted prospect view"
            title="Potential pipeline"
            action="Forecast"
            onAction={() => onSelect("income")}
          />
          <div className="mt-4 space-y-3">
            {snapshot.pipeline
              .filter((row) => row.stage !== "won" && row.stage !== "lost")
              .map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-amber-300/15 bg-amber-300/[0.035] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{row.name}</p>
                      <p className="mt-1 text-sm text-white/50">
                        {pipelineStageLabel(row.stage)}
                        {row.stage_detail ? ` · ${row.stage_detail}` : ""}
                      </p>
                    </div>
                    <Status label="Potential" tone="potential" />
                  </div>
                  <p className="mt-3 text-sm text-white/72">
                    {sourceMoney(row.net_amount, row.currency)} net monthly
                    {row.expected_start_date
                      ? ` · estimated ${date(row.expected_start_date)}`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs text-white/42">
                    No probability or weighted forecast has been assigned.
                  </p>
                </div>
              ))}
            {snapshot.pipeline.filter(
              (row) => row.stage !== "won" && row.stage !== "lost",
            ).length === 0 && (
              <p className="text-sm text-white/42">
                No potential clients are recorded.
              </p>
            )}
          </div>
        </div>
      </section>
      <section className="mt-8 grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
        <div className="border-t border-white/10 pt-4">
          <SectionHeading
            eyebrow="Revenue by client"
            title="Current recurring income"
            action="Income"
            onAction={() => onSelect("income")}
          />
          <div className="mt-4 grid gap-3">
            {s.incomeByClient.map((row) => (
              <div
                key={row.name}
                className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-[1fr_auto_auto]"
              >
                <div>
                  <p className="font-semibold">{row.name}</p>
                  <p className="mt-1 text-xs text-white/42">
                    {row.sourceAmounts
                      .map((source) =>
                        sourceMoney(source.netAmount, source.currency),
                      )
                      .join(" · ")}{" "}
                    source revenue
                  </p>
                  {(row.knownDirectCostEur ?? 0) > 0 && (
                    <p className="mt-2 text-xs text-white/56">
                      Known direct cost: {eur(row.knownDirectCostEur ?? 0)} ·
                      Contribution before shared costs:{" "}
                      {row.contributionBeforeSharedCostsEur === null
                        ? "Conversion required"
                        : eur(row.contributionBeforeSharedCostsEur)}
                    </p>
                  )}
                </div>
                <div className="text-sm text-white/62">
                  VAT
                  <br />
                  <span className="text-white">
                    {row.vatApplicable ? (
                      <ReportMoney amount={row.vatEur} />
                    ) : (
                      "Not applicable"
                    )}
                  </span>
                </div>
                <div className="text-sm text-white/62">
                  Net revenue
                  <br />
                  <span className="text-white">
                    <ReportMoney amount={row.netEur} />
                  </span>
                </div>
              </div>
            ))}
          </div>
          {clientRowsWithDirectCosts.length > 0 && (
            <div className="mt-6 border-t border-white/10 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-emerald-200/65">
                Client profitability foundation
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {clientRowsWithDirectCosts.map((row) => (
                  <div
                    key={`contribution-${row.name}`}
                    className="rounded-lg border border-white/10 bg-black/20 p-4"
                  >
                    <p className="font-semibold">{row.name}</p>
                    <p className="mt-2 text-sm text-white/56">
                      Revenue{" "}
                      {row.netEur === null
                        ? "Conversion required"
                        : eur(row.netEur)}{" "}
                      · Known direct cost {eur(row.knownDirectCostEur ?? 0)}
                    </p>
                    <p className="mt-1 text-sm text-emerald-100">
                      Contribution before shared costs:{" "}
                      {row.contributionBeforeSharedCostsEur === null
                        ? "Conversion required"
                        : eur(row.contributionBeforeSharedCostsEur)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <aside className="rounded-lg border border-white/10 bg-black/20 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-emerald-200/70">
            EUR analytical comparison
          </p>
          <p className="mt-2 font-semibold">
            AED remains the canonical reporting currency
          </p>
          {aedPerEur === null ? (
            <p className="mt-2 text-sm leading-relaxed text-white/48">
              No EUR comparison rate is configured. Native source figures remain
              correct.
            </p>
          ) : (
            <div className="mt-2 text-sm text-white/52">
              <p>
                Finance display selector supports AED, EUR, USD and
                native-source comparison.
              </p>
              <p>EUR comparison: €1 = AED {aedPerEur.toFixed(2)}</p>
              <p>Source currency is never overwritten.</p>
            </div>
          )}
          <p className="mt-5 text-xs leading-relaxed text-white/40">
            VAT is separate from revenue and recorded operating profit. The
            cards above are a secondary EUR analytical view; current business
            cash capacity remains AED-first.{" "}
            {unresolved
              ? `USD legacy metrics remain excluded where no historical conversion was recorded: ${unresolved}.`
              : "No unresolved operating currency is currently recorded."}
          </p>
        </aside>
      </section>
    </>
  );
}

function WorkspacePanel({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-white/[0.09] bg-white/[0.025] p-5 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-emerald-100/70">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function RevenueWorkspace({
  snapshot,
  money,
  onEditIncome,
  onEditUpcoming,
  onEditPipeline,
  onActivated,
  onError,
}: {
  snapshot: FinanceSnapshot;
  money: (amount: number, currency?: string) => React.ReactNode;
  onEditIncome: (record: FinanceIncome | null) => void;
  onEditUpcoming: (record: FinanceUpcomingRevenue | null) => void;
  onEditPipeline: (record: FinancePipelineRecord | null) => void;
  onActivated: (snapshot: FinanceSnapshot) => void;
  onError: (value: string | null) => void;
}) {
  return (
    <>
      <WorkspacePanel eyebrow="Revenue management" title="Revenue">
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">Active income, invoice collection, confirmed future revenue, and unweighted pipeline remain distinct.</p>
        <IncomeSection snapshot={snapshot} money={money} onEdit={onEditIncome} />
      </WorkspacePanel>
      <WorkspacePanel eyebrow="Collection" title="Invoices">
        <InvoicesSection snapshot={snapshot} money={money} onSaved={onActivated} onError={onError} />
      </WorkspacePanel>
      <WorkspacePanel eyebrow="Forward view" title="Upcoming and pipeline">
        <ForecastSection snapshot={snapshot} money={money} onEditUpcoming={onEditUpcoming} onEditPipeline={onEditPipeline} onActivated={onActivated} onError={onError} />
      </WorkspacePanel>
    </>
  );
}

function CostsWorkspace({
  snapshot,
  money,
  onEditExpense,
  onEditSubscription,
}: {
  snapshot: FinanceSnapshot;
  money: (amount: number, currency?: string) => React.ReactNode;
  onEditExpense: (record: FinanceExpense | null) => void;
  onEditSubscription: (record: CostSubscription | null) => void;
}) {
  return (
    <>
      <WorkspacePanel eyebrow="Operating costs" title="Costs">
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">Recorded expenses and client allocations only. No generic receipt-upload workflow is introduced here.</p>
        <ExpensesSection snapshot={snapshot} money={money} onEdit={onEditExpense} />
      </WorkspacePanel>
      <WorkspacePanel eyebrow="Committed costs" title="Subscriptions">
        <SubscriptionsSection snapshot={snapshot} money={money} onEdit={onEditSubscription} />
      </WorkspacePanel>
      <WorkspacePanel eyebrow="Variable usage" title="AI and API costs">
        <UsageSection snapshot={snapshot} />
      </WorkspacePanel>
    </>
  );
}

function PersonalWorkspace({
  snapshot,
  onRecordDraw,
  onRecordExpense,
}: {
  snapshot: FinanceSnapshot;
  onRecordDraw: () => void;
  onRecordExpense: () => void;
}) {
  return (
    <>
      <WorkspacePanel eyebrow="Personal cash flow" title="Personal">
        <PersonalSection snapshot={snapshot} onRecordDraw={onRecordDraw} onRecordExpense={onRecordExpense} />
      </WorkspacePanel>
      <WorkspacePanel eyebrow="Tax boundary" title="VAT">
        <VatSection snapshot={snapshot} />
      </WorkspacePanel>
    </>
  );
}

function IncomeSection({
  snapshot,
  money,
  onEdit,
}: {
  snapshot: FinanceSnapshot;
  money: (amount: number, currency?: string) => React.ReactNode;
  onEdit: (record: FinanceIncome | null) => void;
}) {
  return (
    <section className="mt-6">
      <SectionHeading
        eyebrow="Revenue ledger"
        title="Income"
        action="Add income"
        onAction={() => onEdit(null)}
      />
      <RecordTable
        headers={[
          "Client",
          "Description",
          "Net revenue",
          "VAT",
          "Gross",
          "Frequency",
          "Status",
        ]}
        empty="No income records are tracked yet."
      >
        {snapshot.income.map((row) => (
          <button
            key={row.id}
            onClick={() => onEdit(row)}
            className="contents text-left"
          >
            <span className="font-semibold">{row.counterparty_name}</span>
            <span className="text-white/56">{row.description}</span>
            <span>{money(row.net_amount, row.currency)}</span>
            <span>
              {row.vat_applicable ? (
                money(row.vat_amount, row.currency)
              ) : (
                <span className="text-white/56">Not applicable</span>
              )}
            </span>
            <span>{money(row.gross_amount, row.currency)}</span>
            <span>{billingCycleLabel(row.billing_cycle)}</span>
            <Status
              label={paymentStatusLabel(row.payment_status)}
              tone={row.payment_status}
            />
          </button>
        ))}
      </RecordTable>
    </section>
  );
}
function ForecastSection({
  snapshot,
  money,
  onEditUpcoming,
  onEditPipeline,
  onActivated,
  onError,
}: {
  snapshot: FinanceSnapshot;
  money: (amount: number, currency?: string) => React.ReactNode;
  onEditUpcoming: (record: FinanceUpcomingRevenue | null) => void;
  onEditPipeline: (record: FinancePipelineRecord | null) => void;
  onActivated: (snapshot: FinanceSnapshot) => void;
  onError: (value: string | null) => void;
}) {
  async function activate(record: FinanceUpcomingRevenue) {
    if (
      !window.confirm(
        `Activate ${record.counterparty_name} as current revenue? This creates an active income record dated today.`,
      )
    )
      return;
    try {
      onError(null);
      onActivated(
        await requestJson(`/api/finance/upcoming/${record.id}/activate`, {
          method: "POST",
          body: JSON.stringify({ expectedUpdatedAt: record.updated_at }),
        }),
      );
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "Upcoming revenue could not be activated.",
      );
    }
  }
  async function updatePipelineStatus(
    record: FinancePipelineRecord,
    stage: "won" | "lost",
  ) {
    try {
      onError(null);
      onActivated(
        await requestJson(`/api/finance/pipeline/${record.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            expectedUpdatedAt: record.updated_at,
            patch: { stage },
          }),
        }),
      );
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "Pipeline status could not be updated.",
      );
    }
  }
  return (
    <section className="mt-6 space-y-10">
      <div>
        <SectionHeading
          eyebrow="Separate from current revenue"
          title="Upcoming revenue"
          action="Add upcoming"
          onAction={() => onEditUpcoming(null)}
        />
        <RecordTable
          headers={[
            "Client",
            "Monthly net",
            "VAT",
            "Gross",
            "Expected start",
            "Status",
            "Actions",
          ]}
          empty="No upcoming revenue is recorded yet."
        >
          {snapshot.upcomingRevenue.map((row) => (
            <div key={row.id} className="contents">
              <button
                onClick={() => onEditUpcoming(row)}
                className="text-left font-semibold"
              >
                {row.counterparty_name}
              </button>
              <span>{money(row.net_amount, row.currency)}</span>
              <span>
                {row.vat_applicable
                  ? money(row.vat_amount, row.currency)
                  : "Not applicable"}
              </span>
              <span>{money(row.gross_amount, row.currency)}</span>
              <span className="text-white/56">
                {date(row.expected_start_date)}
              </span>
              <Status
                label={upcomingRevenueStatusLabel(row.status)}
                tone={row.status}
              />
              <div className="flex gap-2">
                {row.status === "upcoming" && (
                  <button
                    onClick={() => void activate(row)}
                    className="rounded border border-emerald-300/30 px-2 py-1 text-xs font-semibold text-emerald-100"
                  >
                    Activate
                  </button>
                )}
                <button
                  onClick={() => onEditUpcoming(row)}
                  className="rounded border border-white/10 px-2 py-1 text-xs font-semibold text-white/65"
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </RecordTable>
        <p className="mt-3 text-xs text-white/42">
          Upcoming records do not affect actual revenue, profit or VAT. Activate
          only when the client is genuinely current and paying.
        </p>
      </div>
      <div>
        <SectionHeading
          eyebrow="Prospects only · never actuals"
          title="Potential client pipeline"
          action="Add prospect"
          onAction={() => onEditPipeline(null)}
        />
        <RecordTable
          headers={[
            "Prospect",
            "Stage",
            "Monthly net",
            "Expected start",
            "Probability",
            "Status",
            "Actions",
          ]}
          empty="No potential clients are recorded yet."
        >
          {snapshot.pipeline.map((row) => (
            <div key={row.id} className="contents">
              <button
                onClick={() => onEditPipeline(row)}
                className="text-left font-semibold"
              >
                {row.name}
              </button>
              <span className="text-white/56">
                {pipelineStageLabel(row.stage)}
                {row.stage_detail ? ` · ${row.stage_detail}` : ""}
              </span>
              <span>{money(row.net_amount, row.currency)}</span>
              <span className="text-white/56">
                {date(row.expected_start_date)}
              </span>
              <span>
                {row.probability === null ? (
                  <span className="text-white/42">Not assigned</span>
                ) : (
                  `${row.probability}%`
                )}
              </span>
              <Status
                label={
                  row.stage === "won"
                    ? "Won"
                    : row.stage === "lost"
                      ? "Lost"
                      : "Potential"
                }
                tone={
                  row.stage === "won"
                    ? "won"
                    : row.stage === "lost"
                      ? "lost"
                      : "potential"
                }
              />
              <div className="flex gap-2">
                <button
                  onClick={() => onEditPipeline(row)}
                  className="rounded border border-white/10 px-2 py-1 text-xs font-semibold text-white/65"
                >
                  Edit
                </button>
                {row.stage !== "won" && row.stage !== "lost" && (
                  <>
                    <button
                      onClick={() => void updatePipelineStatus(row, "won")}
                      className="rounded border border-emerald-300/30 px-2 py-1 text-xs font-semibold text-emerald-100"
                    >
                      Mark won
                    </button>
                    <button
                      onClick={() => void updatePipelineStatus(row, "lost")}
                      className="rounded border border-rose-300/25 px-2 py-1 text-xs font-semibold text-rose-100"
                    >
                      Lost
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </RecordTable>
        <p className="mt-3 text-xs text-white/42">
          Pipeline is unweighted and excluded from actual revenue, active MRR,
          profit and VAT. Marking a prospect won never creates active income
          automatically.
        </p>
      </div>
    </section>
  );
}
function ExpensesSection({
  snapshot,
  money,
  onEdit,
}: {
  snapshot: FinanceSnapshot;
  money: (amount: number, currency?: string) => React.ReactNode;
  onEdit: (record: FinanceExpense | null) => void;
}) {
  return (
    <section className="mt-6">
      <SectionHeading
        eyebrow="Operating costs"
        title="Expenses"
        action="Add expense"
        onAction={() => onEdit(null)}
      />
      <RecordTable
        headers={[
          "Vendor",
          "Description",
          "Allocation",
          "Category",
          "Net",
          "VAT",
          "Gross",
          "Date",
        ]}
        empty="No expenses are recorded yet."
      >
        {snapshot.expenses.map((row) => (
          <button
            key={row.id}
            onClick={() => onEdit(row)}
            className="contents text-left"
          >
            <span className="font-semibold">{row.vendor}</span>
            <span className="text-white/56">{row.description}</span>
            <span className="text-white/56">
              {row.client_allocation_name ??
                snapshot.clients.find((client) => client.id === row.client_id)
                  ?.name ??
                "Agency-wide"}
            </span>
            <span>{expenseCategoryLabel(row.category)}</span>
            <span>{money(row.net_amount, row.currency)}</span>
            <span>{money(row.vat_amount, row.currency)}</span>
            <span>{money(row.gross_amount, row.currency)}</span>
            <span className="text-white/56">
              {date(row.expense_date ?? row.start_date)}
            </span>
          </button>
        ))}
      </RecordTable>
    </section>
  );
}
function SubscriptionsSection({
  snapshot,
  money,
  onEdit,
}: {
  snapshot: FinanceSnapshot;
  money: (amount: number, currency?: string) => React.ReactNode;
  onEdit: (record: CostSubscription | null) => void;
}) {
  return (
    <section className="mt-6">
      <SectionHeading
        eyebrow="Recurring operating costs"
        title="Subscriptions"
        action="Add subscription"
        onAction={() => onEdit(null)}
      />
      <RecordTable
        headers={[
          "Vendor",
          "Plan",
          "Category",
          "Monthly normalised",
          "Cycle",
          "Renewal",
          "Status",
        ]}
        empty="No subscriptions are tracked yet."
      >
        {snapshot.subscriptions.map((row) => (
          <button
            key={row.id}
            onClick={() => onEdit(row)}
            className="contents text-left"
          >
            <span className="font-semibold">{row.vendor}</span>
            <span className="text-white/56">{row.plan_name ?? "—"}</span>
            <span>{subscriptionCategoryLabel(row.category)}</span>
            <span>{money(monthlyCost(row), row.currency)}</span>
            <span>{billingCycleLabel(row.billing_cycle)}</span>
            <span className="text-white/56">{date(row.next_renewal_date)}</span>
            <Status label={row.status} tone={row.status} />
          </button>
        ))}
      </RecordTable>
    </section>
  );
}
function BankingSection({
  snapshot,
  onSaved,
  onError,
}: {
  snapshot: FinanceSnapshot;
  onSaved: (snapshot: FinanceSnapshot) => void;
  onError: (message: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  async function upload(file: File | null) {
    if (!file) return;
    const account = window.prompt("Account label for this statement");
    if (!account) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("account_label", account);
      const response = await fetch("/api/finance/bank-statements", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Statement import failed.");
      onSaved(data);
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Statement import failed.",
      );
    } finally {
      setUploading(false);
    }
  }
  const transactions = selected
    ? snapshot.bankTransactions.filter((row) => row.statement_id === selected)
    : snapshot.bankTransactions;
  const totalCredits = transactions
    .filter((row) => row.signed_amount > 0)
    .reduce((sum, row) => sum + row.signed_amount, 0);
  const totalDebits = transactions
    .filter((row) => row.signed_amount < 0)
    .reduce((sum, row) => sum + Math.abs(row.signed_amount), 0);
  const matched = transactions.filter(
    (row) => row.classification_status === "reconciled",
  ).length;
  const excluded = transactions.filter(
    (row) => row.classification_status === "excluded",
  ).length;
  return (
    <section className="mt-6 space-y-5">
      <SectionHeading
        eyebrow="Actual bank evidence"
        title="Banking / Statements"
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Needs review"
          value={String(snapshot.summary.bankReviewCount)}
          note="No uncertain transaction enters Finance automatically"
        />
        <Metric
          label="Statements"
          value={String(snapshot.bankStatements.length)}
          note="Private source documents"
        />
        <Metric
          label="Transactions"
          value={String(snapshot.bankTransactions.length)}
          note="For the selected Finance month"
        />
        <Metric
          label="Reconciled"
          value={String(
            snapshot.bankStatements.filter((row) => row.status === "reconciled")
              .length,
          )}
          note="Only fully resolved statements"
        />
        <Metric label="Total credits" value={sourceMoney(totalCredits)} note="Evidence, not forecast" />
        <Metric label="Total debits" value={sourceMoney(totalDebits)} note="Evidence, not forecast" />
        <Metric label="Matched" value={String(matched)} note="Posted canonical links" />
        <Metric label="Excluded" value={String(excluded)} note="Kept outside Finance" />
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[.025] p-5">
        <p className="font-semibold">Import statement</p>
        <p className="mt-1 text-xs leading-5 text-white/45">
          CSV is the preferred reliable path. Text-based PDFs are parsed
          conservatively. Export XLSX statements as CSV until an approved
          spreadsheet parser is added. No OCR or AI call occurs.
        </p>
        <input
          disabled={uploading}
          className="mt-3 text-sm"
          type="file"
          accept="text/csv,application/pdf"
          onChange={(event) => void upload(event.target.files?.[0] ?? null)}
        />
        <span className="ml-3 text-xs text-white/50">
          {uploading ? "Importing…" : "Up to 20 MB"}
        </span>
      </div>
      <RecordTable
        headers={[
          "Statement",
          "Period",
          "Account",
          "Transactions",
          "Matched",
          "Needs review",
          "Excluded",
          "Status",
        ]}
        empty="No statements have been imported."
      >
        {snapshot.bankStatements.map((row) => (
          <button
            key={row.id}
            onClick={() => setSelected(row.id)}
            className="contents text-left"
          >
            <span className="font-semibold">{row.original_filename}</span>
            <span>
              {date(row.statement_start_date)} — {date(row.statement_end_date)}
            </span>
            <span>{row.account_label}</span>
            <span>{row.transaction_count}</span>
            <span>{row.matched_count}</span>
            <span>{row.unresolved_count}</span>
            <span>{row.excluded_count}</span>
            <Status
              label={row.status}
              tone={
                row.status === "reconciled"
                  ? "paid"
                  : row.status === "failed"
                    ? "overdue"
                    : "expected"
              }
            />
          </button>
        ))}
      </RecordTable>
      <RecordTable
        headers={[
          "Date",
          "Description",
          "Amount",
          "Scope",
          "Category",
          "Confidence",
          "Review",
        ]}
        empty="Choose a statement to inspect its normalized transactions."
      >
        {transactions.map((row) => (
          <BankTransactionRow
            key={row.id}
            row={row}
            snapshot={snapshot}
            onSaved={onSaved}
            onError={onError}
          />
        ))}
      </RecordTable>
    </section>
  );
}
function BankTransactionRow({
  row,
  snapshot,
  onSaved,
  onError,
}: {
  row: import("@/lib/finance-costs").FinanceBankTransaction;
  snapshot: FinanceSnapshot;
  onSaved: (snapshot: FinanceSnapshot) => void;
  onError: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [scope, setScope] = useState<string>(
    row.scope === "unresolved" ? "business" : row.scope,
  );
  const [category, setCategory] = useState(row.category ?? "");
  const [createRule, setCreateRule] = useState(false);
  const [target, setTarget] = useState("");
  const [targetType, setTargetType] = useState<
    "invoice" | "expense" | "owner_draw" | "personal_expense" | "transfer"
  >(row.signed_amount > 0 ? "invoice" : "expense");
  const [allocationAmount, setAllocationAmount] = useState(
    String(Math.abs(row.signed_amount)),
  );
  const [invoiceAllocations, setInvoiceAllocations] = useState([
    { target: "", amount: String(Math.abs(row.signed_amount)) },
  ]);
  const eligibleInvoices = snapshot.invoices.filter(
    (invoice) =>
      invoice.currency === row.currency && invoice.outstanding_amount > 0,
  );
  const eligibleExpenses = snapshot.expenses.filter(
    (expense) => expense.payment_status !== "paid",
  );
  const allocations = (() => {
    if (scope === "excluded") return [];
    if (scope === "transfer")
      return [{ target_type: "transfer", amount: Math.abs(row.signed_amount) }];
    if (scope === "personal" && row.signed_amount < 0)
      return [
        {
          target_type: "personal_expense",
          amount: Number(allocationAmount),
        },
      ];
    if (scope === "personal") return [];
    if (row.signed_amount > 0 && targetType === "invoice")
      return invoiceAllocations
        .filter((item) => item.target && Number(item.amount) > 0)
        .map((item) => ({
          target_type: "invoice",
          target_id: item.target,
          amount: Number(item.amount),
        }));
    if (targetType === "owner_draw")
      return [{ target_type: "owner_draw", amount: Number(allocationAmount) }];
    if (targetType === "transfer")
      return [{ target_type: "transfer", amount: Number(allocationAmount) }];
    return target
      ? [{ target_type: "expense", target_id: target, amount: Number(allocationAmount) }]
      : [{ target_type: "expense", create: true, amount: Number(allocationAmount) }];
  })();
  async function confirm() {
    try {
      const data = await requestJson(
        `/api/finance/bank-statements/${row.statement_id}/transactions/${row.id}`,
        {
          method: "PATCH",
        body: JSON.stringify({ scope, category, create_rule: createRule, allocations }),
        },
      );
      onSaved(data);
      setEditing(false);
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Transaction could not be confirmed.",
      );
    }
  }
  return (
    <div className="contents">
      <span>{date(row.transaction_date)}</span>
      <button
        onClick={() => setEditing(!editing)}
        className="text-left font-semibold"
      >
        {row.description}
        <small className="block text-xs text-white/42">
          {row.reference ?? row.merchant ?? "Original bank text preserved"}
        </small>
      </button>
      <span
        className={row.signed_amount < 0 ? "text-rose-100" : "text-emerald-100"}
      >
        {sourceMoney(row.signed_amount, row.currency)}
      </span>
      <span>
        {editing ? (
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            className="rounded bg-black px-2 py-1 text-xs"
          >
            <option value="business">Business</option>
            <option value="personal">Personal</option>
            <option value="transfer">Transfer</option>
            <option value="excluded">Exclude</option>
          </select>
        ) : (
          row.scope
        )}
      </span>
      <span>
        {editing ? (
          <div className="space-y-1">
            <input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded bg-black px-2 py-1 text-xs"
              placeholder="Category"
            />
            {row.merchant && scope !== "excluded" && (
              <label className="flex items-center gap-1 text-[11px] text-white/55">
                <input
                  type="checkbox"
                  checked={createRule}
                  onChange={(event) => setCreateRule(event.target.checked)}
                />
                Learn this merchant rule
              </label>
            )}
            {scope === "business" && row.signed_amount > 0 ? (
              <div className="space-y-1">
                {invoiceAllocations.map((allocation, index) => (
                  <div className="flex gap-1" key={index}>
                    <select
                      value={allocation.target}
                      onChange={(event) =>
                        setInvoiceAllocations((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, target: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="min-w-0 flex-1 rounded bg-black px-2 py-1 text-xs"
                    >
                      <option value="">Match invoice…</option>
                      {eligibleInvoices.map((invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.invoice_number ?? invoice.counterparty_name} · {sourceMoney(invoice.outstanding_amount, invoice.currency)}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Allocation amount"
                      value={allocation.amount}
                      onChange={(event) =>
                        setInvoiceAllocations((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, amount: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="w-20 rounded bg-black px-2 py-1 text-xs"
                      inputMode="decimal"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setInvoiceAllocations((current) => [
                      ...current,
                      { target: "", amount: "" },
                    ])
                  }
                  className="text-xs text-emerald-100"
                >
                  + Allocate another invoice
                </button>
              </div>
            ) : scope === "business" && row.signed_amount < 0 ? (
              <div className="space-y-1">
                <select
                  value={targetType}
                  onChange={(event) =>
                    setTargetType(event.target.value as typeof targetType)
                  }
                  className="w-full rounded bg-black px-2 py-1 text-xs"
                >
                  <option value="expense">Match existing expense</option>
                  <option value="owner_draw">Mark owner draw</option>
                  <option value="transfer">Mark internal transfer</option>
                </select>
                {targetType === "expense" && (
                  <select
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    className="w-full rounded bg-black px-2 py-1 text-xs"
                  >
                    <option value="">Create expense from transaction</option>
                    {eligibleExpenses.map((expense) => (
                      <option key={expense.id} value={expense.id}>
                        {expense.vendor} · {sourceMoney(expense.net_amount, expense.currency)}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  aria-label="Allocation amount"
                  value={allocationAmount}
                  onChange={(event) => setAllocationAmount(event.target.value)}
                  className="w-full rounded bg-black px-2 py-1 text-xs"
                  inputMode="decimal"
                />
              </div>
            ) : null}
          </div>
        ) : (
          (row.category ?? "—")
        )}
      </span>
      <span>{row.confidence}</span>
      <span>
        {editing ? (
          <button
            onClick={() => void confirm()}
            className="rounded border border-emerald-300/30 px-2 py-1 text-xs text-emerald-100"
          >
            Confirm
          </button>
        ) : (
          <Status
            label={
              row.classification_status === "needs_review"
                ? "Needs Review"
                : row.classification_status
            }
            tone={
              ["confirmed", "reconciled"].includes(row.classification_status)
                ? "paid"
                : row.classification_status === "needs_review"
                  ? "expected"
                  : "paused"
            }
          />
        )}
      </span>
    </div>
  );
}
function InvoicesSection({
  snapshot,
  money,
  onSaved,
  onError,
}: {
  snapshot: FinanceSnapshot;
  money: (amount: number, currency?: string) => React.ReactNode;
  onSaved: (snapshot: FinanceSnapshot) => void;
  onError: (message: string | null) => void;
}) {
  const [open, setOpen] = useState<string | "new" | null>(null);
  const s = snapshot.summary;
  return (
    <section className="mt-6 space-y-5">
      <SectionHeading
        eyebrow="Receivables"
        title="Invoices"
        action="Create invoice"
        onAction={() => setOpen("new")}
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Ready to invoice"
          value={money(s.readyToInvoiceAed)}
          note="Explicit invoice records only"
        />
        <Metric
          label="Invoiced"
          value={money(s.invoicedRevenueAed)}
          note="Sent, due, overdue or paid"
        />
        <Metric
          label="Due"
          value={money(s.dueRevenueAed)}
          note="Within the automatic seven-day term"
        />
        <Metric
          label="Overdue"
          value={money(s.overdueRevenueAed)}
          note={`${s.overdueInvoiceCount} overdue invoice${s.overdueInvoiceCount === 1 ? "" : "s"}${s.averageDaysOverdue === null ? "" : ` · ${s.averageDaysOverdue} days average`}`}
        />
        <Metric
          label="Collected"
          value={money(s.collectedRevenueAed)}
          note="Only confirmed paid invoices"
        />
      </div>
      <RecordTable
        headers={[
          "Client",
          "Invoice",
          "Amount",
          "Available",
          "Sent / due",
          "Status",
          "Attachment",
        ]}
        empty="No invoice instances are recorded for this month. Create an invoice from a confirmed revenue record when it is ready."
      >
        {snapshot.invoices.map((row) => (
          <button
            key={row.id}
            onClick={() => setOpen(row.id)}
            className="contents text-left"
          >
            <span className="font-semibold">{row.counterparty_name}</span>
            <span>
              {row.title}
              <small className="block text-xs text-white/42">
                {row.invoice_number ?? "No invoice number"}
              </small>
            </span>
            <span>{money(row.amount, row.currency)}</span>
            <span className="text-white/56">
              {date(row.invoice_available_date)}
            </span>
            <span className="text-white/56">
              {row.sent_at
                ? `${date(row.sent_at)} · ${date(row.due_at)}`
                : "Not sent"}
            </span>
            <span>
              <Status
                label={
                  row.status === "ready_to_invoice"
                    ? "Ready to Invoice"
                    : row.status === "due"
                      ? row.days_until_due === 0
                        ? "Due today"
                        : `Due in ${row.days_until_due}d`
                      : row.status === "overdue"
                        ? `${row.days_overdue} days overdue`
                        : row.status === "paid"
                          ? "Paid"
                          : "Upcoming"
                }
                tone={
                  row.status === "ready_to_invoice" ? "expected" : row.status
                }
              />
            </span>
            <span className="text-white/56">
              {row.attachments.length
                ? row.attachments.map((file) => file.file_name).join(", ")
                : "—"}
            </span>
          </button>
        ))}
      </RecordTable>
      {open && (
        <InvoiceDialog
          invoice={
            open === "new"
              ? null
              : (snapshot.invoices.find((row) => row.id === open) ?? null)
          }
          snapshot={snapshot}
          onClose={() => setOpen(null)}
          onSaved={(next) => {
            onSaved(next);
            setOpen(null);
          }}
          onError={onError}
        />
      )}
    </section>
  );
}
function InvoiceDialog({
  invoice,
  snapshot,
  onClose,
  onSaved,
  onError,
}: {
  invoice: import("@/lib/finance-costs").FinanceInvoice | null;
  snapshot: FinanceSnapshot;
  onClose: () => void;
  onSaved: (snapshot: FinanceSnapshot) => void;
  onError: (message: string | null) => void;
}) {
  const selectedIncome = invoice
    ? snapshot.income.find((row) => row.id === invoice.income_record_id)
    : snapshot.income[0];
  const [draft, setDraft] = useState(() => ({
    income_record_id: invoice?.income_record_id ?? selectedIncome?.id ?? "",
    client_id: invoice?.client_id ?? selectedIncome?.client_id ?? "",
    counterparty_name:
      invoice?.counterparty_name ?? selectedIncome?.counterparty_name ?? "",
    title: invoice?.title ?? selectedIncome?.description ?? "",
    invoice_number: invoice?.invoice_number ?? "",
    invoice_month:
      invoice?.invoice_month ?? `${snapshot.summary.selectedMonth}-01`,
    amount: String(invoice?.amount ?? selectedIncome?.net_amount ?? ""),
    currency: invoice?.currency ?? selectedIncome?.currency ?? "AED",
    invoice_available_date:
      invoice?.invoice_available_date ?? new Date().toISOString().slice(0, 10),
    sent_at: invoice?.sent_at ?? "",
    paid_at: invoice?.paid_at ?? "",
    paid_amount:
      invoice?.paid_amount === null || invoice?.paid_amount === undefined
        ? ""
        : String(invoice.paid_amount),
    payment_reference: invoice?.payment_reference ?? "",
    notes: invoice?.notes ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const set = (field: string, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));
  async function save() {
    setSaving(true);
    try {
      const url = invoice
        ? `/api/finance/invoices/${invoice.id}`
        : "/api/finance/invoices";
      onSaved(
        await requestJson(url, {
          method: invoice ? "PATCH" : "POST",
          body: JSON.stringify(
            invoice
              ? { expectedUpdatedAt: invoice.updated_at, patch: draft }
              : draft,
          ),
        }),
      );
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Invoice could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function upload(file: File | null) {
    if (!file || !invoice) return;
    setSaving(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(
        `/api/finance/invoices/${invoice.id}/attachment`,
        { method: "POST", body: form },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Upload failed.");
      window.location.reload();
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Invoice document could not be uploaded.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function preview(attachmentId: string) {
    try {
      const response = await fetch(
        `/api/finance/invoices/${invoice?.id}/attachment/${attachmentId}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Preview unavailable.");
      window.open(data.signed_url, "_blank", "noopener,noreferrer");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Preview unavailable.");
    }
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/75 p-4 sm:items-center"
    >
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-white/10 bg-[#080c09] p-5 shadow-2xl">
        <div className="flex justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-emerald-200/70">
              Invoice lifecycle
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              {invoice ? invoice.counterparty_name : "Create invoice"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-white/10 px-3 py-2 text-xs"
          >
            Close
          </button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Select
            label="Revenue record"
            value={draft.income_record_id}
            set={(value) => {
              const income = snapshot.income.find((row) => row.id === value);
              setDraft((current) => ({
                ...current,
                income_record_id: value,
                client_id: income?.client_id ?? "",
                counterparty_name: income?.counterparty_name ?? "",
                title: income?.description ?? "",
                amount: String(income?.net_amount ?? ""),
                currency: income?.currency ?? "AED",
              }));
            }}
            options={[
              ["", "Select revenue"],
              ...snapshot.income.map(
                (row) =>
                  [
                    row.id,
                    `${row.counterparty_name} — ${row.description}`,
                  ] as const,
              ),
            ]}
          />
          <Select
            label="Linked client"
            value={draft.client_id}
            set={(value) => set("client_id", value)}
            options={[
              ["", "Not linked"],
              ...snapshot.clients.map((row) => [row.id, row.name] as const),
            ]}
          />
          <Field
            label="Client / counterparty"
            value={draft.counterparty_name}
            set={(value) => set("counterparty_name", value)}
          />
          <Field
            label="Invoice title"
            value={draft.title}
            set={(value) => set("title", value)}
          />
          <Field
            label="Invoice number"
            value={draft.invoice_number}
            set={(value) => set("invoice_number", value)}
          />
          <Field
            label="Invoice month"
            value={draft.invoice_month}
            set={(value) => set("invoice_month", value)}
            type="date"
          />
          <Field
            label="Amount"
            value={draft.amount}
            set={(value) => set("amount", value)}
            type="number"
          />
          <Field
            label="Currency"
            value={draft.currency}
            set={(value) => set("currency", value.toUpperCase())}
          />
          <Field
            label="Can be sent on"
            value={draft.invoice_available_date}
            set={(value) => set("invoice_available_date", value)}
            type="date"
          />
          <Field
            label="Sent date"
            value={draft.sent_at}
            set={(value) => set("sent_at", value)}
            type="date"
          />
          <Field
            label="Paid date"
            value={draft.paid_at}
            set={(value) => set("paid_at", value)}
            type="date"
          />
          <Field
            label="Amount paid"
            value={draft.paid_amount}
            set={(value) => set("paid_amount", value)}
            type="number"
          />
          <div className="sm:col-span-2">
            <Field
              label="Payment reference"
              value={draft.payment_reference}
              set={(value) => set("payment_reference", value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Field
              label="Notes"
              value={draft.notes}
              set={(value) => set("notes", value)}
              multiline
            />
          </div>
        </div>
        {invoice && (
          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="text-sm font-semibold">Documents</p>
            <p className="mt-1 text-xs text-white/45">
              PDF, JPEG or PNG up to 10 MB. The server scopes each object to
              this invoice’s linked client.
            </p>
            <input
              className="mt-3 text-sm"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(event) => void upload(event.target.files?.[0] ?? null)}
            />
            {invoice.attachments.map((file) => (
              <button
                key={file.id}
                onClick={() => void preview(file.id)}
                className="mt-3 block text-sm text-emerald-100 underline"
              >
                Open {file.file_name}
              </button>
            ))}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2 border-t border-white/10 pt-4">
          <button
            onClick={onClose}
            className="rounded-md border border-white/10 px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            onClick={() => void save()}
            className="rounded-md bg-emerald-300 px-4 py-2 text-sm font-semibold text-[#062016] disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : invoice?.status === "ready_to_invoice"
                ? "Save / mark sent"
                : "Save invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}
function InvestmentsSection({
  snapshot,
  money,
}: {
  snapshot: FinanceSnapshot;
  money: (amount: number, currency?: string) => React.ReactNode;
}) {
  const s = snapshot.summary;
  return (
    <section className="mt-6 space-y-5">
      <SectionHeading eyebrow="Capital planning" title="Investments" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Total planned"
          value={money(s.investmentSummary.plannedAed)}
          note="Planned purchases are not expenses"
        />
        <Metric
          label="Funded"
          value={money(s.investmentSummary.fundedAed)}
          note="Explicitly allocated only"
        />
        <Metric
          label="Remaining"
          value={money(s.investmentSummary.remainingAed)}
          note="Unallocated planned cost"
        />
        <Metric
          label="Affordable now"
          value={String(s.investmentSummary.affordableNow)}
          note={`${s.investmentSummary.projectedAffordable} projected affordable`}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {snapshot.investments.map((row) => {
          const affordability = s.investmentAffordability.find(
            (item) => item.id === row.id,
          );
          return (
            <div
              key={row.id}
              className="rounded-xl border border-white/10 bg-white/[.025] p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-emerald-200/70">
                    {row.category}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">{row.name}</h2>
                </div>
                <Status
                  label={row.status}
                  tone={row.status === "affordable" ? "paid" : row.status}
                />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-white/45">Estimated</p>
                  <p className="mt-1 font-semibold">
                    {money(row.estimated_amount, row.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-white/45">Allocated</p>
                  <p className="mt-1 font-semibold">
                    {money(row.allocated_amount, row.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-white/45">Can afford now</p>
                  <p className="mt-1 font-semibold">
                    {affordability?.affordableNow ? (
                      "Yes"
                    ) : (
                      <>
                        No · short {money(affordability?.shortfallNowAed ?? 0)}
                      </>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-white/45">Projected</p>
                  <p className="mt-1 font-semibold">
                    {affordability?.projectedAffordable ? (
                      "Possible after collections"
                    ) : (
                      <>
                        Short {money(affordability?.shortfallProjectedAed ?? 0)}
                      </>
                    )}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-white/45">
                Actual cash is based only on collections. Projected
                affordability is explicitly based on expected revenue, after
                obligations and the configured reserve.
              </p>
            </div>
          );
        })}
      </div>
      <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[.04] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-emerald-100/70">
          Capital allocation
        </p>
        <h2 className="mt-1 text-lg font-semibold">
          Keep the reserve before a draw or reinvestment
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric
            label="Operating obligations"
            value={money(s.upcomingCommittedObligationsAed)}
            note="Committed near-term costs"
          />
          <Metric
            label="Reserve target"
            value={money(s.reserveTargetAed)}
            note={`${snapshot.capitalPolicy.reserve_target_months} month baseline · funded balance unknown`}
          />
          <Metric
            label="Reinvestment / draw capacity"
            value={money(s.reinvestmentCapacityAed)}
            note="Same unallocated surplus; choose, do not double-spend"
          />
        </div>
        <p className="mt-4 text-xs leading-5 text-white/50">
          No bank balance is recorded, so reserve funding is planning guidance
          rather than a claimed cash balance. The recommendation subtracts
          confirmed collections, paid costs, upcoming commitments, the reserve
          target and paid owner draws.
        </p>
        <CapitalPolicyForm snapshot={snapshot} />
      </div>
    </section>
  );
}
function CapitalPolicyForm({ snapshot }: { snapshot: FinanceSnapshot }) {
  const [months, setMonths] = useState(
    String(snapshot.capitalPolicy.reserve_target_months),
  );
  const [custom, setCustom] = useState(
    snapshot.capitalPolicy.custom_reserve_aed === null
      ? ""
      : String(snapshot.capitalPolicy.custom_reserve_aed),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await requestJson("/api/finance/capital-policy", {
        method: "PUT",
        body: JSON.stringify({
          expectedUpdatedAt: snapshot.capitalPolicy.updated_at || undefined,
          policy: { reserve_target_months: months, custom_reserve_aed: custom },
        }),
      });
      window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Reserve policy could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <p className="text-sm font-semibold">Reserve policy</p>
      <p className="mt-1 text-xs text-white/45">
        The default is one month of known commitments. Change the visible rule;
        no hidden allocation percentage is used.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Field
          label="Months of obligations"
          value={months}
          set={setMonths}
          type="number"
        />
        <Field
          label="Or custom AED reserve"
          value={custom}
          set={setCustom}
          type="number"
        />
        <button
          disabled={saving}
          onClick={() => void save()}
          className="self-end rounded-md border border-emerald-300/35 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save rule"}
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-rose-100">{message}</p>}
    </div>
  );
}
function UsageSection({ snapshot }: { snapshot: FinanceSnapshot }) {
  const byProvider = useMemo(() => {
    const totals = new Map<string, number>();
    snapshot.usage.forEach((row) =>
      totals.set(
        row.provider,
        (totals.get(row.provider) ?? 0) + row.cost_usd_actual,
      ),
    );
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [snapshot.usage]);
  return (
    <section className="mt-6">
      <SectionHeading
        eyebrow="Variable operational cost"
        title="AI / API Costs"
      />
      <div className="mt-4 grid gap-4 xl:grid-cols-[.7fr_1.3fr]">
        <div className="rounded-lg border border-white/10 bg-white/[0.025] p-5">
          <p className="text-sm text-white/50">Recorded this month</p>
          <p className="mt-2 text-3xl font-semibold">
            {sourceMoney(snapshot.summary.aiApiSpendUsd, "USD")}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-white/42">
            AI usage logs are canonical. Equivalent monthly-planner ledger
            entries are detected and excluded to prevent double counting.
          </p>
          <div className="mt-5 space-y-2">
            {byProvider.map(([provider, amount]) => (
              <div key={provider} className="flex justify-between text-sm">
                <span className="text-white/58">{provider}</span>
                <span>{sourceMoney(amount, "USD")}</span>
              </div>
            ))}
          </div>
        </div>
        <RecordTable
          headers={["Provider", "Feature", "Source", "Recorded", "Actual cost"]}
          empty="No recorded AI/API costs this month."
        >
          {snapshot.usage.map((row) => (
            <div key={`${row.source}-${row.id}`} className="contents">
              <span className="font-semibold">{row.provider}</span>
              <span className="text-white/56">{row.feature}</span>
              <span className="capitalize">{row.source.replace("_", " ")}</span>
              <span className="text-white/56">
                {new Intl.DateTimeFormat("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(row.recorded_at))}
              </span>
              <span>{sourceMoney(row.cost_usd_actual, "USD")}</span>
            </div>
          ))}
        </RecordTable>
      </div>
    </section>
  );
}
function PersonalSection({
  snapshot,
  onRecordDraw,
  onRecordExpense,
}: {
  snapshot: FinanceSnapshot;
  onRecordDraw: () => void;
  onRecordExpense: () => void;
}) {
  const s = snapshot.summary;
  return (
    <section className="mt-6 space-y-6">
      <SectionHeading
        eyebrow="Personal Finance"
        title="Separate from MC Studios business P&L"
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Income from MC Studios"
          value={aed(s.paidOwnerDrawAed)}
          note="Only explicit owner draws marked paid"
        />
        <Metric
          label="Available to pay myself"
          value={aed(s.availableOwnerDrawAed)}
          note="Business-derived capacity; not yet personal income"
        />
        <Metric
          label="Personal expenses"
          value={aed(s.personalExpensesAed)}
          note="Personal records never enter business expenses"
        />
        <Metric
          label="Personal net cash flow"
          value={aed(s.personalNetCashFlowAed)}
          note="Paid owner draw less personal expenses"
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-emerald-100/70">
                Owner-draw transfers
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Business → personal
              </h2>
            </div>
            <button
              onClick={onRecordDraw}
              className="rounded-md border border-emerald-300/30 px-3 py-2 text-xs font-semibold text-emerald-100"
            >
              Record draw
            </button>
          </div>
          {snapshot.ownerDraws.length ? (
            <div className="mt-4 space-y-2">
              {snapshot.ownerDraws.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-black/20 p-3"
                >
                  <div>
                    <p className="font-semibold">
                      {sourceMoney(row.amount, row.currency)}
                    </p>
                    <p className="mt-1 text-xs text-white/42">
                      Business period {date(row.business_period_start)}
                      {row.paid_at ? ` · paid ${date(row.paid_at)}` : ""}
                    </p>
                  </div>
                  <Status
                    label={row.status}
                    tone={
                      row.status === "paid"
                        ? "paid"
                        : row.status === "cancelled"
                          ? "cancelled"
                          : "expected"
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-white/45">
              No owner draw has been recorded. A paid draw is one linked
              business → personal transfer, not a business operating expense
              plus a second personal entry.
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-emerald-100/70">
                Personal expenses
              </p>
              <h2 className="mt-1 text-lg font-semibold">Personal cash flow</h2>
            </div>
            <button
              onClick={onRecordExpense}
              className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-white/70"
            >
              Add expense
            </button>
          </div>
          {snapshot.personalExpenses.length ? (
            <div className="mt-4 space-y-2">
              {snapshot.personalExpenses.map((row) => (
                <div
                  key={row.id}
                  className="flex justify-between rounded-xl border border-white/[0.08] bg-black/20 p-3"
                >
                  <span>{row.name}</span>
                  <span>{sourceMoney(row.amount, row.currency)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-white/45">
              No personal spending has been entered. Rent, subscriptions, food,
              transport, travel, investing and savings stay separate from MC
              Studios P&L.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
function VatSection({ snapshot }: { snapshot: FinanceSnapshot }) {
  const s = snapshot.summary;
  return (
    <section className="mt-6">
      <SectionHeading eyebrow="Operational visibility only" title="VAT" />
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Metric
          label="Output VAT collected"
          value={<ReportMoney amount={s.vatCollectedEur} />}
          note={`From income records. AED source: ${sourceMoney(s.sourceTotals.vatAed)}`}
        />
        <Metric
          label="Input VAT recorded"
          value={<ReportMoney amount={s.inputVatEur} />}
          note="From recorded operating expenses"
        />
        <Metric
          label="Net VAT position"
          value={<ReportMoney amount={s.netVatEur} />}
          note="Output less recorded input VAT"
        />
      </div>
      <p className="mt-5 max-w-3xl text-sm leading-relaxed text-white/45">
        This workspace provides operational visibility, not UAE VAT filing or
        tax advice. VAT is never included in Revenue or Recorded Operating
        Profit.
      </p>
    </section>
  );
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-white/40">
        {label}
      </p>
      <div className="mt-2 text-2xl text-emerald-50">{value}</div>
      <p className="mt-2 text-xs leading-relaxed text-white/42">{note}</p>
    </div>
  );
}
function SectionHeading({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-emerald-200/65">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
      </div>
      {action && (
        <button
          onClick={onAction}
          className="rounded-md bg-emerald-300 px-3 py-2 text-xs font-semibold text-[#062016]"
        >
          {action}
        </button>
      )}
    </div>
  );
}
function Status({ label, tone }: { label: string; tone: string }) {
  const styles: Record<string, string> = {
    paid: "bg-emerald-300/10 text-emerald-100",
    expected: "bg-amber-300/10 text-amber-100",
    invoiced: "bg-sky-300/10 text-sky-100",
    overdue: "bg-rose-300/10 text-rose-100",
    active: "bg-emerald-300/10 text-emerald-100",
    activated: "bg-emerald-300/10 text-emerald-100",
    upcoming: "bg-sky-300/10 text-sky-100",
    potential: "bg-amber-300/10 text-amber-100",
    won: "bg-emerald-300/10 text-emerald-100",
    lost: "bg-rose-300/10 text-rose-100",
    paused: "bg-amber-300/10 text-amber-100",
    cancelled: "bg-zinc-300/10 text-zinc-200",
  };
  return (
    <span
      className={`w-fit rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${styles[tone] ?? "bg-white/8 text-white/60"}`}
    >
      {label}
    </span>
  );
}
function RecordTable({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: React.ReactNode;
  empty: string;
}) {
  const childCount = Array.isArray(children) ? children.length : 1;
  const gridStyle = {
    gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))`,
  };
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
      <div
        style={gridStyle}
        className="grid min-w-[900px] gap-4 border-b border-white/10 bg-white/[0.025] px-4 py-3 text-[10px] font-semibold uppercase tracking-[.12em] text-white/38"
      >
        {headers.map((header) => (
          <span key={header}>{header}</span>
        ))}
      </div>
      {childCount ? (
        <div
          style={gridStyle}
          className="grid min-w-[900px] gap-x-4 gap-y-0 [&>*]:border-b [&>*]:border-white/[0.06] [&>*]:px-4 [&>*]:py-3 [&>*]:text-sm"
        >
          {children}
        </div>
      ) : (
        <p className="p-8 text-sm text-white/42">{empty}</p>
      )}
    </div>
  );
}

function EditorDialog({
  editor,
  snapshot,
  saving,
  setSaving,
  onClose,
  onSaved,
  onError,
}: {
  editor: Exclude<Editor, null>;
  snapshot: FinanceSnapshot;
  saving: boolean;
  setSaving: (value: boolean) => void;
  onClose: () => void;
  onSaved: (snapshot: FinanceSnapshot) => void;
  onError: (value: string | null) => void;
}) {
  const [draft, setDraft] = useState(() => initialDraft(editor, snapshot));
  const set = (field: string, value: string | boolean) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const title =
    editor.kind === "settings"
      ? "Finance FX settings"
      : `${editor.record ? "Edit" : "Add"} ${editor.kind === "upcoming" ? "upcoming revenue" : editor.kind === "pipeline" ? "pipeline prospect" : editor.kind === "owner_draw" ? "owner draw" : editor.kind === "personal_expense" ? "personal expense" : editor.kind}`;
  async function save() {
    setSaving(true);
    onError(null);
    try {
      let url = "/api/finance";
      let method = "PUT";
      let body: Record<string, unknown> = {
        expectedUpdatedAt:
          editor.kind === "settings"
            ? snapshot.settings.updated_at || undefined
            : editor.record?.updated_at,
        settings: draft,
      };
      if (editor.kind !== "settings") {
        const plural =
          editor.kind === "income"
            ? "income"
            : editor.kind === "expense"
              ? "expenses"
              : editor.kind === "subscription"
                ? "subscriptions"
                : editor.kind === "upcoming"
                  ? "upcoming"
                  : editor.kind === "owner_draw"
                    ? "owner-draws"
                    : editor.kind === "personal_expense"
                      ? "personal-expenses"
                      : "pipeline";
        url = editor.record
          ? `/api/finance/${plural}/${editor.record.id}`
          : `/api/finance/${plural}`;
        method = editor.record ? "PATCH" : "POST";
        body = editor.record
          ? { expectedUpdatedAt: editor.record.updated_at, patch: draft }
          : draft;
      }
      onSaved(await requestJson(url, { method, body: JSON.stringify(body) }));
    } catch (caught) {
      onError(
        caught instanceof Error ? caught.message : "Record could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (
      editor.kind === "settings" ||
      editor.kind === "upcoming" ||
      editor.kind === "pipeline" ||
      !editor.record ||
      !window.confirm(`Delete this ${editor.kind} record?`)
    )
      return;
    setSaving(true);
    try {
      const plural =
        editor.kind === "income"
          ? "income"
          : editor.kind === "expense"
            ? "expenses"
            : "subscriptions";
      onSaved(
        await requestJson(`/api/finance/${plural}/${editor.record.id}`, {
          method: "DELETE",
          body: JSON.stringify({ expectedUpdatedAt: editor.record.updated_at }),
        }),
      );
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "Record could not be deleted.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/10 bg-[#080c09] p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-emerald-200/70">
              Finance
            </p>
            <h2 className="mt-1 text-xl font-semibold capitalize">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-white/65"
          >
            Close
          </button>
        </div>
        {editor.kind === "settings" ? (
          <SettingsFields draft={draft} set={set} />
        ) : (
          <RecordFields
            kind={editor.kind}
            draft={draft}
            set={set}
            clients={snapshot.clients}
          />
        )}
        <div className="mt-6 flex justify-between gap-3 border-t border-white/10 pt-4">
          <div>
            {editor.kind !== "settings" &&
              editor.kind !== "upcoming" &&
              editor.kind !== "pipeline" &&
              editor.record && (
                <button
                  disabled={saving}
                  onClick={() => void remove()}
                  className="rounded-md border border-rose-300/25 px-4 py-2.5 text-sm font-semibold text-rose-100 disabled:opacity-40"
                >
                  Delete
                </button>
              )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/65"
            >
              Cancel
            </button>
            <button
              disabled={saving}
              onClick={() => void save()}
              className="rounded-md bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-[#062016] disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
function initialDraft(
  editor: Exclude<Editor, null>,
  snapshot: FinanceSnapshot,
): Record<string, string | boolean> {
  if (editor.kind === "settings")
    return {
      display_currency: snapshot.settings.display_currency,
      aed_per_eur_rate:
        snapshot.settings.aed_eur_rate === null
          ? ""
          : (1 / snapshot.settings.aed_eur_rate).toFixed(2),
    };
  if (editor.kind === "owner_draw")
    return {
      amount: "",
      currency: "AED",
      status: "paid",
      business_period_start: `${snapshot.summary.selectedMonth}-01`,
      paid_at: new Date().toISOString().slice(0, 10),
      notes: "",
    };
  if (editor.kind === "personal_expense")
    return {
      name: "",
      category: "other",
      amount: "",
      currency: "AED",
      recurrence: "one_off",
      expense_date: new Date().toISOString().slice(0, 10),
      active: true,
      notes: "",
    };
  if (editor.kind === "income") {
    const r = editor.record;
    return r
      ? {
          counterparty_name: r.counterparty_name,
          description: r.description,
          income_type: r.income_type,
          net_amount: String(r.net_amount),
          currency: r.currency,
          vat_rate: String(r.vat_rate),
          billing_cycle: r.billing_cycle,
          start_date: r.start_date ?? "",
          end_date: r.end_date ?? "",
          next_billing_date: r.next_billing_date ?? "",
          due_date: r.due_date ?? "",
          payment_date: r.payment_date ?? "",
          payment_status: r.payment_status,
          client_id: r.client_id ?? "",
          active: r.active,
          notes: r.notes ?? "",
        }
      : {
          counterparty_name: "",
          description: "",
          income_type: "recurring_service_revenue",
          net_amount: "",
          currency: "AED",
          vat_rate: "5",
          billing_cycle: "monthly",
          start_date: "",
          end_date: "",
          next_billing_date: "",
          due_date: "",
          payment_date: "",
          payment_status: "not_set",
          client_id: "",
          active: true,
          notes: "",
        };
  }
  if (editor.kind === "upcoming") {
    const r = editor.record;
    return r
      ? {
          counterparty_name: r.counterparty_name,
          description: r.description,
          net_amount: String(r.net_amount),
          currency: r.currency,
          vat_rate: String(r.vat_rate),
          billing_cycle: r.billing_cycle,
          expected_start_date: r.expected_start_date,
          status: r.status,
          client_id: r.client_id ?? "",
          notes: r.notes ?? "",
        }
      : {
          counterparty_name: "",
          description: "",
          net_amount: "",
          currency: "AED",
          vat_rate: "5",
          billing_cycle: "monthly",
          expected_start_date: "",
          status: "upcoming",
          client_id: "",
          notes: "",
        };
  }
  if (editor.kind === "pipeline") {
    const r = editor.record;
    return r
      ? {
          name: r.name,
          description: r.description ?? "",
          stage: r.stage,
          stage_detail: r.stage_detail ?? "",
          net_amount: String(r.net_amount),
          currency: r.currency,
          vat_rate: String(r.vat_rate),
          billing_cycle: r.billing_cycle,
          expected_start_date: r.expected_start_date ?? "",
          probability: r.probability === null ? "" : String(r.probability),
          client_id: r.client_id ?? "",
          notes: r.notes ?? "",
        }
      : {
          name: "",
          description: "",
          stage: "not_contacted",
          stage_detail: "",
          net_amount: "",
          currency: "AED",
          vat_rate: "0",
          billing_cycle: "monthly",
          expected_start_date: "",
          probability: "",
          client_id: "",
          notes: "",
        };
  }
  if (editor.kind === "expense") {
    const r = editor.record;
    return r
      ? {
          vendor: r.vendor,
          description: r.description,
          category: r.category,
          net_amount: String(r.net_amount),
          currency: r.currency,
          vat_rate: String(r.vat_rate),
          billing_cycle: r.billing_cycle,
          expense_date: r.expense_date ?? "",
          start_date: r.start_date ?? "",
          end_date: r.end_date ?? "",
          client_id: r.client_id ?? "",
          client_allocation_name: r.client_allocation_name ?? "",
          active: r.active,
          notes: r.notes ?? "",
        }
      : {
          vendor: "",
          description: "",
          category: "operating",
          net_amount: "",
          currency: "AED",
          vat_rate: "0",
          billing_cycle: "one_off",
          expense_date: "",
          start_date: "",
          end_date: "",
          client_id: "",
          client_allocation_name: "",
          active: true,
          notes: "",
        };
  }
  const r = editor.record;
  return r
    ? {
        vendor: r.vendor,
        plan_name: r.plan_name ?? "",
        category: r.category,
        amount: String(r.amount),
        currency: r.currency,
        billing_cycle: r.billing_cycle,
        start_date: r.start_date ?? "",
        next_renewal_date: r.next_renewal_date ?? "",
        status: r.status,
        allocation_scope: r.allocation_scope,
        client_id: r.client_id ?? "",
        notes: r.notes ?? "",
        documentation_url: r.documentation_url ?? "",
      }
    : {
        vendor: "",
        plan_name: "",
        category: "other",
        amount: "",
        currency: "USD",
        billing_cycle: "monthly",
        start_date: "",
        next_renewal_date: "",
        status: "active",
        allocation_scope: "agency_wide",
        client_id: "",
        notes: "",
        documentation_url: "",
      };
}
function SettingsFields({
  draft,
  set,
}: {
  draft: Record<string, string | boolean>;
  set: (field: string, value: string | boolean) => void;
}) {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <Select
        label="Display currency"
        value={String(draft.display_currency)}
        set={(value) => set("display_currency", value)}
        options={FINANCE_DISPLAY_MODES.map((value) => [
          value,
          value.toUpperCase(),
        ])}
      />
      <Field
        label="Working exchange rate"
        value={String(draft.aed_per_eur_rate)}
        set={(value) => set("aed_per_eur_rate", value)}
        type="number"
        placeholder="€1 = AED 4.25"
      />
      <p className="sm:col-span-2 text-xs leading-relaxed text-white/45">
        Enter AED per EUR, for example €1 = AED 4.25. This manual display rate
        never rewrites source finance records or represents live market data.
      </p>
    </div>
  );
}
function RecordFields({
  kind,
  draft,
  set,
  clients,
}: {
  kind: Exclude<Editor, null>["kind"];
  draft: Record<string, string | boolean>;
  set: (field: string, value: string | boolean) => void;
  clients: Array<{ id: string; name: string }>;
}) {
  const select = (
    label: string,
    field: string,
    options: ReadonlyArray<readonly [string, string]>,
  ) => (
    <Select
      label={label}
      value={String(draft[field])}
      set={(value) => set(field, value)}
      options={options}
    />
  );
  const linkedClient = (
    <Select
      label="Linked client (optional)"
      value={String(draft.client_id)}
      set={(value) => set("client_id", value)}
      options={[
        ["", "Not linked"],
        ...clients.map((client) => [client.id, client.name] as const),
      ]}
    />
  );
  if (kind === "owner_draw")
    return (
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field
          label="Amount"
          value={String(draft.amount)}
          set={(value) => set("amount", value)}
          type="number"
        />
        <Field
          label="Currency"
          value={String(draft.currency)}
          set={(value) => set("currency", value.toUpperCase())}
        />
        {select("Status", "status", [
          ["planned", "Planned"],
          ["paid", "Paid"],
          ["cancelled", "Cancelled"],
        ])}
        <Field
          label="Business period"
          value={String(draft.business_period_start)}
          set={(value) => set("business_period_start", value)}
          type="date"
        />
        {draft.status === "paid" && (
          <Field
            label="Paid date"
            value={String(draft.paid_at)}
            set={(value) => set("paid_at", value)}
            type="date"
          />
        )}
        <div className="sm:col-span-2">
          <Field
            label="Notes"
            value={String(draft.notes)}
            set={(value) => set("notes", value)}
            multiline
          />
        </div>
        <p className="sm:col-span-2 text-xs leading-5 text-white/45">
          A paid draw is recorded once as a linked business distribution and
          personal income. It is not an operating expense.
        </p>
      </div>
    );
  if (kind === "personal_expense")
    return (
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          value={String(draft.name)}
          set={(value) => set("name", value)}
        />
        {select("Category", "category", [
          ["rent", "Rent"],
          ["subscriptions", "Subscriptions"],
          ["food", "Food"],
          ["transport", "Transport"],
          ["travel", "Travel"],
          ["investing", "Investing"],
          ["savings", "Savings"],
          ["other", "Other"],
        ])}
        <Field
          label="Amount"
          value={String(draft.amount)}
          set={(value) => set("amount", value)}
          type="number"
        />
        <Field
          label="Currency"
          value={String(draft.currency)}
          set={(value) => set("currency", value.toUpperCase())}
        />
        {select(
          "Recurrence",
          "recurrence",
          SUBSCRIPTION_CYCLES.map(
            (value) => [value, billingCycleLabel(value)] as const,
          ),
        )}
        <Field
          label="Expense date"
          value={String(draft.expense_date)}
          set={(value) => set("expense_date", value)}
          type="date"
        />
        <div className="sm:col-span-2">
          <Field
            label="Notes"
            value={String(draft.notes)}
            set={(value) => set("notes", value)}
            multiline
          />
        </div>
      </div>
    );
  if (kind === "upcoming")
    return (
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field
          label="Client or counterparty"
          value={String(draft.counterparty_name)}
          set={(value) => set("counterparty_name", value)}
        />
        {linkedClient}
        <Field
          label="Description"
          value={String(draft.description)}
          set={(value) => set("description", value)}
        />
        <Field
          label="Net monthly amount"
          value={String(draft.net_amount)}
          set={(value) => set("net_amount", value)}
          type="number"
        />
        <Field
          label="Currency"
          value={String(draft.currency)}
          set={(value) => set("currency", value.toUpperCase())}
        />
        <Field
          label="VAT rate (%)"
          value={String(draft.vat_rate)}
          set={(value) => set("vat_rate", value)}
          type="number"
        />
        {select(
          "Billing cycle",
          "billing_cycle",
          SUBSCRIPTION_CYCLES.map(
            (value) => [value, billingCycleLabel(value)] as const,
          ),
        )}
        <Field
          label="Expected start"
          value={String(draft.expected_start_date)}
          set={(value) => set("expected_start_date", value)}
          type="date"
        />
        {draft.status === "activated" ? (
          <p className="self-end text-sm text-emerald-100">
            Activated as current income
          </p>
        ) : (
          select(
            "Status",
            "status",
            UPCOMING_REVENUE_STATUSES.filter(
              (value) => value !== "activated",
            ).map(
              (value) => [value, upcomingRevenueStatusLabel(value)] as const,
            ),
          )
        )}
        <div className="sm:col-span-2">
          <Field
            label="Internal notes"
            value={String(draft.notes)}
            set={(value) => set("notes", value)}
            multiline
          />
        </div>
      </div>
    );
  if (kind === "pipeline")
    return (
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field
          label="Prospect name"
          value={String(draft.name)}
          set={(value) => set("name", value)}
        />
        {linkedClient}
        <Field
          label="Description"
          value={String(draft.description)}
          set={(value) => set("description", value)}
        />
        {select(
          "Stage",
          "stage",
          PIPELINE_STAGES.map(
            (value) => [value, pipelineStageLabel(value)] as const,
          ),
        )}
        <Field
          label="Stage detail (optional)"
          value={String(draft.stage_detail)}
          set={(value) => set("stage_detail", value)}
        />
        <Field
          label="Net monthly amount"
          value={String(draft.net_amount)}
          set={(value) => set("net_amount", value)}
          type="number"
        />
        <Field
          label="Currency"
          value={String(draft.currency)}
          set={(value) => set("currency", value.toUpperCase())}
        />
        <Field
          label="VAT rate (%)"
          value={String(draft.vat_rate)}
          set={(value) => set("vat_rate", value)}
          type="number"
        />
        {select(
          "Billing cycle",
          "billing_cycle",
          SUBSCRIPTION_CYCLES.map(
            (value) => [value, billingCycleLabel(value)] as const,
          ),
        )}
        <Field
          label="Expected start"
          value={String(draft.expected_start_date)}
          set={(value) => set("expected_start_date", value)}
          type="date"
        />
        <Field
          label="Probability (optional)"
          value={String(draft.probability)}
          set={(value) => set("probability", value)}
          type="number"
        />
        <div className="sm:col-span-2">
          <Field
            label="Internal notes"
            value={String(draft.notes)}
            set={(value) => set("notes", value)}
            multiline
          />
        </div>
      </div>
    );
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      {kind === "income" && (
        <>
          <Field
            label="Client or counterparty"
            value={String(draft.counterparty_name)}
            set={(value) => set("counterparty_name", value)}
          />
          {linkedClient}
          <Field
            label="Description"
            value={String(draft.description)}
            set={(value) => set("description", value)}
          />
          {select(
            "Income type",
            "income_type",
            INCOME_TYPES.map(
              (value) => [value, incomeTypeLabel(value)] as const,
            ),
          )}
          {select(
            "Payment status",
            "payment_status",
            PAYMENT_STATUSES.map(
              (value) => [value, paymentStatusLabel(value)] as const,
            ),
          )}
        </>
      )}
      {kind === "expense" && (
        <>
          <Field
            label="Vendor"
            value={String(draft.vendor)}
            set={(value) => set("vendor", value)}
          />
          {linkedClient}
          <Field
            label="Client allocation (optional)"
            value={String(draft.client_allocation_name)}
            set={(value) => set("client_allocation_name", value)}
          />
          <Field
            label="Description"
            value={String(draft.description)}
            set={(value) => set("description", value)}
          />
          {select(
            "Category",
            "category",
            EXPENSE_CATEGORIES.map(
              (value) => [value, expenseCategoryLabel(value)] as const,
            ),
          )}
        </>
      )}
      {kind === "subscription" && (
        <>
          <Field
            label="Vendor"
            value={String(draft.vendor)}
            set={(value) => set("vendor", value)}
          />
          <Field
            label="Plan"
            value={String(draft.plan_name)}
            set={(value) => set("plan_name", value)}
          />
          {select(
            "Category",
            "category",
            SUBSCRIPTION_CATEGORIES.map(
              (value) => [value, subscriptionCategoryLabel(value)] as const,
            ),
          )}
          {select(
            "Status",
            "status",
            SUBSCRIPTION_STATUSES.map(
              (value) =>
                [value, value[0].toUpperCase() + value.slice(1)] as const,
            ),
          )}
        </>
      )}
      <Field
        label={kind === "subscription" ? "Amount" : "Net amount"}
        value={String(
          kind === "subscription" ? draft.amount : draft.net_amount,
        )}
        set={(value) =>
          set(kind === "subscription" ? "amount" : "net_amount", value)
        }
        type="number"
      />
      <Field
        label="Currency"
        value={String(draft.currency)}
        set={(value) => set("currency", value.toUpperCase())}
      />
      {kind !== "subscription" && (
        <Field
          label="VAT rate (%)"
          value={String(draft.vat_rate)}
          set={(value) => set("vat_rate", value)}
          type="number"
        />
      )}
      {select(
        "Billing cycle",
        "billing_cycle",
        SUBSCRIPTION_CYCLES.map(
          (value) => [value, billingCycleLabel(value)] as const,
        ),
      )}
      {kind === "income" && (
        <>
          <Field
            label="Start date"
            value={String(draft.start_date)}
            set={(value) => set("start_date", value)}
            type="date"
          />
          <Field
            label="Next billing date"
            value={String(draft.next_billing_date)}
            set={(value) => set("next_billing_date", value)}
            type="date"
          />
        </>
      )}
      {kind === "expense" && (
        <Field
          label="Expense date"
          value={String(draft.expense_date)}
          set={(value) => set("expense_date", value)}
          type="date"
        />
      )}
      {kind === "subscription" && (
        <>
          <Field
            label="Start date"
            value={String(draft.start_date)}
            set={(value) => set("start_date", value)}
            type="date"
          />
          <Field
            label="Next renewal"
            value={String(draft.next_renewal_date)}
            set={(value) => set("next_renewal_date", value)}
            type="date"
          />
        </>
      )}
      {kind === "subscription" && (
        <>
          {select(
            "Allocation",
            "allocation_scope",
            ALLOCATION_SCOPES.map(
              (value) =>
                [
                  value,
                  value === "agency_wide" ? "Agency-wide" : "Client-specific",
                ] as const,
            ),
          )}
          {draft.allocation_scope === "client_specific" && (
            <Select
              label="Client"
              value={String(draft.client_id)}
              set={(value) => set("client_id", value)}
              options={clients.map(
                (client) => [client.id, client.name] as const,
              )}
            />
          )}
        </>
      )}
      {kind !== "subscription" && (
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input
            checked={Boolean(draft.active)}
            onChange={(event) => set("active", event.target.checked)}
            type="checkbox"
            className="h-4 w-4 accent-emerald-300"
          />{" "}
          Active
        </label>
      )}
      <div className="sm:col-span-2">
        <Field
          label="Internal notes"
          value={String(draft.notes)}
          set={(value) => set("notes", value)}
          multiline
        />
      </div>
      {kind === "subscription" && (
        <div className="sm:col-span-2">
          <Field
            label="Reference URL"
            value={String(draft.documentation_url)}
            set={(value) => set("documentation_url", value)}
          />
        </div>
      )}
    </div>
  );
}
function Field({
  label,
  value,
  set,
  type = "text",
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  type?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <label className="block text-xs font-semibold text-white/62">
      {label}
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => set(event.target.value)}
          className={`${inputClass} min-h-24 resize-y`}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => set(event.target.value)}
          type={type}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
    </label>
  );
}
function Select({
  label,
  value,
  set,
  options,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <label className="block text-xs font-semibold text-white/62">
      {label}
      <select
        value={value}
        onChange={(event) => set(event.target.value)}
        className={inputClass}
      >
        {options.map(([id, title]) => (
          <option key={id} value={id} className="bg-[#080c09]">
            {title}
          </option>
        ))}
      </select>
    </label>
  );
}
