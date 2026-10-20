import { NextRequest, NextResponse } from "next/server";
import { importBankStatement } from "@/lib/finance-bank-statements-server";
import { FinanceCostsError } from "@/lib/finance-costs-server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(
      await importBankStatement(await request.formData()),
      { status: 201 },
    );
  } catch (error) {
    const known =
      error instanceof FinanceCostsError
        ? error
        : new FinanceCostsError("Statement import failed.", 500);
    return NextResponse.json(
      { error: known.message },
      { status: known.status },
    );
  }
}
