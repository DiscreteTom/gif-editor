import { decompressFrames, parseGIF } from 'gifuct-js'
import type { GifSource, SourceFrame } from './types'
import { uid } from './keyframes'

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  return canvas
}

/**
 * Decode a GIF file into full-size RGBA frames, honouring frame offsets,
 * transparency and disposal methods.
 */
export async function decodeGif(file: File | Blob, name = 'animation.gif'): Promise<GifSource> {
  const buffer = await file.arrayBuffer()
  const parsed = parseGIF(buffer)
  const frames = decompressFrames(parsed, true)
  const width = parsed.lsd.width
  const height = parsed.lsd.height

  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const patchCanvas = makeCanvas(1, 1)
  const patchCtx = patchCanvas.getContext('2d')!

  const out: SourceFrame[] = []
  let restoreSnapshot: ImageData | null = null

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]
    const dims = frame.dims

    if (i > 0) {
      const prev = frames[i - 1]
      if (prev.disposalType === 2) {
        // Restore to background: clear the area the previous frame covered.
        ctx.clearRect(prev.dims.left, prev.dims.top, prev.dims.width, prev.dims.height)
      } else if (prev.disposalType === 3 && restoreSnapshot) {
        ctx.putImageData(restoreSnapshot, 0, 0)
      }
    }

    if (frame.disposalType === 3) {
      restoreSnapshot = ctx.getImageData(0, 0, width, height)
    }

    if (dims.width > 0 && dims.height > 0) {
      if (patchCanvas.width !== dims.width || patchCanvas.height !== dims.height) {
        patchCanvas.width = dims.width
        patchCanvas.height = dims.height
      }
      const imageData = new ImageData(
        new Uint8ClampedArray(frame.patch),
        dims.width,
        dims.height,
      )
      patchCtx.putImageData(imageData, 0, 0)
      ctx.drawImage(patchCanvas, dims.left, dims.top)
    }

    const snapshot = makeCanvas(width, height)
    snapshot.getContext('2d')!.drawImage(canvas, 0, 0)
    out.push({ canvas: snapshot, delay: Math.max(20, Math.round(frame.delay || 100)) })
  }

  if (out.length === 0) {
    const blank = makeCanvas(width, height)
    out.push({ canvas: blank, delay: 100 })
  }

  return {
    id: uid('src'),
    name,
    width,
    height,
    frames: out,
    total: out.reduce((sum, f) => sum + f.delay, 0),
    still: false,
  }
}

/** Load a static bitmap (PNG / JPG / WebP) as a single-frame source. */
export async function decodeImage(file: File | Blob, name = 'image.png'): Promise<GifSource> {
  const bitmap = await createImageBitmap(file)
  const canvas = makeCanvas(bitmap.width, bitmap.height)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  if (typeof bitmap.close === 'function') bitmap.close()
  return {
    id: uid('src'),
    name,
    width: canvas.width,
    height: canvas.height,
    frames: [{ canvas, delay: 100 }],
    total: 100,
    still: true,
  }
}

/** Index of the source frame visible at `timeMs` inside the loop. */
export function frameIndexAt(source: GifSource, timeMs: number): number {
  if (source.frames.length <= 1) return 0
  const total = source.total || 1
  const t = ((Math.round(timeMs) % total) + total) % total
  let acc = 0
  for (let i = 0; i < source.frames.length; i++) {
    acc += source.frames[i].delay
    if (t < acc) return i
  }
  return source.frames.length - 1
}

/** Fire-and-forget download helper shared by the export flows. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
