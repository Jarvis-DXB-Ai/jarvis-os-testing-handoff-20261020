figma.showUI(__html__, { width: 520, height: 640, themeColors: true })

type LayerType =
  | "background"
  | "rectangle"
  | "image_placeholder"
  | "text"
  | "cta_block"
  | "logo_placeholder"
  | "footer"
  | "safe_zone"
  | "texture_overlay"

type FigmaLayerSpec = {
  id: string
  name: string
  type: LayerType
  x: number
  y: number
  width: number
  height: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  cornerRadius?: number
  text?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: "regular" | "medium" | "semibold" | "bold"
  lineHeight?: number
  letterSpacing?: number
  textAlign?: "left" | "center" | "right"
  verticalAlign?: "top" | "center" | "bottom"
  locked?: boolean
  visible?: boolean
}

type FigmaDesignSpec = {
  id: string
  clientId: string
  campaign: string
  objective: string
  feedRole: string
  format: "9:16 Story" | "4:5 Feed" | "1:1 Feed" | "Carousel" | "Reel Cover"
  frame: {
    name: string
    width: number
    height: number
    background: string
    safeZone: { top: number; right: number; bottom: number; left: number }
  }
  mood?: {
    emotionalTone?: string
    lightingStyle?: string
    visualDensity?: string
    luxuryLevel?: string
  }
  layers: FigmaLayerSpec[]
  figmaHandoffNotes?: string[]
}

type PluginMessage =
  | { type: "generate-frame"; spec: FigmaDesignSpec }
  | { type: string; spec?: unknown }

function isValidSpec(value: unknown): value is FigmaDesignSpec {
  if (!value || typeof value !== "object") return false
  const spec = value as Partial<FigmaDesignSpec>
  return Boolean(
    spec.frame
    && typeof spec.frame.width === "number"
    && typeof spec.frame.height === "number"
    && Array.isArray(spec.layers),
  )
}

function hexToRgb(hex: string | undefined, fallback: RGB = { r: 0.02, g: 0.03, b: 0.02 }): RGB {
  if (!hex || hex === "transparent") return fallback
  const clean = hex.replace("#", "").trim()
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return fallback
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  }
}

function solidPaint(hex: string | undefined, opacity = 1): SolidPaint {
  return {
    type: "SOLID",
    color: hexToRgb(hex),
    opacity,
  }
}

function fontStyle(weight: FigmaLayerSpec["fontWeight"]) {
  if (weight === "bold") return "Bold"
  if (weight === "semibold") return "Semi Bold"
  if (weight === "medium") return "Medium"
  return "Regular"
}

async function loadInter(style: string) {
  try {
    await figma.loadFontAsync({ family: "Inter", style })
    return { family: "Inter", style }
  } catch {
    await figma.loadFontAsync({ family: "Inter", style: "Regular" })
    return { family: "Inter", style: "Regular" }
  }
}

function applyGeometry(node: SceneNode & { resize: (width: number, height: number) => void }, layer: FigmaLayerSpec) {
  node.x = layer.x
  node.y = layer.y
  node.resize(Math.max(1, layer.width), Math.max(1, layer.height))
  node.name = layer.name
  node.locked = Boolean(layer.locked)
  node.visible = layer.visible !== false
}

function createRectangleLayer(layer: FigmaLayerSpec) {
  const rect = figma.createRectangle()
  applyGeometry(rect, layer)
  rect.fills = layer.fill === "transparent" ? [] : [solidPaint(layer.fill, layer.opacity ?? 1)]
  if (layer.stroke) {
    rect.strokes = [solidPaint(layer.stroke)]
    rect.strokeWeight = layer.strokeWidth ?? 1
  }
  rect.cornerRadius = layer.cornerRadius ?? 0
  return rect
}

