import { NextResponse } from 'next/server'
import { isClientBrainV2ArchitectureVersion } from '@/lib/client-brain-v2'
import { clientBrainV2ServerClient } from '@/lib/client-brain-v2-server-core'

export async function GET() {
  const { data, error } = await clientBrainV2ServerClient
    .from('clients')
    .select('id, name, industry, status, brain_architecture_version')
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ success: false, error: 'Unable to load clients.' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    clients: (data ?? []).map(client => ({
      id: client.id,
      name: client.name,
      industry: client.industry,
      status: client.status,
      compatible: isClientBrainV2ArchitectureVersion(client.brain_architecture_version),
    })),
  })
}
