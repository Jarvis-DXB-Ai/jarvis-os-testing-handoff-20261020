export type ClientWorkspaceProfile = {
  id?: string | null
  name?: string | null
  industry?: string | null
  notes?: string | null
}

export type ClientModuleKey = 'crm'

const CLIENT_MODULES_BY_ID: Record<string, readonly ClientModuleKey[]> = {
  'b29c0cbf-48fa-5e12-b7aa-8848365e66d8': ['crm'],
}

function normalizeClientText(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function profileText(profile: ClientWorkspaceProfile) {
  return [profile.name, profile.industry, profile.notes].filter(Boolean).join(' ').toLowerCase()
}

export function isDemoClientFProfile(profile: ClientWorkspaceProfile) {
  const normalizedName = normalizeClientText(profile.name)
  const text = profileText(profile)

  return normalizedName === 'democlientf'
    || (
      text.includes('luxury residential construction')
      && text.includes('villa renovation')
      && text.includes('design-build')
      && text.includes('non-hospitality')
    )
}

export function enabledClientModules(profile: ClientWorkspaceProfile): readonly ClientModuleKey[] {
  const configured = profile.id ? CLIENT_MODULES_BY_ID[profile.id] : undefined
  if (configured) return configured

  // Name fallback keeps local/dev copies usable when client IDs differ, while
  // the database route still resolves and validates the actual client record.
  return normalizeClientText(profile.name).startsWith('democlientd') ? ['crm'] : []
}

export function isClientModuleEnabled(profile: ClientWorkspaceProfile, module: ClientModuleKey) {
  return enabledClientModules(profile).includes(module)
}
