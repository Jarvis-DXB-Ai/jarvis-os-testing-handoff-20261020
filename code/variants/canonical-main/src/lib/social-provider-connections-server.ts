import "server-only"

import { createClient } from "@supabase/supabase-js"
import { getAccountHealth, getProviderAccounts, type ZernioAccountHealth } from "@/lib/zernio-server"
import {
  accountToConnectionInput,
  DEMOCLIENTB_RESTAURANT_CLIENT_ID,
  type SocialProviderConnection,
  type SocialProviderConnectionsSnapshot,
  validateDemoClientBAccountCandidates,
} from "@/lib/social-provider-connections"

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Server database credentials are not configured.")
  return createClient(url, key)
}

function rowToConnection(row: Record<string, unknown>): SocialProviderConnection {
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    provider: "zernio",
    providerProfileId: typeof row.provider_profile_id === "string" ? row.provider_profile_id : null,
    providerConnectionId: typeof row.provider_connection_id === "string" ? row.provider_connection_id : null,
    platform: row.platform as SocialProviderConnection["platform"],
    platformAccountId: typeof row.platform_account_id === "string" ? row.platform_account_id : null,
    accountName: typeof row.account_name === "string" ? row.account_name : null,
    handle: typeof row.handle === "string" ? row.handle : null,
    status: row.status as SocialProviderConnection["status"],
    capabilities: typeof row.capabilities === "object" && row.capabilities !== null ? row.capabilities as Record<string, unknown> : {},
    providerMetadata: typeof row.provider_metadata === "object" && row.provider_metadata !== null ? row.provider_metadata as Record<string, unknown> : {},
    lastSyncedAt: typeof row.last_synced_at === "string" ? row.last_synced_at : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  }
}

