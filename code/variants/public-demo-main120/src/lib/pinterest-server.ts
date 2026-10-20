import "server-only"
import type { PinterestBoard, PinterestPinImageRef } from "@/lib/pinterest-inspiration"

const PINTEREST_API_BASE_URL = "https://api.pinterest.com/v5"
const PINTEREST_TIMEOUT_MS = 10_000
const PINTEREST_PAGE_SIZE = 50
const PINTEREST_PAGE_SAFETY_CAP = 12

type PinterestConnectionState = "connected" | "missing_access_token" | "pinterest_error" | "no_data"
type QueryValue = string | number | boolean | null | undefined

type PinterestReadOnlyResponse<T = unknown> = {
  ok: boolean
  resource: "pinterest_direct"
  mode: "read_only"
  connectionState: PinterestConnectionState
  readOnly: true
  data: T[]
  summary: Record<string, unknown>
  error?: string
  providerStatus?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function readOnlyResponse<T>(
  connectionState: PinterestConnectionState,
  data: T[],
  summary: Record<string, unknown> = {},
  error?: string,
  providerStatus?: number,
): PinterestReadOnlyResponse<T> {
  return {
    ok: connectionState === "connected" || connectionState === "no_data",
    resource: "pinterest_direct",
    mode: "read_only",
    connectionState,
    readOnly: true,
    data,
    summary: { ...summary, count: data.length },
    ...(error ? { error } : {}),
    ...(providerStatus ? { providerStatus } : {}),
  }
}

function missingToken<T>() {
  return readOnlyResponse<T>("missing_access_token", [], {
    requiredEnv: "PINTEREST_ACCESS_TOKEN",
    requiredScopes: ["boards:read", "pins:read"],
  }, "Pinterest access token is not configured.")
}

function sanitizedError(payload: unknown, status: number) {
  if (isRecord(payload)) {
    const message = stringValue(payload.message) || stringValue(payload.error) || stringValue(payload.code)
    if (message) return message.slice(0, 240)
  }
  return `Pinterest returned HTTP ${status}`
}

async function pinterestGet(path: string, query: Record<string, QueryValue> = {}) {
  const token = process.env.PINTEREST_ACCESS_TOKEN?.trim()
  if (!token) return { ok: false as const, connectionState: "missing_access_token" as const, error: "Pinterest access token is not configured." }

  const url = new URL(`${PINTEREST_API_BASE_URL}${path}`)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value))
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PINTEREST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    })
    const contentType = response.headers.get("content-type") ?? ""
    const payload = contentType.includes("application/json") ? await response.json() as unknown : await response.text()
    if (!response.ok) return { ok: false as const, status: response.status, connectionState: "pinterest_error" as const, error: sanitizedError(payload, response.status), payload }
    return { ok: true as const, status: response.status, payload }
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "Pinterest request timed out." : "Pinterest request failed."
    return { ok: false as const, connectionState: "pinterest_error" as const, error: message }
  } finally {
    clearTimeout(timeout)
  }
}

function itemsFrom(payload: unknown) {
  if (!isRecord(payload)) return []
  return Array.isArray(payload.items) ? payload.items : []
}

function bookmarkFrom(payload: unknown) {
  return isRecord(payload) ? stringValue(payload.bookmark) || null : null
}

function normalizeBoard(raw: unknown): PinterestBoard {
  const record = isRecord(raw) ? raw : {}
  const media = isRecord(record.media) ? record.media : {}
  return {
    id: stringValue(record.id),
    name: stringValue(record.name) || "Untitled Pinterest board",
    description: stringValue(record.description) || undefined,
    coverImageUrl: stringValue(record.image_cover_url) || stringValue(record.cover_image_url) || stringValue(media.image_cover_url) || undefined,
    pinCount: numberValue(record.pin_count),
    privacy: stringValue(record.privacy) || undefined,
    sourceUrl: stringValue(record.url) || undefined,
  }
}

function bestPinImage(raw: Record<string, unknown>) {
  const media = isRecord(raw.media) ? raw.media : {}
  const images = isRecord(media.images) ? media.images : {}
  const candidates = ["1200x", "600x", "400x300", "150x150", "original"]
  for (const key of candidates) {
    const image = isRecord(images[key]) ? images[key] : null
    const url = image ? stringValue(image.url) : ""
    if (url) {
      return {
        url,
        width: image ? numberValue(image.width) : undefined,
        height: image ? numberValue(image.height) : undefined,
      }
    }
  }
  const imageUrl = stringValue(raw.image_url) || stringValue(media.url)
  return imageUrl ? { url: imageUrl, width: undefined, height: undefined } : null
}

