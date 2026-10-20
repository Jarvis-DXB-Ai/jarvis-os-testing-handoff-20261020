import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { isClientBrainV2ArchitectureVersion } from '@/lib/client-brain-v2'

export const clientBrainV2ServerClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

export class ClientBrainV2HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function requireClientBrainV2(clientId: string) {
  if (!isUuid(clientId)) throw new ClientBrainV2HttpError('Invalid client ID.', 400)

  const { data, error } = await clientBrainV2ServerClient
    .from('clients')
    .select('id, name, industry, status, notes, brain_architecture_version')
    .eq('id', clientId)
    .maybeSingle()

  if (error) throw new ClientBrainV2HttpError('Unable to load the client.', 500)
  if (!data) throw new ClientBrainV2HttpError('Client not found.', 404)
  if (!isClientBrainV2ArchitectureVersion(data.brain_architecture_version)) {
    throw new ClientBrainV2HttpError('Hospitality Client Brain v2 is not enabled for this client.', 404)
  }
  return data
}

export function clientBrainV2ErrorResponse(error: unknown) {
  if (error instanceof ClientBrainV2HttpError) return { message: error.message, status: error.status }
  return { message: 'Unable to complete the Client Brain request.', status: 500 }
}
