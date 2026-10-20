import 'server-only'

import { NextRequest } from 'next/server'
import { ClientBrainV2HttpError, isUuid } from '@/lib/client-brain-v2-server-core'

/**
 * Jarvis is currently an internal operating system. This is deliberately not
 * a substitute for end-user authentication or tenant authorization; it keeps
 * state-changing browser requests on the same application origin while the
 * server retains the service-role credential.
 */
export function requireInternalJarvisMutation(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin || origin !== request.nextUrl.origin) throw new ClientBrainV2HttpError('Internal Jarvis request required.', 403)
}

export async function requireExistingClient(clientId: string) {
  if (!isUuid(clientId)) throw new ClientBrainV2HttpError('Invalid client ID.', 400)
  const { clientBrainV2ServerClient } = await import('@/lib/client-brain-v2-server-core')
  const { data, error } = await clientBrainV2ServerClient.from('clients').select('id,name,industry,status').eq('id', clientId).maybeSingle()
  if (error) throw new ClientBrainV2HttpError('Unable to load client.', 500)
  if (!data) throw new ClientBrainV2HttpError('Client not found.', 404)
  return data
}
