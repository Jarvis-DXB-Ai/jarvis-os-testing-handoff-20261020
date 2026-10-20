import { NextResponse } from "next/server"
import { createContentItemsFromUpload } from "@/lib/social-publishing-server"

export const runtime = "nodejs"

const IMAGE_LIMIT = 10 * 1024 * 1024
const VIDEO_LIMIT = 100 * 1024 * 1024

async function imageDimensions(buffer: Buffer) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require("sharp") as typeof import("sharp")
    const metadata = await sharp(buffer).metadata()
    return { width: metadata.width ?? null, height: metadata.height ?? null }
  } catch {
    return { width: null, height: null }
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const clientId = formData.get("clientId")
    const monthStart = formData.get("monthStart")
    const contentKind = formData.get("contentKind")
    if (typeof clientId !== "string" || typeof monthStart !== "string" || (contentKind !== "feed" && contentKind !== "reel" && contentKind !== "story")) {
      return NextResponse.json({ ok: false, error: "Client, month, and content type are required." }, { status: 400 })
    }
    const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File)
    if (files.length === 0) return NextResponse.json({ ok: false, error: "Choose at least one final media file." }, { status: 400 })
    for (const file of files) {
      const isImage = file.type.startsWith("image/")
      const isVideo = file.type.startsWith("video/")
      if (contentKind === "reel" ? !isVideo : !isImage) return NextResponse.json({ ok: false, error: contentKind === "reel" ? "Reels require a final video file." : "Feed and Story uploads require final image assets." }, { status: 400 })
      if (isImage && file.size > IMAGE_LIMIT) return NextResponse.json({ ok: false, error: `${file.name} exceeds the 10 MB image limit.` }, { status: 400 })
      if (isVideo && file.size > VIDEO_LIMIT) return NextResponse.json({ ok: false, error: `${file.name} exceeds the 100 MB video limit.` }, { status: 400 })
    }
    const prepared = await Promise.all(files.map(async file => {
      const buffer = Buffer.from(await file.arrayBuffer())
      const dimensions = await imageDimensions(buffer)
      return { fileName: file.name, mimeType: file.type || "image/jpeg", byteSize: file.size, buffer, ...dimensions }
    }))
    const itemIds = await createContentItemsFromUpload({ clientId, monthStart, contentKind, files: prepared })
    return NextResponse.json({ ok: true, itemIds })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to store final Social content." }, { status: 400 })
  }
}
