import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { drawScene, pointInLayer } from '../lib/render'
import { sampleProps } from '../lib/keyframes'
import type { Layer, Project, PropName } from '../lib/types'

export type StageDragPayload = { prop: PropName; value: number }

type Props = {
  project: Project
  time: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  onBeginTransform: () => void
  onDrag: (layerId: string, payload: StageDragPayload, transient: boolean) => void
  showChrome: boolean
}

type DragState = {
  layerId: string
  startX: number
  startY: number
  originX: number
  originY: number
  moved: boolean
}

export default function Stage({
  project,
  time,
  selectedId,
  onSelect,
  onBeginTransform,
  onDrag,
  showChrome,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [display, setDisplay] = useState({ w: 320, h: 320 })

  // Fit the canvas inside the available area while keeping its aspect ratio.
  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const update = () => {
      const rect = shell.getBoundingClientRect()
      const availW = Math.max(64, rect.width - 24)
      const availH = Math.max(64, rect.height - 52)
      const s = Math.min(availW / project.width, availH / project.height)
      setDisplay({
        w: Math.max(40, Math.round(project.width * s)),
        h: Math.max(40, Math.round(project.height * s)),
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(shell)
    return () => observer.disconnect()
  }, [project.width, project.height])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (canvas.width !== project.width || canvas.height !== project.height) {
      canvas.width = project.width
      canvas.height = project.height
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    drawScene(ctx, project, time, {
      selectedId: showChrome ? selectedId : null,
    })
  }, [project, time, selectedId, showChrome])

  const toStage = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      const sx = rect.width === 0 ? 1 : project.width / rect.width
      const sy = rect.height === 0 ? 1 : project.height / rect.height
      return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy }
    },
    [project.width, project.height],
  )

  const hitTest = useCallback(
    (x: number, y: number): Layer | null => {
      for (let i = project.layers.length - 1; i >= 0; i--) {
        const layer = project.layers[i]
        if (!layer.visible) continue
        if (pointInLayer(layer, project, time, x, y)) return layer
      }
      return null
    },
    [project, time],
  )

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = toStage(e.clientX, e.clientY)
    const hit = hitTest(point.x, point.y)
    if (!hit) {
      onSelect(null)
      return
    }
    onSelect(hit.id)
    const p = sampleProps(hit, time)
    dragRef.current = {
      layerId: hit.id,
      startX: point.x,
      startY: point.y,
      originX: p.x,
      originY: p.y,
      moved: false,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const point = toStage(e.clientX, e.clientY)
    let dx = point.x - drag.startX
    let dy = point.y - drag.startY
    if (e.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0
      else dx = 0
    }
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 1) return
    if (!drag.moved) {
      drag.moved = true
      onBeginTransform()
    }
    onDrag(drag.layerId, { prop: 'x', value: Math.round(drag.originX + dx) }, true)
    onDrag(drag.layerId, { prop: 'y', value: Math.round(drag.originY + dy) }, true)
  }

  const endDrag = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <div className="stage-shell" ref={shellRef}>
      <div className="stage-frame" style={{ width: display.w, height: display.h }}>
        <canvas
          ref={canvasRef}
          className="stage-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      </div>
      <p className="stage-hint">
        Drag to move the selected layer · Shift constrains the axis · Arrow keys nudge · Add
        keyframes from the inspector
      </p>
    </div>
  )
}
