import { NextResponse } from "next/server"
import { processZernioWebhook, verifyZernioWebhookSignature } from "@/lib/social-provider-webhooks-server"

export async function POST(request: Request) {
  const raw = await request.text()
  const signature = request.headers.get("x-zernio-signature")
  if (!verifyZernioWebhookSignature(raw, signature)) return NextResponse.json({ ok: false, error: "Invalid webhook signature." }, { status: 401 })
  const payload = await Promise.resolve().then(() => JSON.parse(raw) as Record<string, unknown>).catch(() => null)
  if (!payload) return NextResponse.json({ ok: false, error: "Invalid webhook JSON." }, { status: 400 })
  const eventId = typeof payload.id === "string" ? payload.id : request.headers.get("x-zernio-event-id")
  const eventType = typeof payload.event === "string" ? payload.event : typeof payload.type === "string" ? payload.type : request.headers.get("x-zernio-event-type")
  if (!eventId || !eventType) return NextResponse.json({ ok: false, error: "Webhook event identity is missing." }, { status: 400 })
  try { return NextResponse.json({ ok: true, ...(await processZernioWebhook({ eventId, eventType, payload })) }) }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Webhook processing failed." }, { status: 500 }) }
}
