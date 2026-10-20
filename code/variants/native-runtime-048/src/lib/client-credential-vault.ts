import "server-only"

import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"
const VERSION = "v1"

function vaultKey() {
  const encoded = process.env.CLIENT_VAULT_ENCRYPTION_KEY?.trim()
  if (!encoded) throw new Error("Secure Login Vault is not configured. Set CLIENT_VAULT_ENCRYPTION_KEY on the server.")
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error("CLIENT_VAULT_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key.")
  const key = Buffer.from(encoded, "base64")
  if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("CLIENT_VAULT_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key.")
  return key
}

export function encryptCredentialSecret(secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, vaultKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`
}

export function decryptCredentialSecret(envelope: string) {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded, extra] = envelope.split(":")
  if (version !== VERSION || !ivEncoded || !tagEncoded || !ciphertextEncoded || extra) throw new Error("Credential secret is not a supported vault envelope.")
  const decipher = createDecipheriv(ALGORITHM, vaultKey(), Buffer.from(ivEncoded, "base64"))
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, "base64")), decipher.final()]).toString("utf8")
}
