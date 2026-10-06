import { frameIndexAt } from './gif'
import { sampleProps } from './keyframes'
import type { Layer, Project, Props, TextProps } from './types'

const measureCanvas = document.createElement('canvas')
const measureCtx = measureCanvas.getContext('2d')!

export type Box = { x: number; y: number; w: number; h: number }

/**
 * Timeline time -> source-loop time.
 *
 * Without any trimming this is the identity. After a segment has been cut out
 * the timeline is shorter than the source, so the remaining frames sample the
 * source at the time they originally played at.
 */
export function sourceTimeAt(project: Project, t: number): number {
  const { delays, frameTimes } = project
  if (delays.length === 0 || frameTimes.length !== delays.length) return t
  // Work in whole milliseconds: frame boundaries are exact ms values, and
  // comparing accumulated floats would land a sample on the wrong frame.
  const spans = delays.map((d) => Math.max(20, Math.round(d)))
  const total = spans.reduce((sum, d) => sum + d, 0)
  if (total <= 0) return t
  let ms = Math.round(t * 1000) % total
  if (ms < 0) ms += total
  let acc = 0
  for (let i = 0; i < spans.length; i++) {
    if (ms < acc + spans[i] || i === spans.length - 1) {
      return frameTimes[i] + (ms - acc) / 1000
    }
    acc += spans[i]
  }
  return t
}

export function fontString(text: TextProps, scale = 1): string {
  const weight = text.fontWeight
  const size = Math.max(1, text.fontSize * scale)
  return `${weight} ${size}px ${text.fontFamily}`
}

export function textLines(text: TextProps): string[] {
  return text.content.split('\n')
}

/** Size of a text block in stage pixels (ignoring the layer transform). */
export function measureTextBlock(text: TextProps): { width: number; height: number; lineHeight: number } {
  measureCtx.font = fontString(text)
  const lines = textLines(text)
  let width = 0
  for (const line of lines) {
    const w = measureCtx.measureText(line || ' ').width + text.strokeWidth * 2
    width = Math.max(width, w)
  }
  const lineHeight = text.fontSize * text.lineHeight
  return {
    width: Math.max(width, 1) + text.letterSpacing * 8,
    height: Math.max(lineHeight * lines.length, 1),
    lineHeight,
  }
}

function imageDrawSize(layer: Layer, project: Project): { w: number; h: number } {
  const source = layer.source
  if (!source) return { w: project.width, h: project.height }
  const fit = layer.fit ?? 'contain'
  if (fit === 'stretch') return { w: project.width, h: project.height }
  const kx = project.width / source.width
  const ky = project.height / source.height
  const k = fit === 'cover' ? Math.max(kx, ky) : Math.min(kx, ky)
  return { w: source.width * k, h: source.height * k }
}

export function layerBox(layer: Layer, project: Project): Box {
  const centerX = project.width / 2
  const centerY = project.height / 2
  if (layer.type === 'text' && layer.text) {
    const m = measureTextBlock(layer.text)
    return { x: centerX - m.width / 2, y: centerY - m.height / 2, w: m.width, h: m.height }
  }
  const size = imageDrawSize(layer, project)
  return { x: centerX - size.w / 2, y: centerY - size.h / 2, w: size.w, h: size.h }
}

/** Axis-aligned bounding box of a layer after its transform is applied. */
export function layerWorldBox(layer: Layer, project: Project, t: number): Box {
  const box = layerBox(layer, project)
  const p = sampleProps(layer, t)
  const cx = box.x + box.w / 2 + p.x
  const cy = box.y + box.h / 2 + p.y
  const w = box.w * Math.abs(p.scale)
  const h = box.h * Math.abs(p.scale)
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

export function pointInLayer(layer: Layer, project: Project, t: number, x: number, y: number): boolean {
  const p = sampleProps(layer, t)
  if (p.opacity <= 0.01) return false
  const box = layerWorldBox(layer, project, t)
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const angle = (-p.rotation * Math.PI) / 180
  const dx = x - cx
  const dy = y - cy
  const rx = dx * Math.cos(angle) - dy * Math.sin(angle)
  const ry = dx * Math.sin(angle) + dy * Math.cos(angle)
  const pad = layer.type === 'text' ? 6 : 0
  return Math.abs(rx) <= box.w / 2 + pad && Math.abs(ry) <= box.h / 2 + pad
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string): void {
  const target = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  if ('letterSpacing' in target) target.letterSpacing = value
}

function drawText(ctx: CanvasRenderingContext2D, text: TextProps): void {
  const m = measureTextBlock(text)
  const lines = textLines(text)
  ctx.font = fontString(text)
  ctx.textAlign = text.align
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2
  setLetterSpacing(ctx, `${text.letterSpacing}px`)
  const anchorX = text.align === 'left' ? -m.width / 2 : text.align === 'right' ? m.width / 2 : 0
  const startY = -m.height / 2 + m.lineHeight / 2
  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * m.lineHeight
    const line = lines[i]
    if (text.strokeWidth > 0) {
      ctx.strokeStyle = text.strokeColor
      ctx.lineWidth = text.strokeWidth * 2
      ctx.strokeText(line, anchorX, y)
    }
    ctx.fillStyle = text.color
    ctx.fillText(line, anchorX, y)
  }
  setLetterSpacing(ctx, '0px')
}

function applyTransform(ctx: CanvasRenderingContext2D, project: Project, p: Props): void {
  ctx.translate(project.width / 2 + p.x, project.height / 2 + p.y)
  ctx.rotate((p.rotation * Math.PI) / 180)
  ctx.scale(p.scale, p.scale)
  ctx.globalAlpha = Math.max(0, Math.min(1, p.opacity))
}

export type DrawOptions = {
  /** Draw selection chrome (never used for export). */
  selectedId?: string | null
  time?: number
  /** Device pixel multiplier for the target canvas. */
  scale?: number
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  project: Project,
  t: number,
  opts: DrawOptions = {},
): void {
  const { width, height } = project
  const scale = opts.scale ?? 1
  ctx.save()
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.globalAlpha = 1
  ctx.clearRect(0, 0, width * scale + 1, height * scale + 1)
  if (project.background) {
    ctx.fillStyle = project.background
    ctx.fillRect(0, 0, width, height)
  }

  for (const layer of project.layers) {
    if (!layer.visible) continue
    const p = sampleProps(layer, t)
    if (p.opacity <= 0.001) continue
    ctx.save()
    applyTransform(ctx, project, p)
    if (layer.type === 'image' && layer.source) {
      const size = imageDrawSize(layer, project)
      const frame = layer.source.frames[frameIndexAt(layer.source, sourceTimeAt(project, t) * 1000)]
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(frame.canvas, -size.w / 2, -size.h / 2, size.w, size.h)
    } else if (layer.type === 'text' && layer.text && layer.text.content.trim() !== '') {
      drawText(ctx, layer.text)
    }
    ctx.restore()
  }

  if (opts.selectedId) {
    const layer = project.layers.find((l) => l.id === opts.selectedId)
    if (layer && layer.visible) {
      const p = sampleProps(layer, t)
      const box = layerBox(layer, project)
      ctx.save()
      applyTransform(ctx, project, { ...p, scale: p.scale })
      ctx.globalAlpha = 1
      ctx.strokeStyle = 'rgba(96,165,250,0.95)'
      ctx.lineWidth = Math.max(1, Math.round(project.width / 500))
      ctx.setLineDash([6, 4])
      ctx.strokeRect(-box.w / 2, -box.h / 2, box.w, box.h)
      ctx.setLineDash([])
      ctx.restore()
    }
  }
  ctx.restore()
}
