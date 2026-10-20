import "server-only"

import { createClient } from "@supabase/supabase-js"
import { decryptCredentialSecret, encryptCredentialSecret } from "@/lib/client-credential-vault"

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const statuses = new Set(["active", "needs_review", "archived"])
const text = (value: unknown) => typeof value === "string" ? value.trim() : ""
const nullable = (value: unknown) => text(value) || null

export type SecureLoginListItem = {
  id: string; serviceName: string; customServiceName: string | null; loginUrl: string | null; username: string | null; email: string | null; hasSecret: boolean; accountId: string | null; twoFactorEnabled: boolean; recoveryNote: string | null; ownerName: string | null; notes: string | null; lastVerifiedAt: string | null; status: "active" | "needs_review" | "archived"; createdAt: string; updatedAt: string
}

async function requireClient(clientId: string) {
  const { data, error } = await db.from("clients").select("id").eq("id", clientId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error("Client not found.")
}

function map(row: Record<string, unknown>): SecureLoginListItem {
  const status = text(row.status)
  return { id: text(row.id), serviceName: text(row.service_name), customServiceName: nullable(row.custom_service_name), loginUrl: nullable(row.login_url), username: nullable(row.username), email: nullable(row.email), hasSecret: Boolean(row.secret_ciphertext), accountId: nullable(row.account_id), twoFactorEnabled: Boolean(row.two_factor_enabled), recoveryNote: nullable(row.recovery_note), ownerName: nullable(row.owner_name), notes: nullable(row.notes), lastVerifiedAt: nullable(row.last_verified_at), status: statuses.has(status) ? status as SecureLoginListItem["status"] : "active", createdAt: text(row.created_at), updatedAt: text(row.updated_at) }
}

async function audit(clientId: string, credentialId: string | null, eventType: "created" | "updated" | "revealed" | "copied" | "archived" | "deleted" | "verified", metadata: Record<string, unknown> = {}) {
  const safeMetadata = credentialId ? { ...metadata, credential_id: credentialId } : metadata
  const { error } = await db.from("client_secure_credential_audit_events").insert({ client_id: clientId, credential_id: credentialId, event_type: eventType, metadata: safeMetadata })
  if (error) throw new Error(error.message)
}

export async function listSecureLogins(clientId: string) {
  await requireClient(clientId)
  const { data, error } = await db.from("client_secure_credentials").select("id, service_name, custom_service_name, login_url, username, email, secret_ciphertext, account_id, two_factor_enabled, recovery_note, owner_name, notes, last_verified_at, status, created_at, updated_at").eq("client_id", clientId).order("updated_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(row => map(row as Record<string, unknown>))
}

function values(input: Record<string, unknown>, includeSecret = true) {
  const serviceName = text(input.serviceName)
  if (!serviceName) throw new Error("Service name is required.")
  const result: Record<string, unknown> = { service_name: serviceName, custom_service_name: nullable(input.customServiceName), login_url: nullable(input.loginUrl), username: nullable(input.username), email: nullable(input.email), account_id: nullable(input.accountId), two_factor_enabled: Boolean(input.twoFactorEnabled), recovery_note: nullable(input.recoveryNote), owner_name: nullable(input.ownerName), notes: nullable(input.notes), last_verified_at: nullable(input.lastVerifiedAt), status: statuses.has(text(input.status)) ? text(input.status) : "active" }
  if (includeSecret && typeof input.secret === "string" && input.secret.length > 0) result.secret_ciphertext = encryptCredentialSecret(input.secret)
  return result
}

export async function createSecureLogin(clientId: string, input: Record<string, unknown>) {
  await requireClient(clientId)
  const { data, error } = await db.from("client_secure_credentials").insert({ client_id: clientId, ...values(input) }).select("id").single()
  if (error) throw new Error(error.message)
  await audit(clientId, data.id, "created")
  return data.id as string
}

export async function updateSecureLogin(clientId: string, credentialId: string, input: Record<string, unknown>) {
  await requireClient(clientId)
  const { error } = await db.from("client_secure_credentials").update(values(input)).eq("id", credentialId).eq("client_id", clientId)
  if (error) throw new Error(error.message)
  await audit(clientId, credentialId, text(input.status) === "archived" ? "archived" : text(input.lastVerifiedAt) ? "verified" : "updated")
}

export async function revealSecureLoginSecret(clientId: string, credentialId: string, eventType: "revealed" | "copied") {
  await requireClient(clientId)
  const { data, error } = await db.from("client_secure_credentials").select("secret_ciphertext").eq("id", credentialId).eq("client_id", clientId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data?.secret_ciphertext) throw new Error("No stored secret for this login.")
  const secret = decryptCredentialSecret(data.secret_ciphertext)
  await audit(clientId, credentialId, eventType)
  return secret
}

export async function archiveSecureLogin(clientId: string, credentialId: string) {
  const { error } = await db.from("client_secure_credentials").update({ status: "archived", archived_at: new Date().toISOString() }).eq("id", credentialId).eq("client_id", clientId)
  if (error) throw new Error(error.message)
  await audit(clientId, credentialId, "archived")
}

export async function deleteSecureLogin(clientId: string, credentialId: string) {
  await audit(clientId, credentialId, "deleted", { deleted_credential_id: credentialId })
  const { error } = await db.from("client_secure_credentials").delete().eq("id", credentialId).eq("client_id", clientId)
  if (error) throw new Error(error.message)
}
