declare module 'gifenc' {
  export type Palette = number[][]

  export type QuantizeFormat = 'rgb565' | 'rgb444' | 'rgba4444'

  export type QuantizeOptions = {
    format?: QuantizeFormat
    oneBitAlpha?: boolean | number
    clearAlpha?: boolean
    clearAlphaThreshold?: number
    clearAlphaColor?: number
  }

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: QuantizeOptions,
  ): Palette

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: QuantizeFormat,
  ): Uint8Array

  export type WriteFrameOptions = {
    palette?: Palette
    first?: boolean
    transparent?: boolean
    transparentIndex?: number
    delay?: number
    repeat?: number
    dispose?: number
    colorDepth?: number
  }

  export type GifEncoderInstance = {
    reset(): void
    finish(): void
    bytes(): Uint8Array
    bytesView(): Uint8Array
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: WriteFrameOptions,
    ): void
  }

  export function GIFEncoder(options?: {
    initialCapacity?: number
    auto?: boolean
  }): GifEncoderInstance

  export default GIFEncoder
}
