import "server-only";

import { createHash, randomUUID } from "crypto";
import {
  clientBrainV2ServerClient as db,
  isUuid,
} from "@/lib/client-brain-v2-server-core";
import {
  FinanceCostsError,
  loadFinanceSnapshot,
} from "@/lib/finance-costs-server";

const BUCKET = "finance-statements";
const MAX_BYTES = 20 * 1024 * 1024;
const allowed = new Set(["text/csv", "application/pdf"]);
type Parsed = {
  date: string;
  postingDate: string | null;
  description: string;
  debit: number;
  credit: number;
  currency: string;
  reference: string | null;
  raw: string;
};
const clean = (value: string) => value.trim().replace(/\s+/g, " ");
const safeName = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "statement";
const dateValue = (value: string) => {
  const raw = value.trim();
  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso)
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dmy = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (!dmy) return null;
  const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
  return `${year}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
};
const amount = (value: string) => {
  const raw = value.replace(/[^0-9,.-]/g, "").replace(/,/g, "");
  const n = Number(raw);
  return Number.isFinite(n) ? Math.abs(n) : null;
};
function columns(line: string) {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      result.push(current.trim());
      current = "";
    } else current += char;
  }
  result.push(current.trim());
  return result;
}
function parseDelimited(text: string, defaultCurrency: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2) return [] as Parsed[];
  const headers = columns(lines[0]).map((value) =>
    value.toLowerCase().replace(/[^a-z]/g, ""),
  );
  const find = (...names: string[]) =>
    headers.findIndex((header) => names.includes(header));
  const dateIndex = find("date", "transactiondate", "valuedate", "postingdate");
  const descIndex = find(
    "description",
    "details",
    "narration",
    "merchant",
    "transactiondescription",
  );
  const debitIndex = find("debit", "withdrawal", "outflow");
  const creditIndex = find("credit", "deposit", "inflow");
  const amountIndex = find("amount", "transactionamount");
  const currencyIndex = find("currency", "curr");
  const referenceIndex = find("reference", "ref", "transactionid");
  if (
    dateIndex < 0 ||
    descIndex < 0 ||
    (debitIndex < 0 && creditIndex < 0 && amountIndex < 0)
  )
    throw new FinanceCostsError(
      "CSV needs a date, description, and debit/credit or amount column.",
    );
  return lines.slice(1).flatMap((raw) => {
    const row = columns(raw);
    const date = dateValue(row[dateIndex] ?? "");
    const description = clean(row[descIndex] ?? "");
    if (!date || !description) return [];
    const rawAmount = amountIndex >= 0 ? amount(row[amountIndex] ?? "") : null;
    const debit =
      debitIndex >= 0
        ? (amount(row[debitIndex] ?? "") ?? 0)
        : rawAmount !== null && String(row[amountIndex]).includes("-")
          ? rawAmount
          : 0;
    const credit =
      creditIndex >= 0
        ? (amount(row[creditIndex] ?? "") ?? 0)
        : rawAmount !== null && debit === 0
          ? rawAmount
          : 0;
    if (debit > 0 === credit > 0) return [];
    return [
      {
        date,
        postingDate: null,
        description,
        debit,
        credit,
        currency: (
          row[currencyIndex] ||
          defaultCurrency ||
          "AED"
        ).toUpperCase(),
        reference:
          referenceIndex >= 0 ? clean(row[referenceIndex] ?? "") || null : null,
        raw,
      },
    ];
  });
}
async function parsePdf(buffer: Buffer, currency: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const parser = require("pdf-parse");
    const result = await (parser.default ?? parser)(buffer);
    const lines = String(result.text ?? "")
      .split(/\r?\n/)
      .map(clean)
      .filter(Boolean);
    const parsed: Parsed[] = [];
    for (const line of lines) {
      const match = line.match(
        /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\s+(.+?)\s+(-?[\d,]+\.\d{2})$/,
      );
      if (!match) continue;
      const date = dateValue(match[1]);
      const signed = Number(match[3].replace(/,/g, ""));
      if (!date || !Number.isFinite(signed) || !match[2]) continue;
      parsed.push({
        date,
        postingDate: null,
        description: match[2],
        debit: signed < 0 ? Math.abs(signed) : 0,
        credit: signed > 0 ? signed : 0,
        currency,
        reference: null,
        raw: line,
      });
    }
    return parsed;
  } catch {
    throw new FinanceCostsError(
      "The PDF could not be read as a text statement. Use the bank CSV export for reliable import.",
      422,
    );
  }
}
function merchant(description: string) {
  return (
    clean(
      description
        .toUpperCase()
        .replace(
          /\b(OPENAI|CHATGPT|ZERNIO|SUPABASE|HIGGSFIELD|MARVIN)\b.*/,
          "$1",
        ),
    ) || null
  );
}
function proposed(description: string) {
  const upper = description.toUpperCase();
  if (/OPENAI|CHATGPT/.test(upper))
    return {
      scope: "business",
      category: "software",
      confidence: "high",
      reason: "Known ChatGPT/OpenAI merchant pattern.",
    };
  if (/ZERNIO/.test(upper))
    return {
      scope: "business",
      category: "software",
      confidence: "high",
      reason: "Known Zernio merchant pattern.",
    };
  if (/SUPABASE/.test(upper))
    return {
      scope: "business",
      category: "infrastructure",
      confidence: "high",
      reason: "Known Supabase merchant pattern.",
    };
  if (/HIGGSFIELD/.test(upper))
    return {
      scope: "business",
      category: "software",
      confidence: "high",
      reason: "Known Higgsfield merchant pattern.",
    };
  if (/MARVIN/.test(upper))
    return {
      scope: "business",
      category: "contractors",
      confidence: "medium",
      reason: "Known contractor name pattern; confirmation required.",
    };
  if (/TRANSFER|TRANSFERENCIA|INTERNAL/.test(upper))
    return {
      scope: "transfer",
      category: "transfer",
      confidence: "medium",
      reason: "Transfer keyword; destination requires confirmation.",
    };
  return {
    scope: "unresolved",
    category: null,
    confidence: "low",
    reason: "No deterministic vendor or transfer rule matched.",
  };
}
export async function importBankStatement(form: FormData) {
  const file = form.get("file");
  const accountLabel = clean(String(form.get("account_label") ?? ""));
  const currency = clean(String(form.get("currency") ?? "AED")).toUpperCase();
  const clientId = clean(String(form.get("client_id") ?? "")) || null;
  if (
    !(file instanceof File) ||
    !allowed.has(file.type) ||
    file.size <= 0 ||
    file.size > MAX_BYTES
  )
    throw new FinanceCostsError(
      "Upload a CSV or text-based PDF statement under 20 MB.",
    );
  if (!accountLabel) throw new FinanceCostsError("Account label is required.");
  if (clientId && !isUuid(clientId))
    throw new FinanceCostsError("Client scope is invalid.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const parser = file.type === "text/csv" ? "csv-v1" : "pdf-text-v1";
  const transactions =
    file.type === "text/csv"
      ? parseDelimited(buffer.toString("utf8"), currency)
      : await parsePdf(buffer, currency);
  if (!transactions.length)
    throw new FinanceCostsError(
      "No reliable transactions were found. Preserve the source and use a structured CSV export.",
    );
  const statementId = randomUUID();
  const path = `${clientId ?? "mc-studios"}/bank-statements/${statementId}/${safeName(file.name)}`;
  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (uploadError)
    throw new FinanceCostsError(
      "Statement file could not be securely stored.",
      500,
    );
  const { error: statementError } = await db
    .from("jarvis_finance_bank_statements")
    .insert({
      id: statementId,
      client_id: clientId,
      account_label: accountLabel,
      original_filename: file.name.slice(0, 255),
      storage_path: path,
      mime_type: file.type,
      byte_size: file.size,
      currency,
      parser,
      status: "review",
      parser_diagnostics: { extracted: transactions.length },
    });
  if (statementError) {
    await db.storage.from(BUCKET).remove([path]);
    throw new FinanceCostsError("Statement metadata could not be saved.", 500);
  }
  const { data: openInvoices, error: openInvoicesError } = await db
    .from("jarvis_finance_invoices")
    .select("id,amount,paid_amount,currency,counterparty_name,invoice_number,sent_at,due_at")
    .not("sent_at", "is", null);
  if (openInvoicesError)
    throw new FinanceCostsError("Invoice candidates could not be loaded.", 500);
  const { data: vendorRules, error: vendorRulesError } = await db
    .from("jarvis_finance_vendor_rules")
    .select("normalized_pattern,category,scope,confidence")
    .order("confirmed_at", { ascending: false });
  if (vendorRulesError)
    throw new FinanceCostsError("Vendor rules could not be loaded.", 500);
  const rows = transactions.map((item) => {
    const fingerprint = createHash("sha256")
      .update(
        [
          accountLabel,
          item.date,
          item.debit || item.credit,
          item.currency,
          item.reference ?? "",
          item.description,
        ]
          .join("|")
          .toLowerCase(),
      )
      .digest("hex");
    const match = proposed(item.description);
    const rule = (vendorRules ?? []).find((candidate) => {
      const pattern = String(candidate.normalized_pattern ?? "").trim().toUpperCase();
      // Rules are learned only from a concrete merchant token and never from
      // a one- or two-character substring.
      return pattern.length >= 3 && new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`).test(item.description.toUpperCase());
    });
    const ruleMatch = rule
      ? {
          scope: String(rule.scope),
          category: typeof rule.category === "string" ? rule.category : null,
          confidence: String(rule.confidence),
          reason: `Confirmed vendor rule for ${rule.normalized_pattern}.`,
        }
      : null;
    const haystack = `${item.description} ${item.reference ?? ""}`.toUpperCase();
    const invoiceCandidates = (openInvoices ?? []).filter((invoice) => {
      const outstanding = Number(invoice.amount) - Number(invoice.paid_amount ?? 0);
      return (
        item.credit > 0 &&
        invoice.currency === item.currency &&
        outstanding > 0 &&
        Math.abs(outstanding - item.credit) < 0.000001
      );
    });
    const referenceCandidate = invoiceCandidates.find(
      (invoice) =>
        invoice.invoice_number &&
        haystack.includes(String(invoice.invoice_number).toUpperCase()),
    );
    const invoiceCandidate = referenceCandidate ??
      (invoiceCandidates.length === 1 ? invoiceCandidates[0] : null);
    const invoiceMatch = invoiceCandidate
      ? {
          scope: "business",
          category: "client_payment",
          confidence: referenceCandidate ? "high" : "medium",
          reason: referenceCandidate
            ? `Invoice reference ${referenceCandidate.invoice_number} and outstanding amount match.`
            : `Outstanding invoice amount and currency match for ${invoiceCandidate.counterparty_name}.`,
          matched_record_type: "invoice",
          matched_record_id: invoiceCandidate.id,
        }
      : null;
    const result = invoiceMatch ?? ruleMatch ?? match;
    return {
      statement_id: statementId,
      transaction_date: item.date,
      posting_date: item.postingDate,
      description: item.description,
      merchant: merchant(item.description),
      debit: item.debit,
      credit: item.credit,
      signed_amount: item.credit - item.debit,
      currency: item.currency,
      reference: item.reference,
      account_label: accountLabel,
      identity_fingerprint: fingerprint,
      raw_source: item.raw,
      scope: result.scope,
      category: result.category,
      classification_status:
        result.confidence === "high" || invoiceMatch ? "suggested" : "needs_review",
      confidence: result.confidence,
      classification_source: "deterministic_rule",
      classification_reason: result.reason,
      matched_record_type: invoiceMatch?.matched_record_type ?? null,
      matched_record_id: invoiceMatch?.matched_record_id ?? null,
    };
  });
  const { error: transactionError } = await db
    .from("jarvis_finance_bank_transactions")
    .upsert(rows, {
      onConflict: "identity_fingerprint",
      ignoreDuplicates: true,
    });
  if (transactionError)
    throw new FinanceCostsError("Transactions could not be normalized.", 500);
  await db.from("jarvis_finance_activity").insert({
    record_type: "bank_statement",
    record_id: statementId,
    action: "imported",
    detail: { parser, extracted: rows.length },
  });
  return loadFinanceSnapshot();
}
export async function confirmBankTransaction(
  id: string,
  input: Record<string, unknown>,
) {
  if (!isUuid(id)) throw new FinanceCostsError("Bank transaction is invalid.");
  const scope = input.scope;
  if (!["business", "personal", "transfer", "excluded"].includes(String(scope)))
    throw new FinanceCostsError(
      "Choose business, personal, transfer or excluded.",
    );
  const category = clean(String(input.category ?? "")) || null;
  const createRule = input.create_rule === true;
  const { data: transaction, error } = await db
    .from("jarvis_finance_bank_transactions")
    .select("id,statement_id,merchant,description,transaction_date,signed_amount,currency,scope,matched_record_id")
    .eq("id", id)
    .maybeSingle();
  if (error || !transaction)
    throw new FinanceCostsError("Bank transaction was not found.", 404);
  const rawAllocations = Array.isArray(input.allocations) ? input.allocations : [];
  const allocations = rawAllocations.map((raw) => {
    const item = raw as Record<string, unknown>;
    return {
      targetType: String(item.target_type ?? ""),
      targetId: typeof item.target_id === "string" ? item.target_id : null,
      amount: Number(item.amount),
      create: item.create === true,
    };
  });
  const total = allocations.reduce((sum, item) => sum + item.amount, 0);
  const bankAmount = Math.abs(Number(transaction.signed_amount));
  if (
    allocations.length &&
    (!Number.isFinite(total) || total < 0.000001 || total - bankAmount > 0.000001)
  )
    throw new FinanceCostsError(
      "Allocation total cannot exceed the bank transaction amount.",
    );
  const { data: existing, error: allocationReadError } = await db
    .from("jarvis_finance_bank_allocations")
    .select("id")
    .eq("bank_transaction_id", id);
  if (allocationReadError)
    throw new FinanceCostsError("Reconciliation state could not be read.", 500);
  if ((existing ?? []).length)
    throw new FinanceCostsError(
      "This bank transaction is already reconciled. It cannot be posted twice.",
      409,
    );

  // Validate every target before mutating any canonical record. A suggestion is
  // never promoted here: this path only runs after an explicit user decision.
  const seenTargets = new Set<string>();
  const invoices = new Map<string, { amount: number; paid: number }>();
  const expenseExpected = new Map<string, { amount: number; currency: string }>();
  for (const item of allocations) {
    if (
      !["invoice", "expense", "owner_draw", "personal_expense", "transfer"].includes(item.targetType) ||
      !Number.isFinite(item.amount) ||
      item.amount <= 0
    )
      throw new FinanceCostsError("A reconciliation allocation is invalid.");
    const key = `${item.targetType}:${item.targetId ?? "new"}`;
    if (seenTargets.has(key))
      throw new FinanceCostsError("A target can only be allocated once per transaction.");
    seenTargets.add(key);
    if (item.targetType === "invoice") {
      if (Number(transaction.signed_amount) <= 0 || !item.targetId || !isUuid(item.targetId))
        throw new FinanceCostsError("Invoice allocations require an incoming transaction and invoice.");
      const { data: invoice } = await db
        .from("jarvis_finance_invoices")
        .select("id,amount,paid_amount,currency")
        .eq("id", item.targetId)
        .maybeSingle();
      if (!invoice || invoice.currency !== transaction.currency)
        throw new FinanceCostsError("Invoice currency or target is invalid.");
      const current = invoices.get(item.targetId) ?? {
        amount: Number(invoice.amount),
        paid: Number(invoice.paid_amount ?? 0),
      };
      current.paid += item.amount;
      if (current.paid - current.amount > 0.000001)
        throw new FinanceCostsError("Invoice allocation exceeds the outstanding invoice amount.");
      invoices.set(item.targetId, current);
    }
    if (item.targetType === "expense") {
      if (Number(transaction.signed_amount) >= 0)
        throw new FinanceCostsError("Expense allocations require an outgoing transaction.");
      if (!item.targetId && !item.create)
        throw new FinanceCostsError("Choose an expense or create one from this transaction.");
      if (item.targetId && !isUuid(item.targetId))
        throw new FinanceCostsError("Expense target is invalid.");
      if (item.targetId) {
        const { data: expense } = await db
          .from("jarvis_finance_expenses")
          .select("id,net_amount,currency")
          .eq("id", item.targetId)
          .maybeSingle();
        if (!expense) throw new FinanceCostsError("Expense target is invalid.");
        expenseExpected.set(item.targetId, {
          amount: Number(expense.net_amount),
          currency: String(expense.currency),
        });
      }
    }
    if (item.targetType === "owner_draw" && Number(transaction.signed_amount) >= 0)
      throw new FinanceCostsError("Owner draws require an outgoing bank transaction.");
    if (item.targetType === "personal_expense" && Number(transaction.signed_amount) >= 0)
      throw new FinanceCostsError("Personal expenses require an outgoing bank transaction.");
  }

  const resolved = [] as Array<{ targetType: string; targetId: string | null; amount: number }>;
  for (const item of allocations) {
    let targetId = item.targetId;
    if (item.targetType === "invoice" && targetId) {
      const value = invoices.get(targetId)!;
      const { error: invoiceError } = await db
        .from("jarvis_finance_invoices")
        .update({ paid_amount: value.paid, paid_at: transaction.transaction_date })
        .eq("id", targetId);
      if (invoiceError) throw new FinanceCostsError("Invoice could not be reconciled.", 500);
    }
    if (item.targetType === "expense") {
      if (!targetId) {
        const expenseCategory = ["operating", "contractors", "software", "office", "advertising", "equipment", "professional_services", "travel", "other"].includes(category ?? "") ? category : "other";
        const { data: expense, error: createExpenseError } = await db
          .from("jarvis_finance_expenses")
          .insert({
            vendor: transaction.merchant ?? transaction.description.slice(0, 160),
            description: transaction.description.slice(0, 300),
            category: expenseCategory,
            net_amount: item.amount,
            currency: transaction.currency,
            vat_rate: 0,
            vat_amount: 0,
            gross_amount: item.amount,
            billing_cycle: "one_off",
            expense_date: transaction.transaction_date,
            active: true,
            payment_status: "paid",
            payment_date: transaction.transaction_date,
            source_provenance: "Created from confirmed bank transaction",
            source_reference: `Bank reconciliation ${id}`,
          })
          .select("id")
          .single();
        if (createExpenseError || !expense)
          throw new FinanceCostsError("Expense could not be created from this transaction.", 500);
        targetId = expense.id;
      } else {
        const { error: expenseError } = await db
          .from("jarvis_finance_expenses")
          .update({ payment_status: "paid", payment_date: transaction.transaction_date, source_reference: `Bank reconciliation ${id}` })
          .eq("id", targetId);
        if (expenseError) throw new FinanceCostsError("Expense could not be reconciled.", 500);
      }
    }
    if (item.targetType === "owner_draw" && !targetId) {
      const { data: draw, error: drawError } = await db
        .from("jarvis_finance_owner_draws")
        .insert({ amount: item.amount, currency: transaction.currency, status: "paid", business_period_start: `${transaction.transaction_date.slice(0, 7)}-01`, paid_at: transaction.transaction_date, notes: `Confirmed from bank transaction ${id}` })
        .select("id")
        .single();
      if (drawError || !draw) throw new FinanceCostsError("Owner draw could not be created.", 500);
      targetId = draw.id;
      const { error: personalIncomeError } = await db
        .from("jarvis_personal_income_events")
        .insert({ owner_draw_id: draw.id, amount: item.amount, currency: transaction.currency, received_at: transaction.transaction_date, source_reference: `Bank reconciliation ${id}` });
      if (personalIncomeError) throw new FinanceCostsError("Linked personal income could not be created.", 500);
    }
    if (item.targetType === "personal_expense" && !targetId) {
      const { data: personal, error: personalError } = await db
        .from("jarvis_personal_expenses")
        .insert({ name: transaction.description.slice(0, 160), category: "other", amount: item.amount, currency: transaction.currency, recurrence: "one_off", expense_date: transaction.transaction_date, active: true, notes: `Confirmed from business-bank evidence ${id}` })
        .select("id")
        .single();
      if (personalError || !personal)
        throw new FinanceCostsError("Personal expense could not be created.", 500);
      targetId = personal.id;
    }
    const expected = targetId ? expenseExpected.get(targetId) : undefined;
    const variance =
      item.targetType === "expense" &&
      expected &&
      expected.currency === transaction.currency
        ? Math.round((item.amount - expected.amount) * 100) / 100
        : null;
    const { error: allocationError } = await db
      .from("jarvis_finance_bank_allocations")
      .insert({ bank_transaction_id: id, target_type: item.targetType, target_id: targetId, allocated_amount: item.amount, actual_native_amount: item.amount, variance_amount: variance, currency: transaction.currency, provenance: { statement_transaction_id: id, bank_date: transaction.transaction_date, bank_amount: transaction.signed_amount, expected_expense_amount: expected?.amount ?? null, expected_expense_currency: expected?.currency ?? null } });
    if (allocationError)
      throw new FinanceCostsError("Reconciliation allocation could not be saved.", 500);
    resolved.push({ targetType: item.targetType, targetId, amount: item.amount });
  }
  const update = {
    scope,
    category,
    classification_status: scope === "excluded" ? "excluded" : allocations.length ? "reconciled" : "confirmed",
    confidence: "high",
    classification_source: "user_confirmed",
    confirmed_at: new Date().toISOString(),
    notes: clean(String(input.notes ?? "")) || null,
    matched_record_type: resolved.length === 1 ? resolved[0].targetType : null,
    matched_record_id: resolved.length === 1 ? resolved[0].targetId : null,
  };
  const { error: updateError } = await db
    .from("jarvis_finance_bank_transactions")
    .update(update)
    .eq("id", id);
  if (updateError)
    throw new FinanceCostsError(
      "Bank transaction could not be confirmed.",
      500,
    );
  if (createRule && transaction.merchant && transaction.merchant.length >= 3)
    await db.from("jarvis_finance_vendor_rules").upsert(
      {
        normalized_pattern: transaction.merchant,
        category,
        scope,
        confidence: "high",
        source: "user_confirmed",
      },
      { onConflict: "normalized_pattern,scope,category" },
    );
  const { data: statementRows } = await db
    .from("jarvis_finance_bank_transactions")
    .select("classification_status,scope")
    .eq("statement_id", transaction.statement_id);
  const statementResolved = (statementRows ?? []).every(
    (row) =>
      row.scope !== "unresolved" &&
      !["needs_review", "suggested"].includes(row.classification_status),
  );
  await db
    .from("jarvis_finance_bank_statements")
    .update({ status: statementResolved ? "reconciled" : "review" })
    .eq("id", transaction.statement_id);
  await db.from("jarvis_finance_activity").insert({
    record_type: "bank_transaction",
    record_id: id,
    action: "confirmed",
    detail: { scope, category, create_rule: createRule, allocations: resolved },
  });
  return loadFinanceSnapshot();
}
