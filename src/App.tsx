import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react'
import ExportDialog from './components/ExportDialog'
import Inspector from './components/Inspector'
import LayerPanel from './components/LayerPanel'
import Stage from './components/Stage'
import Timeline from './components/Timeline'
import {
  PRESETS,
  createImageLayer,
  createProject,
  createTextLayer,
  materializeTracks,
  type PresetId,
} from './lib/defaults'
import { decodeGif, decodeImage } from './lib/gif'
import {
  clamp,
  moveKey,
  removeKeyById,
  sampleProps,
  sampleTrack,
  setKey,
  setKeyEase,
  uid,
} from './lib/keyframes'
import { cutRanges, snapRangeToFrames, type Range } from './lib/trim'
import type { Ease, GifSource, Layer, Project, PropName, TextProps } from './lib/types'

type CommitOptions = { transient?: boolean }

export default function App() {
  const [project, setProject] = useState<Project>(() => createProject())
  const projectRef = useRef(project)
  const undoRef = useRef<Project[]>([])
  const redoRef = useRef<Project[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [time, setTime] = useState(0)
  const timeRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [showChrome, setShowChrome] = useState(true)
  const [exportOpen, setExportOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [historyTick, setHistoryTick] = useState(0)
  const [range, setRange] = useState<Range | null>(null)
  const gifInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const notify = useCallback((message: string) => setStatus(message), [])

  useEffect(() => {
    if (!status) return
    const id = window.setTimeout(() => setStatus(null), 4000)
    return () => window.clearTimeout(id)
  }, [status])

  const commit = useCallback(
    (updater: (prev: Project) => Project, options?: CommitOptions) => {
      const prev = projectRef.current
      const next = updater(prev)
      if (next === prev) return
      if (!options?.transient) {
        undoRef.current.push(prev)
        if (undoRef.current.length > 100) undoRef.current.shift()
        redoRef.current = []
        setHistoryTick((t) => t + 1)
      }
      projectRef.current = next
      setProject(next)
    },
    [],
  )

  const seek = useCallback((t: number) => {
    const dur = Math.max(0.0001, projectRef.current.duration)
    const clamped = clamp(t, 0, dur)
    timeRef.current = clamped
    setTime(clamped)
  }, [])

  const undo = useCallback(() => {
    const prev = undoRef.current.pop()
    if (!prev) return
    redoRef.current.push(projectRef.current)
    projectRef.current = prev
    setProject(prev)
    const clamped = clamp(timeRef.current, 0, Math.max(0.0001, prev.duration))
    timeRef.current = clamped
    setTime(clamped)
    setHistoryTick((t) => t + 1)
  }, [])

  const redo = useCallback(() => {
    const next = redoRef.current.pop()
    if (!next) return
    undoRef.current.push(projectRef.current)
    projectRef.current = next
    setProject(next)
    setHistoryTick((t) => t + 1)
  }, [])

  // Playback loop.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.12, (now - last) / 1000)
      last = now
      const dur = Math.max(0.05, projectRef.current.duration)
      let next = timeRef.current + dt
      if (next >= dur) next -= dur * Math.floor(next / dur)
      timeRef.current = next
      setTime(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const selectedLayer = useMemo(
    () => project.layers.find((l) => l.id === selectedId) ?? null,
    [project.layers, selectedId],
  )

  const patchLayer = useCallback(
    (layerId: string, updater: (layer: Layer) => Layer, options?: CommitOptions) => {
      commit(
        (prev) => ({
          ...prev,
          layers: prev.layers.map((l) => (l.id === layerId ? updater(l) : l)),
        }),
        options,
      )
    },
    [commit],
  )

  /** Write a property value: straight to base, or as a keyframe at the playhead. */
  const setPropValue = useCallback(
    (layerId: string, prop: PropName, value: number, options?: CommitOptions) => {
      const t = timeRef.current
      patchLayer(
        layerId,
        (layer) => {
          const track = layer.tracks[prop]
          if (track) {
            return { ...layer, tracks: { ...layer.tracks, [prop]: setKey(track, t, value) } }
          }
          return { ...layer, base: { ...layer.base, [prop]: value } }
        },
        options,
      )
    },
    [patchLayer],
  )

  const toggleTrack = useCallback(
    (layerId: string, prop: PropName) => {
      const t = timeRef.current
      patchLayer(layerId, (layer) => {
        const track = layer.tracks[prop]
        if (track) {
          const baked = sampleTrack(track, layer.base[prop], t)
          const tracks = { ...layer.tracks }
          delete tracks[prop]
          return { ...layer, tracks, base: { ...layer.base, [prop]: baked } }
        }
        return {
          ...layer,
          tracks: {
            ...layer.tracks,
            [prop]: [{ id: uid('k'), t, v: layer.base[prop], ease: 'linear' }],
          },
        }
      })
    },
    [patchLayer],
  )

  const addLayer = useCallback(
    (layer: Layer, options?: { replaceTiming?: GifSource }) => {
      commit((prev) => {
        const next: Project = { ...prev, layers: [...prev.layers, layer] }
        const hasAnimatedSource = prev.layers.some(
          (l) => l.type === 'image' && l.source && !l.source.still,
        )
        if (options?.replaceTiming && !hasAnimatedSource) {
          next.width = options.replaceTiming.width
          next.height = options.replaceTiming.height
          next.delays = options.replaceTiming.frames.map((f) => f.delay)
          next.frameTimes = options.replaceTiming.frames.map((_, i) =>
            options.replaceTiming!.frames.slice(0, i).reduce((sum, f) => sum + f.delay, 0) / 1000,
          )
          next.duration = options.replaceTiming.total / 1000
          next.loop = 0
        }
        return next
      })
      setSelectedId(layer.id)
      setRange(null)
      seek(0)
    },
    [commit, seek],
  )

  const loadGif = useCallback(
    async (file: File) => {
      setBusy('Decoding the GIF…')
      try {
        const source = await decodeGif(file, file.name)
        addLayer(createImageLayer(source), { replaceTiming: source })
        notify(`Loaded ${source.name}: ${source.frames.length} frames, ${source.width}×${source.height}`)
      } catch (err) {
        notify(`Could not read the GIF: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        setBusy(null)
      }
    },
    [addLayer, notify],
  )

  const loadImage = useCallback(
    async (file: File) => {
      setBusy('Reading the image…')
      try {
        const source = await decodeImage(file, file.name)
        addLayer(createImageLayer(source), { replaceTiming: source })
      } catch (err) {
        notify(`Could not read the image: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        setBusy(null)
      }
    },
    [addLayer, notify],
  )

  const addText = useCallback(() => {
    const layer = createTextLayer('Your text', projectRef.current)
    commit((prev) => ({ ...prev, layers: [...prev.layers, layer] }))
    setSelectedId(layer.id)
  }, [commit])

  const deleteLayer = useCallback(
    (layerId: string) => {
      commit((prev) => ({ ...prev, layers: prev.layers.filter((l) => l.id !== layerId) }))
      setSelectedId((current) => (current === layerId ? null : current))
    },
    [commit],
  )

  const duplicateLayer = useCallback(
    (layerId: string) => {
      const source = projectRef.current.layers.find((l) => l.id === layerId)
      if (!source) return
      const clone: Layer = {
        ...source,
        id: uid(source.type),
        name: `${source.name} copy`,
        base: { ...source.base, x: source.base.x + 24, y: source.base.y + 24 },
        tracks: Object.fromEntries(
          Object.entries(source.tracks).map(([prop, keys]) => [
            prop,
            (keys ?? []).map((k) => ({ ...k, id: uid('k') })),
          ]),
        ) as Layer['tracks'],
        text: source.text ? { ...source.text } : undefined,
      }
      commit((prev) => ({ ...prev, layers: [...prev.layers, clone] }))
      setSelectedId(clone.id)
    },
    [commit],
  )

  const reorderLayer = useCallback(
    (layerId: string, dir: -1 | 1) => {
      commit((prev) => {
        const index = prev.layers.findIndex((l) => l.id === layerId)
        const target = index + dir
        if (index < 0 || target < 0 || target >= prev.layers.length) return prev
        const layers = [...prev.layers]
        const [item] = layers.splice(index, 1)
        layers.splice(target, 0, item)
        return { ...prev, layers }
      })
    },
    [commit],
  )

  /** Trim the timeline or cut a segment out of it (ripple delete). */
  const applyRange = useCallback(
    (mode: 'keep' | 'cut') => {
      const current = projectRef.current
      if (!range) {
        notify('Set an in and an out point on the timeline first')
        return
      }
      const snapped = snapRangeToFrames(current, range)
      if (!snapped) {
        notify('The selected range does not cover any frame')
        return
      }
      const ranges: Range[] =
        mode === 'keep'
          ? [
              { start: 0, end: snapped.start },
              { start: snapped.end, end: current.duration },
            ]
          : [snapped]
      const result = cutRanges(current, ranges)
      if (!result) {
        notify(
          mode === 'keep'
            ? 'The range already covers the whole timeline'
            : 'Select at least one frame to cut out',
        )
        return
      }
      commit(() => result.project)
      setRange(null)
      seek(Math.min(timeRef.current, result.project.duration))
      notify(
        mode === 'keep'
          ? `Trimmed to ${result.project.delays.length} frames`
          : `Cut out ${result.removedFrames} frame${result.removedFrames === 1 ? '' : 's'}`,
      )
    },
    [commit, notify, range, seek],
  )

  const handleDrop = (e: ReactDragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (file.type === 'image/gif') void loadGif(file)
    else if (file.type.startsWith('image/')) void loadImage(file)
    else notify('Drop a GIF, PNG or JPG file')
  }

  // Keyboard shortcuts.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (typing) return
      if (e.code === 'Space') {
        e.preventDefault()
        setPlaying((p) => !p)
        return
      }
      if (e.key === 'Home') {
        seek(0)
        return
      }
      if (e.key === 'End') {
        seek(projectRef.current.duration)
        return
      }
      if (e.key.toLowerCase() === 'i') {
        setRange((r) => ({
          start: timeRef.current,
          end: Math.max(timeRef.current + 0.001, r?.end ?? projectRef.current.duration),
        }))
        return
      }
      if (e.key.toLowerCase() === 'o') {
        setRange((r) => ({
          start: Math.min(timeRef.current, r?.start ?? 0),
          end: Math.max(timeRef.current, 0.001),
        }))
        return
      }
      if (!selectedId) return
      const step = e.shiftKey ? 10 : 1
      const layer = projectRef.current.layers.find((l) => l.id === selectedId)
      if (!layer) return
      const p = sampleProps(layer, timeRef.current)
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setPropValue(selectedId, 'x', p.x - step)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setPropValue(selectedId, 'x', p.x + step)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setPropValue(selectedId, 'y', p.y - step)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setPropValue(selectedId, 'y', p.y + step)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [redo, undo, seek, selectedId, setPropValue])

  // historyTick is only there to re-render when the undo/redo stacks change.
  const canUndo = historyTick >= 0 && undoRef.current.length > 0
  const canRedo = historyTick >= 0 && redoRef.current.length > 0

  return (
    <div className="app" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      <header className="app-bar">
        <div className="brand">
          <span className="brand-mark">GIF</span>
          <span className="brand-name">Studio</span>
        </div>
        <div className="app-bar-actions">
          <button type="button" className="btn" onClick={() => gifInputRef.current?.click()}>
            Import GIF
          </button>
          <button type="button" className="btn" onClick={() => imageInputRef.current?.click()}>
            Import image
          </button>
          <button type="button" className="btn" onClick={addText}>
            + Text
          </button>
          <span className="divider" />
          <button type="button" className="btn ghost" disabled={!canUndo} onClick={undo}>
            Undo
          </button>
          <button type="button" className="btn ghost" disabled={!canRedo} onClick={redo}>
            Redo
          </button>
          <span className="divider" />
          <label className="bg-control" title="Canvas background colour">
            Background
            <input
              type="color"
              value={project.background ?? '#ffffff'}
              onChange={(e) => commit((prev) => ({ ...prev, background: e.target.value }))}
            />
            <button
              type="button"
              className={`chip ${project.background === null ? 'is-on' : ''}`}
              onClick={() => commit((prev) => ({ ...prev, background: null }))}
              title="Use a transparent background"
            >
              Transparent
            </button>
          </label>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setShowChrome((v) => !v)}
            title="Show or hide the selection outline"
          >
            {showChrome ? 'Hide outline' : 'Show outline'}
          </button>
          <button type="button" className="btn primary" onClick={() => setExportOpen(true)}>
            Export GIF
          </button>
        </div>
        <input
          ref={gifInputRef}
          type="file"
          accept="image/gif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void loadGif(file)
            e.target.value = ''
          }}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void loadImage(file)
            e.target.value = ''
          }}
        />
      </header>

      <div className="playbar">
        <button
          type="button"
          className="btn primary play-btn"
          onClick={() => setPlaying((p) => !p)}
          title="Play / pause (Space)"
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button type="button" className="btn ghost" onClick={() => seek(0)}>
          ⏮ Start
        </button>
        <label className="inline-field">
          Canvas
          <input
            className="num-input"
            type="number"
            min={16}
            max={2048}
            value={project.width}
            onChange={(e) => {
              const v = Math.max(16, Math.min(2048, Number(e.target.value) || 16))
              commit((prev) => ({ ...prev, width: v }))
            }}
          />
          ×
          <input
            className="num-input"
            type="number"
            min={16}
            max={2048}
            value={project.height}
            onChange={(e) => {
              const v = Math.max(16, Math.min(2048, Number(e.target.value) || 16))
              commit((prev) => ({ ...prev, height: v }))
            }}
          />
        </label>
        <span className="hint">
          Drop a file anywhere to import · Space plays · Arrows nudge · I / O set the trim range
        </span>
      </div>

      <main className="workspace">
        <aside className="sidebar left">
          <div className="sidebar-head">
            <span>Layers</span>
            <span className="count">{project.layers.length}</span>
          </div>
          <LayerPanel
            project={project}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onToggleVisible={(id) => patchLayer(id, (l) => ({ ...l, visible: !l.visible }))}
            onDelete={deleteLayer}
            onDuplicate={duplicateLayer}
          />
        </aside>

        <section className="canvas-area">
          <Stage
            project={project}
            time={time}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onBeginTransform={() => {
              undoRef.current.push(projectRef.current)
              redoRef.current = []
              setHistoryTick((t) => t + 1)
            }}
            onDrag={(layerId, payload, transient) =>
              setPropValue(layerId, payload.prop, payload.value, { transient })
            }
            showChrome={showChrome}
          />
        </section>

        <aside className="sidebar right">
          {selectedLayer ? (
            <Inspector
              project={project}
              layer={selectedLayer}
              time={time}
              onRename={(name) => patchLayer(selectedLayer.id, (l) => ({ ...l, name }))}
              onToggleVisible={() =>
                patchLayer(selectedLayer.id, (l) => ({ ...l, visible: !l.visible }))
              }
              onDelete={() => deleteLayer(selectedLayer.id)}
              onReorder={(dir) => reorderLayer(selectedLayer.id, dir)}
              onPropValue={(prop, value) => setPropValue(selectedLayer.id, prop, value)}
              onToggleTrack={(prop) => toggleTrack(selectedLayer.id, prop)}
              onDeleteKey={(prop, keyId) =>
                patchLayer(selectedLayer.id, (l) => ({
                  ...l,
                  tracks: { ...l.tracks, [prop]: removeKeyById(l.tracks[prop], keyId) },
                }))
              }
              onSetEase={(prop, keyId, ease: Ease) =>
                patchLayer(selectedLayer.id, (l) => ({
                  ...l,
                  tracks: {
                    ...l.tracks,
                    [prop]: l.tracks[prop] ? setKeyEase(l.tracks[prop]!, keyId, ease) : undefined,
                  },
                }))
              }
              onSeek={seek}
              onText={(patch: Partial<TextProps>) =>
                patchLayer(selectedLayer.id, (l) => ({
                  ...l,
                  text: l.text ? { ...l.text, ...patch } : l.text,
                  name:
                    patch.content !== undefined && l.type === 'text'
                      ? patch.content.slice(0, 12) || 'Text'
                      : l.name,
                }))
              }
              onLayerPatch={(patch) => patchLayer(selectedLayer.id, (l) => ({ ...l, ...patch }))}
              onApplyPreset={(id: PresetId) => {
                const preset = PRESETS.find((p) => p.id === id)
                if (!preset) return
                patchLayer(selectedLayer.id, (l) => ({
                  ...l,
                  tracks: {
                    ...l.tracks,
                    ...materializeTracks(preset.apply(projectRef.current, timeRef.current)),
                  },
                }))
              }}
              onClearTracks={() => patchLayer(selectedLayer.id, (l) => ({ ...l, tracks: {} }))}
              onUseTiming={() => {
                const source = selectedLayer.source
                if (!source) return
                commit((prev) => ({
                  ...prev,
                  width: source.width,
                  height: source.height,
                  delays: source.frames.map((f) => f.delay),
                  frameTimes: source.frames.map(
                    (_, i) =>
                      source.frames.slice(0, i).reduce((sum, f) => sum + f.delay, 0) / 1000,
                  ),
                  duration: source.total / 1000,
                }))
                setRange(null)
                seek(0)
              }}
            />
          ) : (
            <div className="inspector empty">
              <h2>Getting started</h2>
              <ol className="help-list">
                <li>Import a GIF (or a PNG / JPG) as the base layer.</li>
                <li>Add a text layer with “+ Text” and drag it where you want it.</li>
                <li>
                  Move the playhead, click the <b>◆</b> next to a property to add a keyframe, then
                  change the value to animate it.
                </li>
                <li>
                  Select a range on the timeline (I / O) and use “Trim to range” or “Cut out” to
                  remove unwanted segments.
                </li>
                <li>Drag keyframes on the timeline to retime them, Alt + click to delete.</li>
                <li>Export the GIF — size, colours, loop count and speed are all adjustable.</li>
              </ol>
              <p className="panel-hint">
                Everything runs locally in your browser; your files are never uploaded.
              </p>
            </div>
          )}
        </aside>
      </main>

      <footer className="timeline-wrap">
        <Timeline
          project={project}
          time={time}
          selectedId={selectedId}
          playing={playing}
          range={range}
          onSeek={seek}
          onSelect={setSelectedId}
          onRangeChange={setRange}
          onApplyRange={applyRange}
          onMoveKey={(layerId, prop, keyId, t, transient) =>
            patchLayer(
              layerId,
              (l) => ({
                ...l,
                tracks: {
                  ...l.tracks,
                  [prop]: l.tracks[prop]
                    ? moveKey(l.tracks[prop]!, keyId, t, projectRef.current.duration)
                    : l.tracks[prop],
                },
              }),
              { transient },
            )
          }
          onDeleteKey={(layerId, prop, keyId) =>
            patchLayer(layerId, (l) => ({
              ...l,
              tracks: { ...l.tracks, [prop]: removeKeyById(l.tracks[prop], keyId) },
            }))
          }
        />
      </footer>

      {exportOpen && (
        <ExportDialog
          project={project}
          time={time}
          onClose={() => setExportOpen(false)}
          onNotify={notify}
        />
      )}

      {busy && (
        <div className="busy-overlay">
          <div className="busy-card">
            <div className="spinner" />
            <span>{busy}</span>
          </div>
        </div>
      )}

      {status && <div className="toast">{status}</div>}
    </div>
  )
}