function normalizePin(raw: unknown, boardId: string, boardName?: string): PinterestPinImageRef | null {
  const record = isRecord(raw) ? raw : {}
  const image = bestPinImage(record)
  if (!image?.url) return null
  return {
    id: stringValue(record.id),
    boardId: stringValue(record.board_id) || boardId,
    boardName,
    title: stringValue(record.title) || undefined,
    description: stringValue(record.description) || undefined,
    imageUrl: image.url,
    sourceUrl: stringValue(record.link) || stringValue(record.url) || undefined,
    dominantColor: stringValue(record.dominant_color) || undefined,
    width: image.width,
    height: image.height,
    usage: "both",
    role: "mood",
    inspirationOnly: true,
  }
}

export async function getDirectPinterestBoards() {
  if (!process.env.PINTEREST_ACCESS_TOKEN?.trim()) return missingToken<PinterestBoard>()
  const result = await pinterestGet("/boards", { page_size: PINTEREST_PAGE_SIZE })
  if (!result.ok) return readOnlyResponse<PinterestBoard>(result.connectionState, [], {}, result.error, result.status)
  const boards = itemsFrom(result.payload).map(normalizeBoard).filter(board => board.id)
  return readOnlyResponse(boards.length > 0 ? "connected" : "no_data", boards, {
    endpoint: "GET /v5/boards",
    requiredScopes: ["boards:read"],
    bookmark: bookmarkFrom(result.payload),
    imageUrlsAvailable: boards.some(board => Boolean(board.coverImageUrl)),
  }, undefined, result.status)
}

export async function getDirectPinterestBoardPins(boardId: string | null, boardName?: string | null) {
  if (!process.env.PINTEREST_ACCESS_TOKEN?.trim()) return missingToken<PinterestPinImageRef>()
  if (!boardId) {
    return readOnlyResponse<PinterestPinImageRef>("no_data", [], {}, "boardId is required.")
  }

  const pins: PinterestPinImageRef[] = []
  let bookmark: string | null = null
  let pagesFetched = 0
  let providerStatus: number | undefined
  do {
    const result = await pinterestGet(`/boards/${encodeURIComponent(boardId)}/pins`, {
      page_size: PINTEREST_PAGE_SIZE,
      bookmark,
    })
    providerStatus = result.status ?? providerStatus
    if (!result.ok) return readOnlyResponse<PinterestPinImageRef>(result.connectionState, pins, { pagesFetched }, result.error, result.status)
    pins.push(...itemsFrom(result.payload).map(pin => normalizePin(pin, boardId, boardName ?? undefined)).filter((pin): pin is PinterestPinImageRef => Boolean(pin)))
    bookmark = bookmarkFrom(result.payload)
    pagesFetched += 1
  } while (bookmark && pagesFetched < PINTEREST_PAGE_SAFETY_CAP)

  return readOnlyResponse(pins.length > 0 ? "connected" : "no_data", pins, {
    endpoint: "GET /v5/boards/{board_id}/pins",
    requiredScopes: ["pins:read"],
    pagesFetched,
    nextBookmark: bookmark,
    imageUrlsAvailable: pins.some(pin => Boolean(pin.imageUrl)),
  }, undefined, providerStatus)
}

export async function getDirectPinterestPin(pinId: string | null) {
  if (!process.env.PINTEREST_ACCESS_TOKEN?.trim()) return missingToken<PinterestPinImageRef>()
  if (!pinId) return readOnlyResponse<PinterestPinImageRef>("no_data", [], {}, "pinId is required.")
  const result = await pinterestGet(`/pins/${encodeURIComponent(pinId)}`)
  if (!result.ok) return readOnlyResponse<PinterestPinImageRef>(result.connectionState, [], {}, result.error, result.status)
  const pin = normalizePin(result.payload, "")
  return readOnlyResponse(pin ? "connected" : "no_data", pin ? [pin] : [], {
    endpoint: "GET /v5/pins/{pin_id}",
    requiredScopes: ["pins:read"],
  }, undefined, result.status)
}