async function createTextLayer(layer: FigmaLayerSpec) {
  const text = figma.createText()
  const font = await loadInter(fontStyle(layer.fontWeight))
  text.fontName = font
  text.characters = layer.text || layer.name
  text.fontSize = layer.fontSize ?? 32
  text.lineHeight = layer.lineHeight ? { unit: "PIXELS", value: layer.lineHeight } : { unit: "AUTO" }
  text.letterSpacing = { unit: "PIXELS", value: layer.letterSpacing ?? 0 }
  text.textAlignHorizontal =
    layer.textAlign === "center" ? "CENTER" :
    layer.textAlign === "right" ? "RIGHT" :
    "LEFT"
  text.textAlignVertical =
    layer.verticalAlign === "center" ? "CENTER" :
    layer.verticalAlign === "bottom" ? "BOTTOM" :
    "TOP"
  text.fills = [solidPaint(layer.fill || "#F8F4EA", layer.opacity ?? 1)]
  applyGeometry(text, layer)
  return text
}

async function createCtaBlock(layer: FigmaLayerSpec) {
  const block = figma.createFrame()
  block.name = layer.name
  block.x = layer.x
  block.y = layer.y
  block.resize(layer.width, layer.height)
  block.fills = [solidPaint(layer.fill || "#F8F4EA", layer.opacity ?? 1)]
  block.cornerRadius = layer.cornerRadius ?? layer.height / 2
  block.clipsContent = false

  const text = figma.createText()
  const font = await loadInter(fontStyle(layer.fontWeight))
  text.fontName = font
  text.characters = layer.text || "CTA"
  text.fontSize = layer.fontSize ?? 28
  text.textAlignHorizontal = "CENTER"
  text.textAlignVertical = "CENTER"
  text.fills = [solidPaint("#050806")]
  text.x = 0
  text.y = 0
  text.resize(layer.width, layer.height)
  block.appendChild(text)
  return block
}

async function createLogoPlaceholder(layer: FigmaLayerSpec) {
  const groupFrame = figma.createFrame()
  groupFrame.name = layer.name
  groupFrame.x = layer.x
  groupFrame.y = layer.y
  groupFrame.resize(layer.width, layer.height)
  groupFrame.fills = []
  groupFrame.strokes = layer.stroke ? [solidPaint(layer.stroke)] : [solidPaint("#B89658")]
  groupFrame.strokeWeight = layer.strokeWidth ?? 1
  groupFrame.cornerRadius = layer.cornerRadius ?? 8

  const text = figma.createText()
  const font = await loadInter(fontStyle(layer.fontWeight))
  text.fontName = font
  text.characters = layer.text || "LOGO"
  text.fontSize = layer.fontSize ?? 22
  text.textAlignHorizontal = "CENTER"
  text.textAlignVertical = "CENTER"
  text.fills = [solidPaint(layer.stroke || "#B89658")]
  text.x = 0
  text.y = 0
  text.resize(layer.width, layer.height)
  groupFrame.appendChild(text)
  return groupFrame
}

async function createNodeForLayer(layer: FigmaLayerSpec): Promise<SceneNode> {
  if (layer.type === "text" || layer.type === "footer") return createTextLayer(layer)
  if (layer.type === "cta_block") return createCtaBlock(layer)
  if (layer.type === "logo_placeholder") return createLogoPlaceholder(layer)
  return createRectangleLayer(layer)
}

async function generateFrame(spec: FigmaDesignSpec) {
  const frame = figma.createFrame()
  frame.name = spec.frame.name || `Jarvis / ${spec.campaign} / ${spec.format}`
  frame.resize(spec.frame.width, spec.frame.height)
  frame.fills = [solidPaint(spec.frame.background || "#050806")]
  frame.clipsContent = true
  frame.x = figma.viewport.center.x - spec.frame.width / 2
  frame.y = figma.viewport.center.y - spec.frame.height / 2

  const sortedLayers = [...spec.layers]
  for (const layer of sortedLayers) {
    const node = await createNodeForLayer(layer)
    frame.appendChild(node)
  }

  figma.currentPage.appendChild(frame)
  figma.currentPage.selection = [frame]
  figma.viewport.scrollAndZoomIntoView([frame])
  return frame
}

figma.ui.onmessage = async (message: PluginMessage) => {
  if (message.type !== "generate-frame") return
  if (!isValidSpec(message.spec)) {
    figma.ui.postMessage({ text: "Invalid Jarvis design JSON." })
    return
  }

  try {
    const frame = await generateFrame(message.spec)
    figma.ui.postMessage({ text: `Generated editable frame: ${frame.name}` })
  } catch (error) {
    figma.ui.postMessage({ text: "Could not generate frame. Check JSON layer values." })
  }
}
