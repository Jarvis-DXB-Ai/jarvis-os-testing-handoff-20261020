import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const BUCKET = 'client-assets'
const TTL    = 7200 // 2 hours

// POST { items: { id: string; path: string }[] }
// Returns { urls: Record<string, string> }
export async function POST(req: NextRequest) {
  try {
    const { items } = await req.json() as { items: { id: string; path: string }[] }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ urls: {} })
    }

    const urls: Record<string, string> = {}
    // Batch in groups of 10
    for (let i = 0; i < items.length; i += 10) {
      const batch = items.slice(i, i + 10)
      const results = await Promise.all(
        batch.map(item => sb.storage.from(BUCKET).createSignedUrl(item.path, TTL))
      )
      results.forEach((res, j) => {
        if (res.data?.signedUrl) urls[batch[j].id] = res.data.signedUrl
      })
    }

    return NextResponse.json({ urls })
  } catch (err) {
    console.error('[signed-urls]', err)
    return NextResponse.json({ urls: {} }, { status: 500 })
  }
}
