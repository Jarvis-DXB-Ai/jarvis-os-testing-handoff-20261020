export type PinterestInspirationUsage = "photography" | "videography" | "both"

export type PinterestInspirationRole = "lighting" | "composition" | "mood" | "color" | "camera" | "styling"

export type PinterestInspirationRef = {
  id: string
  boardName: string
  pinTitle?: string
  imageUrl?: string
  sourceUrl?: string
  notes?: string
  tags: string[]
  usage: PinterestInspirationUsage
  inspirationRole: PinterestInspirationRole
  createdAt: string
  source?: "manual" | "upload" | "zernio"
  inspirationOnly?: boolean
}

export type PinterestMoodboard = {
  id: string
  name: string
  source: "zernio"
  platform: "pinterest"
  boardIds: string[]
  coverImageUrl?: string
  pinCount?: number
  usage?: PinterestInspirationUsage
  tags?: string[]
}

export type PinterestBoard = {
  id: string
  accountId?: string
  name: string
  description?: string
  coverImageUrl?: string
  pinCount?: number
  privacy?: string
  sourceUrl?: string
}

export type PinterestPinRef = {
  id: string
  boardId: string
  boardName: string
  title?: string
  description?: string
  imageUrl?: string
  sourceUrl?: string
  dominantRole?: PinterestInspirationRole
  usage: PinterestInspirationUsage
  tags: string[]
  inspirationOnly: true
}

export type PinterestPinImageRef = {
  id: string
  boardId: string
  boardName?: string
  title?: string
  description?: string
  imageUrl: string
  sourceUrl?: string
  dominantColor?: string
  width?: number
  height?: number
  usage: PinterestInspirationUsage
  role: PinterestInspirationRole
  inspirationOnly: true
}

export const PINTEREST_INSPIRATION_USAGES: PinterestInspirationUsage[] = ["photography", "videography", "both"]

export const PINTEREST_INSPIRATION_ROLES: PinterestInspirationRole[] = ["lighting", "composition", "mood", "color", "camera", "styling"]

export function pinterestPromptLine(ref: PinterestInspirationRef) {
  return `${ref.boardName}${ref.pinTitle ? ` / ${ref.pinTitle}` : ""}: ${ref.inspirationRole} inspiration only; ${ref.notes || "use for mood/visual direction only"}`
}
