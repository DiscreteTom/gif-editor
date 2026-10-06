export type Ease = 'linear' | 'easeInOut' | 'hold'

export type Keyframe = {
  /** Stable identifier so keyframes can be dragged/edited by identity. */
  id: string
  /** Time in seconds, relative to the start of the edited timeline. */
  t: number
  /** Value at that time. */
  v: number
  /** Easing applied to the segment that starts at this keyframe. */
  ease?: Ease
}

export type Track = Keyframe[]

export type PropName = 'x' | 'y' | 'scale' | 'rotation' | 'opacity'

export const PROP_NAMES: PropName[] = ['x', 'y', 'scale', 'rotation', 'opacity']

export const PROP_LABELS: Record<PropName, string> = {
  x: 'X position',
  y: 'Y position',
  scale: 'Scale',
  rotation: 'Rotation',
  opacity: 'Opacity',
}

export type Props = Record<PropName, number>
export type Tracks = Partial<Record<PropName, Track>>

export type SourceFrame = {
  canvas: HTMLCanvasElement
  /** Frame duration in milliseconds. */
  delay: number
}

export type GifSource = {
  id: string
  name: string
  width: number
  height: number
  frames: SourceFrame[]
  /** Total duration of one loop in milliseconds. */
  total: number
  /** Static picture (single frame source, e.g. a PNG or JPG). */
  still: boolean
}

export type TextProps = {
  content: string
  fontFamily: string
  fontWeight: number
  fontSize: number
  color: string
  strokeColor: string
  strokeWidth: number
  shadow: boolean
  lineHeight: number
  letterSpacing: number
  align: 'left' | 'center' | 'right'
}

export type Layer = {
  id: string
  name: string
  type: 'image' | 'text'
  visible: boolean
  base: Props
  tracks: Tracks
  /** Image layers only. */
  source?: GifSource
  fit?: 'contain' | 'cover' | 'stretch'
  /** Text layers only. */
  text?: TextProps
}

export type Project = {
  width: number
  height: number
  /**
   * Duration of the edited timeline in seconds.
   * Always kept in sync with `delays` (the sum of the frame delays).
   */
  duration: number
  /** null means transparent background. */
  background: string | null
  layers: Layer[]
  /**
   * Output frame durations in milliseconds. This array *is* the timeline:
   * trimming or cutting a segment removes entries from it.
   */
  delays: number[]
  /**
   * Source-loop time (in seconds) sampled by each output frame. Cutting a
   * segment removes entries here as well, so the kept part of the animation
   * keeps playing in place instead of jumping back.
   */
  frameTimes: number[]
  /** Repeat count: -1 plays once, 0 loops forever. */
  loop: number
}

export type Fit = NonNullable<Layer['fit']>
