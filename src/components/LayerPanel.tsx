import type { Layer, Project } from '../lib/types'

type Props = {
  project: Project
  selectedId: string | null
  onSelect: (id: string) => void
  onToggleVisible: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
}

export default function LayerPanel({
  project,
  selectedId,
  onSelect,
  onToggleVisible,
  onDelete,
  onDuplicate,
}: Props) {
  const layers = [...project.layers].reverse()
  return (
    <div className="layer-list">
      {layers.length === 0 && (
        <p className="panel-hint">
          No layers yet. Import a GIF or an image, or add a text layer to start editing.
        </p>
      )}
      {layers.map((layer: Layer) => (
        <div
          key={layer.id}
          className={`layer-item ${selectedId === layer.id ? 'is-selected' : ''}`}
          onClick={() => onSelect(layer.id)}
        >
          <span className="layer-type">{layer.type === 'text' ? 'TXT' : 'IMG'}</span>
          <span className="layer-item-name truncate">{layer.name}</span>
          <div className="layer-item-actions">
            <button
              type="button"
              className="icon-btn tiny"
              title="Duplicate layer"
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate(layer.id)
              }}
            >
              ⧉
            </button>
            <button
              type="button"
              className={`icon-btn tiny ${layer.visible ? '' : 'is-off'}`}
              title={layer.visible ? 'Hide layer' : 'Show layer'}
              onClick={(e) => {
                e.stopPropagation()
                onToggleVisible(layer.id)
              }}
            >
              {layer.visible ? '👁' : '🚫'}
            </button>
            <button
              type="button"
              className="icon-btn tiny danger"
              title="Delete layer"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(layer.id)
              }}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
