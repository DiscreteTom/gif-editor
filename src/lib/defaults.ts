import { uid } from './keyframes'
import type { GifSource, Keyframe, Layer, Project, PropName, Tracks } from './types'

export type RawKey = Omit<Keyframe, 'id'>
export type RawTracks = Partial<Record<PropName, RawKey[]>>

/** Presets are authored without ids; materialise them into real tracks. */
export function materializeTracks(raw: RawTracks): Tracks {
  const out: Tracks = {}
  for (const [prop, keys] of Object.entries(raw) as [PropName, RawKey[]][]) {
    out[prop] = keys.map((k) => ({ ...k, id: uid('k') }))
  }
  return out
}

export const FONT_STACKS = [
  { label: 'System sans', value: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif' },
  { label: 'Arial / Hei', value: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif' },
  { label: 'Serif / Georgia', value: 'Georgia, "Songti SC", "SimSun", serif' },
  { label: 'Mono / Menlo', value: 'Menlo, Consolas, "Courier New", monospace' },
  { label: 'Comic / rounded', value: '"Comic Sans MS", "PingFang SC", cursive, sans-serif' },
]

export function createTextLayer(content = 'Your text', project: Project): Layer {
  return {
    id: uid('text'),
    name: content.slice(0, 12) || 'Text',
    type: 'text',
    visible: true,
    base: {
      x: 0,
      y: Math.round(project.height * 0.25),
      scale: 1,
      rotation: 0,
      opacity: 1,
    },
    tracks: {},
    text: {
      content,
      fontFamily: FONT_STACKS[0].value,
      fontWeight: 800,
      fontSize: Math.max(18, Math.round(project.height * 0.12)),
      color: '#ffffff',
      strokeColor: '#111827',
      strokeWidth: Math.max(2, Math.round(project.height * 0.008)),
      shadow: true,
      lineHeight: 1.15,
      letterSpacing: 0,
      align: 'center',
    },
  }
}

export function createImageLayer(source: GifSource): Layer {
  return {
    id: uid('img'),
    name: source.name,
    type: 'image',
    visible: true,
    base: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    tracks: {},
    source,
    fit: 'contain',
  }
}

export function createProject(): Project {
  const delays = Array.from({ length: 24 }, () => 100)
  return {
    width: 480,
    height: 480,
    duration: 2.4,
    background: null,
    layers: [],
    delays,
    frameTimes: delays.map((_, i) => i / 10),
    loop: 0,
  }
}

export type PresetId =
  | 'zoomIn'
  | 'zoomOut'
  | 'fadeIn'
  | 'fadeOut'
  | 'pop'
  | 'bounce'
  | 'shake'
  | 'spin'
  | 'panRight'

export type Preset = {
  id: PresetId
  label: string
  apply: (project: Project, time: number) => RawTracks
}

const round3 = (v: number) => Math.round(v * 1000) / 1000

export const PRESETS: Preset[] = [
  {
    id: 'zoomIn',
    label: 'Zoom in',
    apply: (project) => ({
      scale: [
        { t: 0, v: 1, ease: 'easeInOut' },
        { t: project.duration, v: 1.35 },
      ],
    }),
  },
  {
    id: 'zoomOut',
    label: 'Zoom out',
    apply: (project) => ({
      scale: [
        { t: 0, v: 1.35, ease: 'easeInOut' },
        { t: project.duration, v: 1 },
      ],
    }),
  },
  {
    id: 'fadeIn',
    label: 'Fade in',
    apply: (project) => ({
      opacity: [
        { t: 0, v: 0, ease: 'easeInOut' },
        { t: Math.min(0.6, project.duration), v: 1 },
      ],
    }),
  },
  {
    id: 'fadeOut',
    label: 'Fade out',
    apply: (project) => ({
      opacity: [
        { t: 0, v: 1 },
        { t: Math.max(0, project.duration - 0.6), v: 1, ease: 'easeInOut' },
        { t: project.duration, v: 0 },
      ],
    }),
  },
  {
    id: 'pop',
    label: 'Pop in',
    apply: (project, time) => {
      const t0 = Math.min(Math.max(0, time), Math.max(0, project.duration - 0.45))
      return {
        scale: [
          { t: round3(t0), v: 0.4, ease: 'linear' },
          { t: round3(t0 + 0.15), v: 1.12, ease: 'easeInOut' },
          { t: round3(t0 + 0.3), v: 1 },
        ],
      }
    },
  },
  {
    id: 'bounce',
    label: 'Bounce',
    apply: (project, time) => {
      const amp = project.height * 0.08
      const t0 = Math.max(0, time)
      const step = 0.18
      return {
        y: [
          { t: round3(t0), v: 0, ease: 'easeInOut' },
          { t: round3(t0 + step), v: -amp, ease: 'easeInOut' },
          { t: round3(t0 + step * 2), v: 0, ease: 'easeInOut' },
        ],
      }
    },
  },
  {
    id: 'shake',
    label: 'Shake',
    apply: (project, time) => {
      const amp = project.width * 0.03
      const t0 = Math.max(0, time)
      const step = 0.06
      const keys = [0, 1, 2, 3, 4].map((i) => ({
        t: round3(t0 + i * step),
        v: i % 2 === 0 ? 0 : i % 4 === 1 ? amp : -amp,
        ease: 'linear' as const,
      }))
      return { x: keys }
    },
  },
  {
    id: 'spin',
    label: 'Spin 360',
    apply: (project) => ({
      rotation: [
        { t: 0, v: 0, ease: 'linear' },
        { t: project.duration, v: 360 },
      ],
    }),
  },
  {
    id: 'panRight',
    label: 'Pan across',
    apply: (project) => ({
      x: [
        { t: 0, v: -project.width * 0.12, ease: 'easeInOut' },
        { t: project.duration, v: project.width * 0.12 },
      ],
    }),
  },
]
