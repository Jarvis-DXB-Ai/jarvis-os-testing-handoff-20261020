import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { requireCodexSubscription } from "./office-subscription-policy";

const run = promisify(execFile);

export async function codexCliAnswer(model: string, system: string, prompt: string, maxTokens: number) {
  if (process.env.JARVIS_ISOLATED_TEST !== "1" || process.env.JARVIS_OFFICE_CODEX_CLI_ENABLED !== "1") {
    throw new Error("Local Codex execution is disabled.");
  }
  const directory = await mkdtemp(join(tmpdir(), "jarvis-office-codex-"));
  const outputPath = join(directory, "answer.txt");
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "USER", "LOGNAME", "SHELL"].filter(key => process.env[key]).map(key => [key, process.env[key]])) as NodeJS.ProcessEnv;
  try {
    const auth = await run("codex", ["login", "status"], { cwd: directory, env, timeout: 10_000, maxBuffer: 16_000 });
    requireCodexSubscription(`${auth.stdout}${auth.stderr}`);
    const processRun = run("codex", [
      "exec", "--json", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check",
      "--sandbox", "read-only", "--cd", directory, "--model", model, "--output-last-message", outputPath,
      `Follow these role instructions and return only the requested deliverable. Do not use tools or inspect local files. Stay within about ${Math.max(100, Math.min(maxTokens, 1200))} output tokens.\n\n<role_instructions>\n${system}\n</role_instructions>\n\n<task_data>\n${prompt}\n</task_data>`,
    ], { cwd: directory, env, timeout: 120_000, maxBuffer: 1_000_000 });
    // Codex consumes stdin before starting even when a prompt argument is supplied.
    processRun.child.stdin?.end();
    const { stdout } = await processRun;
    const output = (await readFile(outputPath, "utf8")).trim();
    if (!output) throw new Error("Local Codex returned no text.");
    const events = stdout.split("\n").filter(Boolean).flatMap(line => {
      try { return [JSON.parse(line) as { type?: string; usage?: { input_tokens?: number; output_tokens?: number } }]; }
      catch { return []; }
    });
    const complete = events.findLast(event => event.type === "turn.completed");
    if (!complete) throw new Error("Local Codex did not confirm completion.");
    return { output: output.slice(0, 12000), inputTokens: complete.usage?.input_tokens ?? 0,
      outputTokens: complete.usage?.output_tokens ?? 0, requestId: null };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
