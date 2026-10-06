import { useState } from 'react'
import { FONT_STACKS, PRESETS, type PresetId } from '../lib/defaults'
import { formatTime, hasKeyAt, round, sampleTrack } from '../lib/keyframes'
import {
  PROP_LABELS,
  PROP_NAMES,
  type Ease,
  type Layer,
  type Project,
  type PropName,
  type TextProps,
} from '../lib/types'

type Props = {
  project: Project
  layer: Layer
  time: number
  onRename: (name: string) => void
  onToggleVisible: () => void
  onDelete: () => void
  onReorder: (dir: -1 | 1) => void
  onPropValue: (prop: PropName, value: number) => void
  onToggleTrack: (prop: PropName) => void
  onDeleteKey: (prop: PropName, keyId: string) => void
  onSetEase: (prop: PropName, keyId: string, ease: Ease) => void
  onSeek: (t: number) => void
  onText: (patch: Partial<TextProps>) => void
  onLayerPatch: (patch: Partial<Layer>) => void
  onApplyPreset: (id: PresetId) => void
  onClearTracks: () => void
  onUseTiming?: () => void
}

const EASES: { value: Ease; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'easeInOut', label: 'Ease in-out' },
  { value: 'hold', label: 'Hold (step)' },
]

function NumberInput({
  value,
  onCommit,
  step = 1,
  min,
  max,
}: {
  value: number
  onCommit: (v: number) => void
  step?: number
  min?: number
  max?: number
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className="num-input"
      type="number"
      step={step}
      min={min}
      max={max}
      value={draft ?? String(round(value, 3))}
      onChange={(e) => {
        setDraft(e.target.value)
        const n = Number.parseFloat(e.target.value)
        if (!Number.isNaN(n)) onCommit(n)
      }}
      onBlur={() => setDraft(null)}
    />
  )
}

type Range = { min: number; max: number; step: number }

function propRange(prop: PropName, project: Project): Range {
  switch (prop) {
    case 'scale':
      return { min: 0.05, max: 3, step: 0.01 }
    case 'rotation':
      return { min: -180, max: 180, step: 1 }
    case 'opacity':
      return { min: 0, max: 1, step: 0.01 }
    case 'x':
      return { min: -project.width, max: project.width, step: 1 }
    default:
      return { min: -project.height, max: project.height, step: 1 }
  }
}

function propValue(layer: Layer, prop: PropName, time: number): number {
  return sampleTrack(layer.tracks[prop], layer.base[prop], time)
}

