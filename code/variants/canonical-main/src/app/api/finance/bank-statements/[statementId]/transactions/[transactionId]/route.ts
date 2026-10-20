import { NextRequest, NextResponse } from "next/server";
import { confirmBankTransaction } from "@/lib/finance-bank-statements-server";
import { FinanceCostsError } from "@/lib/finance-costs-server";
export const runtime = "nodejs";
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ statementId: string; transactionId: string }> },
) {
  try {
    const [{ transactionId }, body] = await Promise.all([
      context.params,
      request.json(),
    ]);
    return NextResponse.json(await confirmBankTransaction(transactionId, body));
  } catch (error) {
    const known =
      error instanceof FinanceCostsError
        ? error
        : new FinanceCostsError("Transaction update failed.", 500);
    return NextResponse.json(
      { error: known.message },
      { status: known.status },
    );
  }
}
