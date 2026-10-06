import { useState } from 'react'
import { DEFAULT_EXPORT, exportGif, exportPng, type ExportOptions } from '../lib/encode'
import { downloadBlob } from '../lib/gif'
import type { Project } from '../lib/types'

type Props = {
  project: Project
  /** Current playhead position, used by the PNG export. */
  time: number
  onClose: () => void
  onNotify: (message: string) => void
}

export default function ExportDialog({ project, time, onClose, onNotify }: Props) {
  const [options, setOptions] = useState<ExportOptions>({
    ...DEFAULT_EXPORT,
    transparent: project.background === null,
    loop: project.loop,
  })
  const [name, setName] = useState('gif-studio')
  const [scale, setScale] = useState(1)
  const [progress, setProgress] = useState<{ ratio: number; message: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const busy = progress !== null && progress.ratio < 1
  const outWidth = Math.max(1, Math.round(project.width * options.scale))
  const outHeight = Math.max(1, Math.round(project.height * options.scale))
  const speed = options.speed ?? 1

  const run = async () => {
    setError(null)
    setProgress({ ratio: 0, message: 'Preparing…' })
    try {
      const blob = await exportGif(
        project,
        { ...options, transparent: project.background === null && options.transparent },
        (ratio, message) => setProgress({ ratio, message }),
      )
      downloadBlob(blob, `${name || 'gif-studio'}.gif`)
      onNotify(`Exported ${project.delays.length} frames (${(blob.size / 1024).toFixed(0)} KB)`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      window.setTimeout(() => setProgress(null), 800)
    }
  }

  const runPng = async () => {
    try {
      const blob = await exportPng(project, time, options.scale)
      downloadBlob(blob, `${name || 'gif-studio'}-frame.png`)
      onNotify('Exported the current frame as a PNG')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => (!busy ? onClose() : null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Export</h2>
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </header>

        <div className="modal-body">
          <div className="field-row">
            <label>File name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field-row">
            <label>Size</label>
            <span className="mono">
              {outWidth}×{outHeight}
            </span>
          </div>
          <div className="field-row">
            <label>Scale</label>
            <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={1.5}>1.5×</option>
              <option value={2}>2×</option>
            </select>
          </div>
          <div className="field-row">
            <label>Colors</label>
            <select
              value={options.colors}
              onChange={(e) => setOptions({ ...options, colors: Number(e.target.value) })}
            >
              <option value={64}>64 (smaller file)</option>
              <option value={128}>128</option>
              <option value={256}>256 (best)</option>
            </select>
          </div>
          <div className="field-row">
            <label>Loops</label>
            <select
              value={options.loop}
              onChange={(e) => setOptions({ ...options, loop: Number(e.target.value) })}
            >
              <option value={0}>Forever</option>
              <option value={1}>1 time</option>
              <option value={3}>3 times</option>
              <option value={-1}>Play once</option>
            </select>
          </div>
          <div className="field-row">
            <label>Speed</label>
            <select
              value={speed}
              onChange={(e) => setOptions({ ...options, speed: Number(e.target.value) })}
            >
              <option value={0.5}>0.5× (slower)</option>
              <option value={1}>1× (original)</option>
              <option value={2}>2× (faster)</option>
            </select>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={options.transparent}
              disabled={project.background !== null}
              onChange={(e) => setOptions({ ...options, transparent: e.target.checked })}
            />
            Keep the transparent background
          </label>
          {project.background !== null && (
            <p className="panel-hint">
              The project has a solid background colour, so the GIF will include it.
            </p>
          )}

          <p className="panel-hint">
            {project.delays.length} frames · {(project.duration / speed).toFixed(2)}s total (speed
            scales every frame delay).
          </p>

          {progress && (
            <div className="progress">
              <div className="progress-bar" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
              <span className="progress-label">{progress.message}</span>
            </div>
          )}
          {error && <p className="error-text">{error}</p>}
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn ghost" onClick={runPng} disabled={busy}>
            Export current frame as PNG
          </button>
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={run} disabled={busy}>
            {busy ? 'Exporting…' : 'Export GIF'}
          </button>
        </footer>
      </div>
    </div>
  )
}