export default function Inspector(props: Props) {
  const {
    project,
    layer,
    time,
    onRename,
    onToggleVisible,
    onDelete,
    onReorder,
    onPropValue,
    onToggleTrack,
    onDeleteKey,
    onSetEase,
    onSeek,
    onText,
    onLayerPatch,
    onApplyPreset,
    onClearTracks,
    onUseTiming,
  } = props

  const text = layer.text
  const animated = PROP_NAMES.some((p) => (layer.tracks[p]?.length ?? 0) > 0)

  return (
    <div className="inspector">
      <div className="inspector-head">
        <input
          className="layer-name-input"
          value={layer.name}
          onChange={(e) => onRename(e.target.value)}
        />
        <div className="inspector-head-actions">
          <button type="button" className="icon-btn" title="Move layer up" onClick={() => onReorder(1)}>
            ↑
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Move layer down"
            onClick={() => onReorder(-1)}
          >
            ↓
          </button>
          <button
            type="button"
            className={`icon-btn ${layer.visible ? '' : 'is-off'}`}
            title={layer.visible ? 'Hide layer' : 'Show layer'}
            onClick={onToggleVisible}
          >
            {layer.visible ? '👁' : '🚫'}
          </button>
          <button type="button" className="icon-btn danger" title="Delete layer" onClick={onDelete}>
            ✕
          </button>
        </div>
      </div>

      <section className="panel">
        <header className="panel-title">
          <span>Transform keyframes</span>
          {animated && (
            <button type="button" className="link-btn" onClick={onClearTracks}>
              Clear all keyframes
            </button>
          )}
        </header>

        {PROP_NAMES.map((prop) => {
          const track = layer.tracks[prop]
          const range = propRange(prop, project)
          const value = propValue(layer, prop, time)
          const onKey = hasKeyAt(track, time)
          const activeKey = track?.find((k) => Math.abs(k.t - time) <= 0.02)
          return (
            <div key={prop} className="prop-row">
              <div className="prop-line">
                <span className="prop-label">{PROP_LABELS[prop]}</span>
                <input
                  className="prop-slider"
                  type="range"
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  value={value}
                  onChange={(e) => onPropValue(prop, Number.parseFloat(e.target.value))}
                />
                <NumberInput
                  value={value}
                  step={range.step}
                  min={prop === 'opacity' ? 0 : undefined}
                  onCommit={(v) => onPropValue(prop, v)}
                />
                <button
                  type="button"
                  className={`key-btn ${track ? 'is-track' : ''} ${onKey ? 'is-on' : ''}`}
                  title={
                    track
                      ? 'Remove animation from this property'
                      : 'Add a keyframe at the playhead'
                  }
                  onClick={() => onToggleTrack(prop)}
                >
                  ◆
                </button>
              </div>

              {track && (
                <div className="prop-keys">
                  {track.map((key) => (
                    <span key={key.id} className={`key-chip ${activeKey?.id === key.id ? 'is-on' : ''}`}>
                      <button type="button" className="key-chip-time" onClick={() => onSeek(key.t)}>
                        {formatTime(key.t)}
                      </button>
                      <button
                        type="button"
                        className="key-chip-del"
                        title="Delete keyframe"
                        onClick={() => onDeleteKey(prop, key.id)}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {activeKey && (
                    <select
                      className="ease-select"
                      value={activeKey.ease ?? 'linear'}
                      onChange={(e) => onSetEase(prop, activeKey.id, e.target.value as Ease)}
                      title="Easing between this keyframe and the next one"
                    >
                      {EASES.map((e) => (
                        <option key={e.value} value={e.value}>
                          {e.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </section>

      <section className="panel">
        <header className="panel-title">
          <span>Animation presets</span>
        </header>
        <div className="preset-grid">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="preset-btn"
              onClick={() => onApplyPreset(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="panel-hint">Presets replace the existing keyframes of the properties they use.</p>
      </section>

      {layer.type === 'text' && text && (
        <section className="panel">
          <header className="panel-title">
            <span>Text</span>
          </header>
          <textarea
            className="text-area"
            value={text.content}
            rows={2}
            onChange={(e) => onText({ content: e.target.value })}
          />
          <div className="field-row">
            <label>Font</label>
            <select value={text.fontFamily} onChange={(e) => onText({ fontFamily: e.target.value })}>
              {FONT_STACKS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field-grid">
            <div className="field-row">
              <label>Size</label>
              <NumberInput
                value={text.fontSize}
                min={4}
                onCommit={(v) => onText({ fontSize: Math.max(4, Math.round(v)) })}
              />
            </div>
            <div className="field-row">
              <label>Weight</label>
              <select
                value={text.fontWeight}
                onChange={(e) => onText({ fontWeight: Number(e.target.value) })}
              >
                {[400, 600, 700, 800, 900].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-grid">
            <div className="field-row">
              <label>Fill</label>
              <input
                type="color"
                value={text.color}
                onChange={(e) => onText({ color: e.target.value })}
              />
            </div>
            <div className="field-row">
              <label>Stroke</label>
              <input
                type="color"
                value={text.strokeColor}
                onChange={(e) => onText({ strokeColor: e.target.value })}
              />
            </div>
          </div>
          <div className="field-grid">
            <div className="field-row">
              <label>Stroke w.</label>
              <NumberInput
                value={text.strokeWidth}
                min={0}
                step={0.5}
                onCommit={(v) => onText({ strokeWidth: Math.max(0, v) })}
              />
            </div>
            <div className="field-row">
              <label>Line h.</label>
              <NumberInput
                value={text.lineHeight}
                min={0.6}
                max={3}
                step={0.05}
                onCommit={(v) => onText({ lineHeight: Math.min(3, Math.max(0.6, v)) })}
              />
            </div>
          </div>
          <div className="field-grid">
            <div className="field-row">
              <label>Spacing</label>
              <NumberInput
                value={text.letterSpacing}
                step={0.5}
                onCommit={(v) => onText({ letterSpacing: v })}
              />
            </div>
            <div className="field-row">
              <label>Align</label>
              <select
                value={text.align}
                onChange={(e) => onText({ align: e.target.value as TextProps['align'] })}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={text.shadow}
              onChange={(e) => onText({ shadow: e.target.checked })}
            />
            Drop shadow
          </label>
        </section>
      )}

      {layer.type === 'image' && layer.source && (
        <section className="panel">
          <header className="panel-title">
            <span>Source</span>
          </header>
          <div className="field-row">
            <label>Fit</label>
            <select
              value={layer.fit ?? 'contain'}
              onChange={(e) => onLayerPatch({ fit: e.target.value as Layer['fit'] })}
            >
              <option value="contain">Contain</option>
              <option value="cover">Cover</option>
              <option value="stretch">Stretch</option>
            </select>
          </div>
          <p className="panel-hint">
            {layer.source.name} · {layer.source.width}×{layer.source.height} ·{' '}
            {layer.source.still ? 'still image' : `${layer.source.frames.length} frames`}
          </p>
          {!layer.source.still && onUseTiming && (
            <button type="button" className="preset-btn" onClick={onUseTiming}>
              Use this source timing for the timeline
            </button>
          )}
        </section>
      )}
    </div>
  )
}
