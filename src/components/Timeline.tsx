import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { formatTime } from '../lib/keyframes'
import type { Range } from '../lib/trim'
import { frameBounds, framesRemovedBy } from '../lib/trim'
import { PROP_LABELS, PROP_NAMES, type Layer, type Project, type PropName } from '../lib/types'

type Props = {
  project: Project
  time: number
  selectedId: string | null
  playing: boolean
  range: Range | null
  onSeek: (t: number) => void
  onSelect: (id: string | null) => void
  onMoveKey: (layerId: string, prop: PropName, keyId: string, t: number, transient: boolean) => void
  onDeleteKey: (layerId: string, prop: PropName, keyId: string) => void
  onRangeChange: (range: Range | null) => void
  onApplyRange: (mode: 'keep' | 'cut') => void
}

const LABEL_WIDTH = 168

function niceStep(duration: number): number {
  const candidates = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]
  for (const c of candidates) {
    if (duration / c <= 12) return c
  }
  return 10
}

export default function Timeline({
  project,
  time,
  selectedId,
  playing,
  range,
  onSeek,
  onSelect,
  onMoveKey,
  onDeleteKey,
  onRangeChange,
  onApplyRange,
}: Props) {
  const laneRef = useRef<HTMLDivElement>(null)
  const dragKeyRef = useRef<{ layerId: string; prop: PropName; keyId: string } | null>(null)
  const dragRangeRef = useRef<'start' | 'end' | null>(null)
  const scrubbingRef = useRef(false)
  const rangeRef = useRef(range)
  rangeRef.current = range

  const duration = Math.max(0.05, project.duration)
  const step = useMemo(() => niceStep(duration), [duration])
  const fps = useMemo(() => {
    const total = project.delays.reduce((s, d) => s + d, 0)
    if (project.delays.length === 0 || total <= 0) return 0
    return 1000 / (total / project.delays.length)
  }, [project.delays])

  const ticks = useMemo(() => {
    const out: number[] = []
    for (let t = 0; t <= duration + 1e-6; t += step) out.push(Math.round(t * 1000) / 1000)
    return out
  }, [duration, step])

  const frameTicks = useMemo(() => frameBounds(project.delays).map((b) => b.start).slice(1), [
    project.delays,
  ])

  const rangeFrameCount = useMemo(
    () => (range ? framesRemovedBy(project, [range]) : 0),
    [range, project],
  )

  const timeFromEvent = useCallback(
    (clientX: number) => {
      const el = laneRef.current
      if (!el) return 0
      const rect = el.getBoundingClientRect()
      const ratio = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width
      return Math.min(duration, Math.max(0, ratio * duration))
    },
    [duration],
  )

  // Keep the latest callbacks in a ref so the window listeners are bound once.
  const handlersRef = useRef({ onSeek, onMoveKey, onRangeChange, timeFromEvent })
  handlersRef.current = { onSeek, onMoveKey, onRangeChange, timeFromEvent }

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const handlers = handlersRef.current
      const t = handlers.timeFromEvent(e.clientX)
      if (dragRangeRef.current) {
        const edge = dragRangeRef.current
        const next = {
          start: edge === 'start' ? t : rangeRef.current?.start ?? 0,
          end: edge === 'end' ? t : rangeRef.current?.end ?? duration,
        }
        handlers.onRangeChange(next)
        return
      }
      if (scrubbingRef.current) {
        handlers.onSeek(t)
        return
      }
      const drag = dragKeyRef.current
      if (!drag) return
      handlers.onMoveKey(drag.layerId, drag.prop, drag.keyId, Math.round(t * 1000) / 1000, true)
    }
    const onUp = () => {
      scrubbingRef.current = false
      dragKeyRef.current = null
      dragRangeRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [duration])

  const startScrub = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).dataset.keyframe) return
    scrubbingRef.current = true
    onSeek(timeFromEvent(e.clientX))
  }

  const rows = project.layers.map((layer) => {
    const animated = PROP_NAMES.filter((p) => (layer.tracks[p]?.length ?? 0) > 0)
    return { layer, animated }
  })

  const percent = (t: number) => `${(Math.min(Math.max(t, 0), duration) / duration) * 100}%`
  const rangeStyle: CSSProperties | null = range
    ? {
        left: percent(Math.min(range.start, range.end)),
        width: `${(Math.abs(range.end - range.start) / duration) * 100}%`,
      }
    : null

  return (
    <div className="timeline" style={{ '--label-width': `${LABEL_WIDTH}px` } as CSSProperties}>
      <div className="timeline-toolbar">
        <div className="timeline-time">
          <span className="timeline-time-main">{formatTime(time)}</span>
          <span className="timeline-time-sub">/ {formatTime(duration)}</span>
        </div>
        <span className="timeline-meta">
          {project.delays.length} frames · {fps.toFixed(1)} fps
        </span>
        <div className="trim-tools">
          <button
            type="button"
            className="btn ghost tiny"
            title="Use the playhead as the in point (shortcut: I)"
            onClick={() =>
              onRangeChange({
                start: time,
                end: Math.max(time + 0.001, range?.end ?? duration),
              })
            }
          >
            Set in
          </button>
          <button
            type="button"
            className="btn ghost tiny"
            title="Use the playhead as the out point (shortcut: O)"
            onClick={() =>
              onRangeChange({
                start: Math.min(time, range?.start ?? 0),
                end: Math.max(time, 0.001),
              })
            }
          >
            Set out
          </button>
          <button
            type="button"
            className="btn tiny"
            disabled={!range || rangeFrameCount >= project.delays.length}
            title="Delete everything outside the range"
            onClick={() => onApplyRange('keep')}
          >
            Trim to range
          </button>
          <button
            type="button"
            className="btn tiny danger"
            disabled={!range || rangeFrameCount === 0}
            title="Delete the frames inside the range and close the gap"
            onClick={() => onApplyRange('cut')}
          >
            Cut out
          </button>
          <button
            type="button"
            className="btn ghost tiny"
            disabled={!range}
            onClick={() => onRangeChange(null)}
          >
            Clear
          </button>
          {range && (
            <span className="trim-info">
              {Math.min(range.start, range.end).toFixed(2)}s –{' '}
              {Math.max(range.start, range.end).toFixed(2)}s · {rangeFrameCount}{' '}
              {rangeFrameCount === 1 ? 'frame' : 'frames'} selected
            </span>
          )}
        </div>
        <span className="timeline-playstate">{playing ? 'Playing' : 'Paused'}</span>
      </div>

      <div className="timeline-body">
        <div className="timeline-labels">
          <div className="timeline-ruler-label">Layer / property</div>
          {rows.map(({ layer, animated }) => (
            <div key={layer.id} className="timeline-label-group">
              <button
                type="button"
                className={`timeline-layer-name ${selectedId === layer.id ? 'is-selected' : ''}`}
                onClick={() => onSelect(layer.id)}
              >
                <span className={`dot ${layer.visible ? '' : 'is-off'}`} />
                <span className="truncate">{layer.name}</span>
              </button>
              {animated.map((prop) => (
                <div key={prop} className="timeline-prop-name">
                  {PROP_LABELS[prop]}
                </div>
              ))}
            </div>
          ))}
          {project.layers.length === 0 && <div className="timeline-empty-label">No layers yet</div>}
        </div>

        <div className="timeline-lanes" ref={laneRef} onPointerDown={startScrub}>
          <div className="timeline-ruler">
            {ticks.map((t) => (
              <div key={t} className="timeline-tick" style={{ left: percent(t) }}>
                <span>{t.toFixed(step < 1 ? (step < 0.25 ? 2 : 1) : 0)}s</span>
              </div>
            ))}
            {frameTicks.map((t, i) => (
              <div key={`f${i}`} className="timeline-frame-tick" style={{ left: percent(t) }} />
            ))}
          </div>

          {rows.map(({ layer, animated }) => (
            <div key={layer.id} className="timeline-row-group">
              <div className={`timeline-lane ${selectedId === layer.id ? 'is-selected' : ''}`}>
                {layer.tracks.x?.length || layer.tracks.y?.length ? (
                  <div className="timeline-hint">Position keyframes: X / Y</div>
                ) : null}
              </div>
              {animated.map((prop) => (
                <div key={prop} className="timeline-lane timeline-lane-prop">
                  {(layer.tracks[prop] ?? []).map((key) => (
                    <button
                      key={key.id}
                      type="button"
                      data-keyframe="1"
                      className={`keyframe ${time >= key.t ? 'is-past' : ''}`}
                      style={{ left: percent(key.t) }}
                      title={`${PROP_LABELS[prop]} @ ${key.t.toFixed(2)}s (click to jump, drag to retime, Alt+click to delete)`}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        if (e.altKey) {
                          onDeleteKey(layer.id, prop, key.id)
                          return
                        }
                        onSelect(layer.id)
                        onSeek(key.t)
                        dragKeyRef.current = { layerId: layer.id, prop, keyId: key.id }
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
          {project.layers.length === 0 && <div className="timeline-lane" style={{ height: 40 }} />}

          {rangeStyle && (
            <div className="range-band" style={rangeStyle}>
              <div
                className="range-handle is-start"
                title="Drag to change the in point"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  dragRangeRef.current = 'start'
                }}
              />
              <div
                className="range-handle is-end"
                title="Drag to change the out point"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  dragRangeRef.current = 'end'
                }}
              />
            </div>
          )}

          <div className="playhead" style={{ left: percent(time) }}>
            <div className="playhead-head" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function layerIsAnimated(layer: Layer): boolean {
  return PROP_NAMES.some((p) => (layer.tracks[p]?.length ?? 0) > 0)
}
