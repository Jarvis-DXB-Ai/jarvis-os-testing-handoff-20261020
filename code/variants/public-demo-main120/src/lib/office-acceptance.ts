export type OfficeQaCheck = { index: number; pass: boolean | null; evidence: string };
export type OfficeQa = { pass: boolean; issues: string[]; checks: OfficeQaCheck[] };

export function normalizeOfficeCriteria(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 5) throw new Error("Add up to five acceptance checks.");
  const checks = value.map(item => typeof item === "string" ? item.trim() : "");
  if (checks.some(item => !item || item.length > 180) || new Set(checks.map(item => item.toLowerCase())).size !== checks.length)
    throw new Error("Each acceptance check must be unique and between 1 and 180 characters.");
  return checks;
}

export function parseOfficeQa(output: string, criteria: string[]): OfficeQa {
  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(output.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid QA object");
    parsed = value;
  } catch { return { pass: false, issues: ["QA response could not be parsed."], checks: [] }; }
  if (typeof parsed.pass !== "boolean" || !Array.isArray(parsed.issues) || parsed.issues.some(issue => typeof issue !== "string"))
    return { pass: false, issues: ["QA response was malformed."], checks: [] };
  const issues = (parsed.issues as string[]).map(issue => issue.trim()).filter(Boolean).slice(0, 8);
  if (!criteria.length) {
    if (!parsed.pass && !issues.length) issues.push("QA rejected the draft without a specific issue; inspect the saved output.");
    return { pass: parsed.pass && !issues.length, issues, checks: [] };
  }
  if (!Array.isArray(parsed.checks) || parsed.checks.length !== criteria.length)
    return { pass: false, issues: [...issues, "QA did not assess every acceptance check."].slice(0, 8), checks: [] };
  const checks: OfficeQaCheck[] = [];
  for (let index = 0; index < criteria.length; index++) {
    const item = parsed.checks[index];
    if (!item || typeof item !== "object" || item.index !== index + 1 || typeof item.pass !== "boolean"
      || typeof item.evidence !== "string" || !item.evidence.trim() || item.evidence.length > 500)
      return { pass: false, issues: [...issues, `QA evidence for acceptance check ${index + 1} was missing or malformed.`].slice(0, 8), checks: [] };
    checks.push({ index: index + 1, pass: item.pass, evidence: item.evidence.trim() });
  }
  for (const check of checks.filter(check => !check.pass)) {
    if (issues.length >= 8) break;
    issues.push(`Acceptance check ${check.index} did not pass: ${check.evidence}`);
  }
  if (!parsed.pass && !issues.length) issues.push("QA rejected the draft without a specific issue; inspect the saved output.");
  return { pass: parsed.pass && !issues.length && checks.every(check => check.pass), issues, checks };
}
