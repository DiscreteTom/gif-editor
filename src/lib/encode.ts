import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { drawScene } from './render'
import type { Project } from './types'

export type ExportOptions = {
  /** Number of colours in the palette (2 - 256). */
  colors: number
  /** Output resolution multiplier. */
  scale: number
  /** -1 plays once, 0 loops forever. */
  loop: number
  /** Keep the background transparent. */
  transparent: boolean
  /** Milliseconds added to each frame delay when exporting. */
  speed?: number
}

export type Progress = (ratio: number, message: string) => void

export const DEFAULT_EXPORT: ExportOptions = {
  colors: 256,
  scale: 1,
  loop: 0,
  transparent: true,
  speed: 1,
}

/** Render one frame of the project into an existing 2D context. */
export function renderFrameTo(
  ctx: CanvasRenderingContext2D,
  project: Project,
  t: number,
  scale: number,
): void {
  drawScene(ctx, project, t, { scale })
}

export async function exportGif(
  project: Project,
  options: ExportOptions,
  onProgress: Progress = () => {},
): Promise<Blob> {
  const scale = options.scale
  const width = Math.max(1, Math.round(project.width * scale))
  const height = Math.max(1, Math.round(project.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!

  const delays = project.delays.length > 0 ? project.delays : [100]
  const encoder = GIFEncoder({ initialCapacity: Math.max(1 << 16, width * height) })
  const speed = options.speed ?? 1

  let acc = 0
  const start = performance.now()
  for (let i = 0; i < delays.length; i++) {
    const t = acc / 1000
    renderFrameTo(ctx, project, t, scale)
    const { data } = ctx.getImageData(0, 0, width, height)

    const palette = quantize(data, Math.max(2, Math.min(256, Math.round(options.colors))), {
      format: 'rgba4444',
      oneBitAlpha: true,
      clearAlpha: true,
    })
    const index = applyPalette(data, palette, 'rgba4444')

    let transparentIndex = -1
    if (options.transparent) {
      transparentIndex = palette.findIndex((c) => c[3] === 0)
    }

    encoder.writeFrame(index, width, height, {
      palette,
      delay: Math.max(20, Math.round(delays[i] / speed)),
      repeat: options.loop,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
      dispose: transparentIndex >= 0 ? 2 : -1,
    })
    acc += delays[i]
    onProgress((i + 1) / delays.length, `Encoding frame ${i + 1} of ${delays.length}`)
    // Let the browser paint the progress bar between frames.
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  encoder.finish()
  const ms = Math.round(performance.now() - start)
  onProgress(1, `Done in ${(ms / 1000).toFixed(1)}s`)
  // Copy into a plain ArrayBuffer-backed view so the Blob constructor accepts it.
  return new Blob([new Uint8Array(encoder.bytes())], { type: 'image/gif' })
}

export async function exportPng(project: Project, t: number, scale = 1): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(project.width * scale))
  canvas.height = Math.max(1, Math.round(project.height * scale))
  const ctx = canvas.getContext('2d')!
  renderFrameTo(ctx, project, t, scale)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not export the PNG'))
    }, 'image/png')
  })
}
