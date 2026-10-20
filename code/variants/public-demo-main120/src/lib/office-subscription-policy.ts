// Office model work uses the owner's CLI subscriptions. There is no paid API fallback.
export function requireCodexSubscription(status: string): void {
  if (!/^Logged in using ChatGPT\s*$/i.test(status.trim())) {
    throw new Error("Office requires Codex signed in with ChatGPT. API-key authentication is disabled.");
  }
}

export function officeMockProviderAllowed(env: Record<string, string | undefined>): boolean {
  return env.JARVIS_ISOLATED_TEST === "1" && env.JARVIS_OFFICE_TEST_PROVIDER_MOCK === "1"
    && env.ANTHROPIC_API_KEY === "office-local-mock-key"
    && /^http:\/\/127\.0\.0\.1:\d+$/.test(env.ANTHROPIC_BASE_URL ?? "");
}
