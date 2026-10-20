import { createHmac, timingSafeEqual } from "crypto"

export function verifyZernioWebhookSignature(rawBody: string, supplied: string | null, secret: string | undefined) {
  if (!secret || !supplied) return false
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  const actual = supplied.replace(/^sha256=/i, "")
  if (actual.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(actual, "utf8"), Buffer.from(expected, "utf8"))
}
