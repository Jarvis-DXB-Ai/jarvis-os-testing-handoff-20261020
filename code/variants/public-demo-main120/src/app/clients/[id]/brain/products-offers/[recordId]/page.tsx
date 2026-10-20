import { notFound } from 'next/navigation'
import ClientBrainV2CommercialDetailPage from '../../components/client-brain-v2-commercial-detail'
import {
  ClientBrainV2HttpError,
  loadClientBrainV2CommercialDetail,
} from '@/lib/client-brain-v2-server'

export const dynamic = 'force-dynamic'

async function loadCommercialDetailOrNotFound(clientId: string, recordId: string) {
  try {
    return await loadClientBrainV2CommercialDetail(clientId, recordId)
  } catch (error) {
    if (error instanceof ClientBrainV2HttpError && error.status === 404) notFound()
    throw error
  }
}

export default async function CommercialObjectPage({
  params,
}: {
  params: Promise<{ id: string; recordId: string }>
}) {
  const { id: clientId, recordId } = await params
  const detail = await loadCommercialDetailOrNotFound(clientId, recordId)
  return <ClientBrainV2CommercialDetailPage detail={detail} />
}
