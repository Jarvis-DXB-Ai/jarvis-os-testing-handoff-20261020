import assert from "node:assert/strict"
import { sanitizeProviderJson, sanitizeProviderString } from "../src/lib/provider-unicode"

const valid = ["plain ASCII", "é", "Schrödinger", "مرحبا بالعالم", "こんにちは", "😀", "👩🏽‍🍳🍝", "\uD83D\uDE00"]
for (const value of valid) assert.deepEqual(sanitizeProviderString(value), { value, sanitized: false })
assert.equal(sanitizeProviderString("a\uD800b").value, "a�b")
assert.equal(sanitizeProviderString("a\uDC00b").value, "a�b")
assert.equal(sanitizeProviderString("a\uD800").value, "a�")
const nested = sanitizeProviderJson({ title: "ok\uDC00", entries: ["😀", { label: "\uD800x" }], number: 3, enabled: true, empty: null })
assert.deepEqual(nested.value, { title: "ok�", entries: ["😀", { label: "�x" }], number: 3, enabled: true, empty: null })
assert.deepEqual(nested.paths, ["provider.title", "provider.entries[1].label"])
console.log("provider unicode fixtures passed")
