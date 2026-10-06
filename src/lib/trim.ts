import { sortTrack } from './keyframes'
import { PROP_NAMES, type Layer, type Project, type Track } from './types'

/** A range on the edited timeline, in seconds. */
export type Range = { start: number; end: number }

const EPS = 1e-6

/** Start/end time of every output frame, in seconds. */
export function frameBounds(delays: number[]): Range[] {
  const out: Range[] = []
  let acc = 0
  for (const delay of delays) {
    const start = acc / 1000
    acc += Math.max(20, delay)
    out.push({ start, end: acc / 1000 })
  }
  return out
}

/** Grow a range so that it always covers whole frames. */
export function snapRangeToFrames(project: Project, range: Range): Range | null {
  const bounds = frameBounds(project.delays)
  if (bounds.length === 0) return null
  const start = Math.min(range.start, range.end)
  const end = Math.max(range.start, range.end)
  const firstIndex = bounds.findIndex((b) => b.end > start + EPS)
  if (firstIndex < 0) return null
  let lastIndex = -1
  for (let i = bounds.length - 1; i >= 0; i--) {
    if (bounds[i].start < end - EPS) {
      lastIndex = i
      break
    }
  }
  if (lastIndex < firstIndex) return null
  return { start: bounds[firstIndex].start, end: bounds[lastIndex].end }
}

export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges
    .map((r) => ({ start: Math.min(r.start, r.end), end: Math.max(r.start, r.end) }))
    .filter((r) => r.end - r.start > EPS)
    .sort((a, b) => a.start - b.start)
  const out: Range[] = []
  for (const range of sorted) {
    const last = out[out.length - 1]
    if (last && range.start <= last.end + EPS) {
      last.end = Math.max(last.end, range.end)
    } else {
      out.push({ ...range })
    }
  }
  return out
}

/** Frames that a set of removed ranges would drop (a frame is dropped when it starts inside one). */
export function framesRemovedBy(project: Project, ranges: Range[]): number {
  const cuts = mergeRanges(ranges)
  if (cuts.length === 0) return 0
  return frameBounds(project.delays).filter((b) => isFrameCut(b.start, cuts)).length
}

/** A frame is removed when its start time falls inside a removed range. */
function isFrameCut(start: number, cuts: Range[]): boolean {
  return cuts.some((range) => start >= range.start - EPS && start < range.end - EPS)
}

/** A keyframe is removed when it sits strictly inside a removed range. */
function isKeyCut(t: number, cuts: Range[]): boolean {
  return cuts.some((range) => t > range.start + EPS && t < range.end - EPS)
}

export type CutResult = {
  project: Project
  removedFrames: number
  removedTime: number
}

/**
 * Remove one or more ranges from the timeline (ripple delete):
 *
 * - output frames whose start falls inside a removed range are dropped,
 * - keyframes inside a removed range are dropped,
 * - keyframes after a removed range move back by the removed duration.
 *
 * Returns `null` when the edit would change nothing or would delete every frame.
 */
export function cutRanges(project: Project, ranges: Range[]): CutResult | null {
  const cuts = mergeRanges(ranges)
  if (cuts.length === 0) return null

  const bounds = frameBounds(project.delays)
  if (bounds.length === 0) return null

  const removedBefore = (t: number) =>
    cuts.reduce((sum, r) => sum + Math.max(0, Math.min(t, r.end) - r.start), 0)

  const kept = bounds
    .map((bound, index) => ({ ...bound, index }))
    .filter((frame) => !isFrameCut(frame.start, cuts))

  if (kept.length === 0) return null
  if (kept.length === bounds.length) return null

  const trimTrack = (track: Track): Track =>
    sortTrack(
      track
        .filter((key) => !isKeyCut(key.t, cuts))
        .map((key) => ({ ...key, t: Math.max(0, key.t - removedBefore(key.t)) })),
    )

  const layers: Layer[] = project.layers.map((layer) => {
    const tracks: Layer['tracks'] = {}
    for (const prop of PROP_NAMES) {
      const track = layer.tracks[prop]
      if (!track || track.length === 0) continue
      const next = trimTrack(track)
      if (next.length > 0) tracks[prop] = next
    }
    return { ...layer, tracks }
  })

  const delays = kept.map((frame) => project.delays[frame.index])
  const frameTimes = kept.map((frame) => project.frameTimes[frame.index] ?? frame.start)
  const duration = delays.reduce((sum, d) => sum + d, 0) / 1000

  return {
    project: { ...project, delays, frameTimes, duration, layers },
    removedFrames: bounds.length - kept.length,
    removedTime: removedBefore(project.duration + 1),
  }
}