export async function getSocialProviderConnections(clientId: string): Promise<SocialProviderConnectionsSnapshot> {
  const sb = serviceClient()
  const { data, error } = await sb
    .from("social_provider_connections")
    .select("id, client_id, provider, provider_profile_id, provider_connection_id, platform, platform_account_id, account_name, handle, status, capabilities, provider_metadata, last_synced_at, created_at, updated_at")
    .eq("client_id", clientId)
    .eq("provider", "zernio")
    .order("platform")
  if (error) throw new Error("Unable to load the cached Zernio connection mapping.")
  const connections = (data ?? []).map(row => rowToConnection(row as Record<string, unknown>))
  const lastSyncedAt = connections.map(connection => connection.lastSyncedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null
  const adConnection = connections.find(connection => connection.platform === "meta_ads") ?? null
  return {
    clientId,
    provider: "zernio",
    connections,
    adAccount: {
      status: adConnection?.status ?? "unsupported",
      detail: adConnection
        ? "Connected in Zernio and classified separately from organic Social. Ads account management remains owned by the future Ads module."
        : "No Meta Ads connection has been synchronized yet.",
      lastSyncedAt: adConnection?.lastSyncedAt ?? lastSyncedAt,
    },
  }
}

export async function syncDemoClientBZernioConnections(clientId: string) {
  if (clientId !== DEMOCLIENTB_RESTAURANT_CLIENT_ID) throw new Error("Zernio mapping is not configured for this client.")

  const response = await getProviderAccounts()
  if (!response.ok || response.connectionState !== "connected") {
    throw new Error(response.error || "Zernio could not provide connected accounts.")
  }
  const candidates = validateDemoClientBAccountCandidates(response.data)
  if (candidates.errors.length > 0 || !candidates.instagram || !candidates.facebook) {
    throw new Error(candidates.errors.join(" "))
  }

  const rows = [candidates.instagram, candidates.facebook, candidates.metaAds]
    .filter((account): account is NonNullable<typeof account> => Boolean(account))
    .map(account => accountToConnectionInput(account))
  const sb = serviceClient()
  const accountIds = rows.map(row => row.platformAccountId).filter((value): value is string => Boolean(value))
  const { data: existing, error: existingError } = await sb
    .from("social_provider_connections")
    .select("client_id, platform, platform_account_id")
    .eq("provider", "zernio")
    .in("platform_account_id", accountIds)
  if (existingError) throw new Error("Unable to verify the existing Zernio account mapping.")
  if ((existing ?? []).some(row => row.client_id !== clientId)) {
    throw new Error("A discovered Zernio account is already mapped to another client. No mapping was changed.")
  }

  const now = new Date().toISOString()
  const payload = rows.map(row => ({
    client_id: clientId,
    provider: "zernio",
    provider_profile_id: row.providerProfileId,
    provider_connection_id: row.providerConnectionId,
    platform: row.platform,
    platform_account_id: row.platformAccountId,
    account_name: row.accountName,
    handle: row.handle,
    status: row.status,
    capabilities: row.capabilities,
    provider_metadata: row.providerMetadata,
    last_synced_at: now,
  }))
  const { error: upsertError } = await sb
    .from("social_provider_connections")
    .upsert(payload, { onConflict: "client_id,provider,platform,platform_account_id" })
  if (upsertError) throw new Error("Unable to persist the verified Zernio mapping.")
  return getSocialProviderConnections(clientId)
}

function safeHealthMetadata(health: ZernioAccountHealth, checkedAt: string) {
  return {
    checked_at: checkedAt,
    status: health.status,
    token_valid: health.tokenStatus.valid,
    token_expires_at: health.tokenStatus.expiresAt,
    token_needs_refresh: health.tokenStatus.needsRefresh,
    permissions: health.permissions,
    warnings: health.warnings,
  }
}

function capabilityAvailable(permissions: ZernioAccountHealth["permissions"], group: string) {
  return (permissions[group] ?? []).some(permission => permission.granted === true)
}

/**
 * Verifies one already-mapped account without discovering, remapping or
 * broadening anything. Only sanitized operational health metadata is cached.
 */
export async function verifyMappedZernioAccountHealth(input: {
  clientId: string
  platform: "instagram" | "facebook"
  providerConnectionId: string
}) {
  const sb = serviceClient()
  const { data: row, error } = await sb
    .from("social_provider_connections")
    .select("id, client_id, provider, provider_connection_id, platform, platform_account_id, account_name, handle, status, capabilities, provider_metadata")
    .eq("client_id", input.clientId)
    .eq("provider", "zernio")
    .eq("platform", input.platform)
    .eq("provider_connection_id", input.providerConnectionId)
    .maybeSingle()
  if (error) throw new Error("Unable to load the explicit provider mapping before health verification.")
  if (!row || row.provider_connection_id !== input.providerConnectionId || row.platform !== input.platform) {
    throw new Error("The requested Zernio health check does not match an explicit client/provider/platform mapping.")
  }

  const response = await getAccountHealth(input.providerConnectionId)
  if (!response.ok || response.data.length !== 1) {
    throw new Error(response.error || "Zernio account-health request failed.")
  }
  const health = response.data[0]
  if (health.accountId !== input.providerConnectionId || health.platform !== input.platform) {
    throw new Error("Zernio health response did not match the explicit mapped account and platform.")
  }

  const checkedAt = new Date().toISOString()
  const previousCapabilities = typeof row.capabilities === "object" && row.capabilities !== null ? row.capabilities as Record<string, unknown> : {}
  const previousMetadata = typeof row.provider_metadata === "object" && row.provider_metadata !== null ? row.provider_metadata as Record<string, unknown> : {}
  const healthMetadata = safeHealthMetadata(health, checkedAt)
  const healthStatus = health.status === "healthy" && health.tokenStatus.valid !== false ? "connected" : "needs_attention"
  const { error: updateError } = await sb.from("social_provider_connections").update({
    status: healthStatus,
    capabilities: {
      ...previousCapabilities,
      organicPublishing: capabilityAvailable(health.permissions, "posting"),
      analytics: capabilityAvailable(health.permissions, "analytics"),
      health: healthMetadata,
    },
    provider_metadata: { ...previousMetadata, health: healthMetadata },
    last_synced_at: checkedAt,
  }).eq("id", row.id).eq("client_id", input.clientId).eq("provider_connection_id", input.providerConnectionId)
  if (updateError) throw new Error("Zernio health was read but safe operational metadata could not be cached.")

  return { connection: rowToConnection({ ...row, status: healthStatus, capabilities: { ...previousCapabilities, organicPublishing: capabilityAvailable(health.permissions, "posting"), analytics: capabilityAvailable(health.permissions, "analytics"), health: healthMetadata }, provider_metadata: { ...previousMetadata, health: healthMetadata }, last_synced_at: checkedAt }), health, checkedAt }
}
