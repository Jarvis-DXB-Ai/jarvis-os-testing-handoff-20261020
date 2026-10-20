'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isClientBrainV2ArchitectureVersion } from '@/lib/client-brain-v2'

const ClientBrainV2 = dynamic(() => import('./components/client-brain-v2'), { ssr: false })
const LegacyClientBrain = dynamic(() => import('./legacy-client-brain'), { ssr: false })

type ClientBrainRouteClient = {
  id: string
  name: string
  brain_architecture_version: string | null
}

function BrainRouteLoading({ message = 'Loading Client Brain…' }: { message?: string }) {
  return (
    <div className="brain-dark flex min-h-[34vh] items-center justify-center text-sm text-white/45">{message}</div>
  )
}

export default function ClientBrainPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const clientId = params.id as string
  const [client, setClient] = useState<ClientBrainRouteClient | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!clientId) return
    let active = true
    async function loadClient() {
      const { data, error: clientError } = await supabase
        .from('clients')
        .select('id, name, brain_architecture_version')
        .eq('id', clientId)
        .single()
      if (!active) return
      if (clientError || !data) setError('Unable to load this client.')
      else setClient(data)
      setLoading(false)
    }
    void loadClient().catch(() => {
      if (!active) return
      setError('Unable to load this client.')
      setLoading(false)
    })
    return () => { active = false }
  }, [clientId])

  if (loading) return <BrainRouteLoading />
  if (error || !client) return <BrainRouteLoading message={error || 'Client not found.'} />
  if (isClientBrainV2ArchitectureVersion(client.brain_architecture_version)) {
    return <ClientBrainV2 key={`${clientId}:${searchParams.toString()}`} clientId={clientId} clientName={client.name} architectureVersion={client.brain_architecture_version} />
  }
  return <LegacyClientBrain />
}
