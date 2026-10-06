import type { Ease, Keyframe, Layer, PropName, Props, Track } from './types'

const EPS = 1e-4

export function sortTrack(track: Track): Track {
  return [...track].sort((a, b) => a.t - b.t)
}

function easeAmount(ease: Ease | undefined, p: number): number {
  switch (ease) {
    case 'easeInOut':
      return p * p * (3 - 2 * p)
    case 'hold':
      return 0
    default:
      return p
  }
}

/** Sample a track at time `t` (seconds). Falls back to `fallback` when empty. */
export function sampleTrack(track: Track | undefined, fallback: number, t: number): number {
  if (!track || track.length === 0) return fallback
  if (track.length === 1) return track[0].v
  if (t <= track[0].t) return track[0].v
  const last = track[track.length - 1]
  if (t >= last.t) return last.v

  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i]
    const b = track[i + 1]
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t
      if (span <= EPS) return b.v
      const p = easeAmount(a.ease, (t - a.t) / span)
      return a.v + (b.v - a.v) * p
    }
  }
  return last.v
}

export function sampleProps(layer: Layer, t: number): Props {
  return {
    x: sampleTrack(layer.tracks.x, layer.base.x, t),
    y: sampleTrack(layer.tracks.y, layer.base.y, t),
    scale: sampleTrack(layer.tracks.scale, layer.base.scale, t),
    rotation: sampleTrack(layer.tracks.rotation, layer.base.rotation, t),
    opacity: sampleTrack(layer.tracks.opacity, layer.base.opacity, t),
  }
}

export function hasKeyAt(track: Track | undefined, t: number, eps = 0.02): boolean {
  if (!track) return false
  return track.some((k) => Math.abs(k.t - t) <= eps)
}

export function keyAt(track: Track | undefined, t: number, eps = 0.02): Keyframe | undefined {
  if (!track) return undefined
  return track.find((k) => Math.abs(k.t - t) <= eps)
}

/** Insert or replace a keyframe at time `t`. */
export function setKey(track: Track | undefined, t: number, v: number, ease?: Ease): Track {
  const time = Math.max(0, t)
  const next = track ? [...track] : []
  const existing = next.find((k) => Math.abs(k.t - time) <= 0.02)
  if (existing) {
    existing.v = v
    if (ease) existing.ease = ease
    return sortTrack(next)
  }
  next.push({ id: uid('k'), t: time, v, ease: ease ?? 'linear' })
  return sortTrack(next)
}

export function removeKeyAt(track: Track | undefined, t: number, eps = 0.02): Track {
  if (!track) return []
  return track.filter((k) => Math.abs(k.t - t) > eps)
}

export function removeKeyById(track: Track | undefined, id: string): Track {
  if (!track) return []
  return track.filter((k) => k.id !== id)
}

export function moveKey(track: Track, id: string, t: number, maxTime: number): Track {
  const next = track.map((k) => (k.id === id ? { ...k, t: clamp(t, 0, maxTime) } : k))
  return sortTrack(next)
}

export function setKeyEase(track: Track, id: string, ease: Ease): Track {
  return track.map((k) => (k.id === id ? { ...k, ease } : k))
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function round(v: number, digits = 2): number {
  const f = Math.pow(10, digits)
  return Math.round(v * f) / f
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds)
  const whole = Math.floor(s)
  const ms = Math.floor((s - whole) * 1000)
  const mm = Math.floor(whole / 60)
  const ss = whole % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export function propStep(prop: PropName): number {
  switch (prop) {
    case 'scale':
      return 0.05
    case 'opacity':
      return 0.05
    case 'rotation':
      return 1
    default:
      return 1
  }
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`
}
