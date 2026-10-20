import type { SocialPlatform } from "@/lib/zernio"

export type SocialClientScope = {
  clientId?: string | null
  clientName?: string | null
}

export type SocialClientFallbackAccount = {
  id: string
  platform: SocialPlatform
  username: string
  displayName: string
}

type SocialClientConfig = {
  key: string
  clientIds: string[]
  nameTokens: string[]
  accountTokens: string[]
  defaultCaptionFooter?: string | null
  fallbackAccounts: SocialClientFallbackAccount[]
}

export const DEMOCLIENTD_SOCIAL_CLIENT_ID = "b29c0cbf-48fa-5e12-b7aa-8848365e66d8"
export const DEMOCLIENTB_RESTAURANT_SOCIAL_CLIENT_ID = "8d771fc0-2914-57cc-90f1-9ab90f4611fd"

const DEMOCLIENTD_CAPTION_FOOTER = "Reservations: +00000000000\n📍 Al Fattan Currency House, DIFC\n\n#DemoClientDDubai #DIFCDining #ThirdCultureCuisine"

const SOCIAL_CLIENT_CONFIGS: SocialClientConfig[] = [
  {
    key: "democlientd",
    clientIds: [DEMOCLIENTD_SOCIAL_CLIENT_ID],
    nameTokens: ["democlientd"],
    accountTokens: ["democlientd", "democlientddubai", "democlientd restaurant"],
    defaultCaptionFooter: DEMOCLIENTD_CAPTION_FOOTER,
    fallbackAccounts: [
      { id: "local-democlientd-instagram", platform: "instagram", username: "democlientddubai", displayName: "DemoClientD" },
      { id: "local-democlientd-facebook", platform: "facebook", username: "DemoClientD Restaurant & Bar", displayName: "DemoClientD Restaurant & Bar" },
    ],
  },
  {
    key: "democlientb",
    // Provider identities are mapped to one explicit client. A brand or handle
    // similarity must never grant a second DemoClientB tenant the same accounts.
    clientIds: [DEMOCLIENTB_RESTAURANT_SOCIAL_CLIENT_ID],
    nameTokens: ["democlientb", "luna rossa"],
    accountTokens: ["democlientb", "democlientbdubai", "luna rossa"],
    defaultCaptionFooter: null,
    fallbackAccounts: [
      { id: "local-democlientb-instagram", platform: "instagram", username: "democlientbdubai", displayName: "DemoClientB" },
      { id: "local-democlientb-facebook", platform: "facebook", username: "DemoClientC", displayName: "DemoClientC" },
    ],
  },
]

export function normalizeSocialClientText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function compactSocialClientText(value: string) {
  return normalizeSocialClientText(value).replace(/\s+/g, "")
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function clientScopeHasValue(scope: SocialClientScope) {
  return Boolean(scope.clientId || scope.clientName)
}

export function socialClientConfigFor(scope: SocialClientScope) {
  const clientId = stringValue(scope.clientId)
  if (clientId) {
    const config = SOCIAL_CLIENT_CONFIGS.find(item => item.clientIds.includes(clientId))
    // A caller with a concrete tenant ID must never broaden into a brand-name
    // match. Name matching is only a legacy fallback when no client ID exists.
    return config ?? null
  }

  const name = normalizeSocialClientText(stringValue(scope.clientName))
  const compactName = compactSocialClientText(stringValue(scope.clientName))
  if (!name && !compactName) return null

  return SOCIAL_CLIENT_CONFIGS.find(config => config.nameTokens.some(token => {
    const normalizedToken = normalizeSocialClientText(token)
    const compactToken = compactSocialClientText(token)
    return Boolean(normalizedToken && name.includes(normalizedToken)) || Boolean(compactToken && compactName.includes(compactToken))
  })) ?? null
}

export function socialCaptionWithClientFooter(caption: string, scope: SocialClientScope) {
  const footer = socialClientConfigFor(scope)?.defaultCaptionFooter?.trim()
  if (!footer) return caption
  const firstFooterLine = footer.split("\n").find(Boolean)
  if (firstFooterLine && caption.includes(firstFooterLine)) return caption
  if (footer.includes("#DemoClientDDubai") && caption.includes("#DemoClientDDubai")) return caption
  return caption.trim() ? `${caption.trim()}\n\n${footer}` : footer
}

export function socialFallbackAccountsForClient(scope: SocialClientScope): SocialClientFallbackAccount[] {
  const config = socialClientConfigFor(scope)
  if (config) return config.fallbackAccounts

  const fallbackName = scope.clientName?.trim() || "Connected account"
  const normalizedName = normalizeSocialClientText(fallbackName)
  return [{
    id: `local-${normalizedName || scope.clientId || "client"}-instagram`,
    platform: "instagram",
    username: compactSocialClientText(fallbackName) || "connected",
    displayName: fallbackName,
  }]
}

export function socialAccountMatchesClient(account: Record<string, unknown>, scope: SocialClientScope) {
  if (!clientScopeHasValue(scope)) return true

  const accountClientId = stringValue(account.clientId)
    || stringValue(account.client_id)
    || stringValue(account.clientID)
    || stringValue(account.jarvisClientId)
  const config = socialClientConfigFor(scope)

  // Provider accounts without an explicit provider-side client ID are visible
  // only to a client with an explicit registered configuration. Do not fall
  // through to fuzzy display-name matching for another tenant.
  if (scope.clientId && !config) return false

  if (accountClientId && accountClientId !== "zernio") {
    // An explicit provider client ID is authoritative. Brand-level configuration
    // may serve legacy tenants too, but it must never broaden tenant visibility.
    return accountClientId === scope.clientId
  }

  const searchableRaw = [
    account.clientName,
    account.client_name,
    account.brandName,
    account.brand_name,
    account.businessName,
    account.business_name,
    account.displayName,
    account.display_name,
    account.name,
    account.pageName,
    account.accountName,
    account.username,
    account.handle,
  ].map(value => stringValue(value)).join(" ")
  const searchable = normalizeSocialClientText(searchableRaw)
  const compactSearchable = compactSocialClientText(searchableRaw)

  if (config) {
    return config.accountTokens.some(token => {
      const normalizedToken = normalizeSocialClientText(token)
      const compactToken = compactSocialClientText(token)
      return Boolean(normalizedToken && searchable.includes(normalizedToken)) || Boolean(compactToken && compactSearchable.includes(compactToken))
    })
  }

  const clientText = normalizeSocialClientText(scope.clientName ?? "")
  const genericTokens = new Set(["dubai", "dxb", "uae", "restaurant", "restaurants", "bar", "cafe", "client", "brand", "the", "and"])
  const tokens = clientText.split(" ").filter(token => token.length > 2 && !genericTokens.has(token))
  return tokens.some(token => searchable.includes(token))
}

export function socialClientScopeFromSearchParams(searchParams: URLSearchParams): SocialClientScope {
  return {
    clientId: searchParams.get("client_id") || searchParams.get("clientId"),
    clientName: searchParams.get("client_name") || searchParams.get("clientName"),
  }
}
