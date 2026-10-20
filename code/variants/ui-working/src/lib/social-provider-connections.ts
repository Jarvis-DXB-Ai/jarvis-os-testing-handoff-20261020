import type { ConnectedSocialAccount, SocialPlatform } from "@/lib/zernio"

export const DEMOCLIENTB_RESTAURANT_CLIENT_ID = "8d771fc0-2914-57cc-90f1-9ab90f4611fd"

export type SocialProviderPlatform = Extract<SocialPlatform, "instagram" | "facebook"> | "meta_ads"
export type SocialProviderConnectionStatus = "connected" | "needs_attention" | "expired" | "disconnected" | "not_mapped" | "not_connected" | "unsupported"

export type SocialProviderConnection = {
  id: string
  clientId: string
  provider: "zernio"
  providerProfileId: string | null
  providerConnectionId: string | null
  platform: SocialProviderPlatform
  platformAccountId: string | null
  accountName: string | null
  handle: string | null
  status: SocialProviderConnectionStatus
  capabilities: Record<string, unknown>
  providerMetadata: Record<string, unknown>
  lastSyncedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type SocialProviderConnectionsSnapshot = {
  clientId: string
  provider: "zernio"
  connections: SocialProviderConnection[]
  adAccount: {
    status: SocialProviderConnectionStatus
    detail: string
    lastSyncedAt: string | null
  }
}

function normalized(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "")
}

/**
 * Discovery uses exact expected account identities once. The persistent client
 * boundary is the database relationship, never this display-name comparison.
 */
export function democlientbAccountCandidates(accounts: ConnectedSocialAccount[]) {
  const active = accounts.filter(account => account.connectionStatus === "connected")
  const instagram = active.filter(account => account.platform === "instagram" && normalized(account.username) === "democlientbdubai")
  const facebook = active.filter(account => account.platform === "facebook" && normalized(account.username) === "democlientbdubai" && normalized(account.displayName) === "democlientbdubai")
  const metaAds = active.filter(account => account.platform === "metaads" && normalized(account.username) === "democlientbdubai")
  return { instagram, facebook, metaAds }
}

export function validateDemoClientBAccountCandidates(accounts: ConnectedSocialAccount[]) {
  const { instagram, facebook, metaAds } = democlientbAccountCandidates(accounts)
  const errors: string[] = []
  if (instagram.length !== 1) errors.push(`Expected one connected Instagram account @democlientbdubai; found ${instagram.length}.`)
  if (facebook.length !== 1) errors.push(`Expected one connected Facebook page DemoClientC / @democlientbdubai; found ${facebook.length}.`)
  return { instagram: instagram[0] ?? null, facebook: facebook[0] ?? null, metaAds: metaAds.length === 1 ? metaAds[0] : null, metaAdsCount: metaAds.length, errors }
}

export function accountToConnectionInput(account: ConnectedSocialAccount) {
  if (account.platform !== "instagram" && account.platform !== "facebook" && account.platform !== "metaads") {
    throw new Error(`Unsupported provider account platform: ${account.platform}`)
  }
  return {
    providerProfileId: account.profileId ?? null,
    providerConnectionId: account.id || null,
    platform: account.platform === "metaads" ? "meta_ads" as const : account.platform as Extract<SocialPlatform, "instagram" | "facebook">,
    platformAccountId: account.externalAccountId || account.id || null,
    accountName: account.displayName || null,
    handle: account.username ? `@${account.username.replace(/^@/, "")}` : null,
    status: account.connectionStatus === "connected" ? "connected" as const : "disconnected" as const,
    capabilities: account.platform === "metaads"
      ? { adsConnection: true, providerReadOnly: true, adAccountEnumerationAvailable: Boolean(account.providerMetadata?.metaAds?.enumeratedAdAccountIds.length) }
      : { organicPublishing: false, providerReadOnly: true },
    providerMetadata: account.providerMetadata ?? {},
  }
}
