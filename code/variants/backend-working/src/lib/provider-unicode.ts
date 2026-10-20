export type ProviderUnicodeSanitization = {
  value: unknown
  sanitized: boolean
  paths: string[]
}

/**
 * Repairs only invalid UTF-16 code units from provider payloads. Valid Unicode,
 * including surrogate-pair emoji and multilingual text, remains byte-for-byte
 * unchanged in JavaScript string form.
 */
export function sanitizeProviderString(value: string) {
  let output = ""
  let sanitized = false
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) { output += value[index] + value[index + 1]; index += 1 }
      else { output += "\uFFFD"; sanitized = true }
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      output += "\uFFFD"; sanitized = true
    } else output += value[index]
  }
  return { value: output, sanitized }
}

/** Recursively sanitizes provider JSON while leaving primitives and null intact. */
export function sanitizeProviderJson(value: unknown, path = "provider"): ProviderUnicodeSanitization {
  const paths: string[] = []
  const visit = (item: unknown, currentPath: string): unknown => {
    if (typeof item === "string") {
      const result = sanitizeProviderString(item)
      if (result.sanitized) paths.push(currentPath)
      return result.value
    }
    if (Array.isArray(item)) return item.map((entry, index) => visit(entry, `${currentPath}[${index}]`))
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, visit(entry, `${currentPath}.${key}`)]))
    return item
  }
  const sanitizedValue = visit(value, path)
  return { value: sanitizedValue, sanitized: paths.length > 0, paths }
}
