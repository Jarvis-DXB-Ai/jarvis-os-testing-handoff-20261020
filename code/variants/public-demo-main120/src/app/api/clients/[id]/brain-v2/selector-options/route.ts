import { NextResponse } from 'next/server'
import { clientBrainV2ErrorResponse, clientBrainV2ServerClient, requireClientBrainV2 } from '@/lib/client-brain-v2-server-core'

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    await requireClientBrainV2(clientId)
    const { data, error } = await clientBrainV2ServerClient
      .from('client_brain_v2_records')
      .select('id, stable_key, title, subsection, status, metadata')
      .eq('client_id', clientId)
      .eq('top_section', 'intelligence')
      .in('subsection', ['menus', 'activations'])
      .is('superseded_by_id', null)
      .order('title', { ascending: true })

    if (error) throw error
    const records = data ?? []
    return NextResponse.json({
      success: true,
      menus: records.filter(record => record.subsection === 'menus'
        && record.metadata?.menu_taxonomy_status === 'active'),
      activations: records.filter(record => record.subsection === 'activations'),
    })
  } catch (error) {
    const response = clientBrainV2ErrorResponse(error)
    return NextResponse.json({ success: false, error: response.message }, { status: response.status })
  }
}
