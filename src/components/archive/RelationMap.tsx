import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { entityTypeLabel, type ArchiveEntity } from '../../features/archive/entityModel'
import { pairLabel, type RelationPair } from '../../features/archive/relations'

interface RelationMapProps {
  entities: ArchiveEntity[]
  // One line per pair of entities, however many relations they have.
  pairs: RelationPair[]
  selectedEntityId: string | null
  selectedPairKey: string | null
  // While set, clicking another entity picks it as the new relation's target.
  connectFromId: string | null
  onSelectEntity: (entityId: string | null) => void
  onSelectPair: (pairKey: string | null) => void
  onOpenEntity: (entityId: string) => void
  onConnect: (targetId: string) => void
}

interface Point {
  x: number
  y: number
}

interface LayoutNode extends SimulationNodeDatum {
  id: string
}

interface View {
  k: number
  x: number
  y: number
}

const TWEEN_MS = 450
const MIN_ZOOM = 0.4
const MAX_ZOOM = 4
const CROSSING_BUDGET_MS = 60

function radiusFor(degree: number): number {
  return 9 + Math.min(14, Math.sqrt(degree) * 3.5)
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Proper intersection of segments ab and cd (touching endpoints don't count).
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const orient = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const d1 = orient(c, d, a)
  const d2 = orient(c, d, b)
  const d3 = orient(a, b, c)
  const d4 = orient(a, b, d)
  return d1 * d2 < 0 && d3 * d4 < 0
}

// Distance from point p to segment ab.
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

// An edge passing this close to an unrelated node reads as touching it.
const NODE_CLEARANCE = 30

/**
 * Greedy conflict reduction: swap two nodes' positions whenever that lowers
 * the number of conflicts — edges crossing each other, or edges running
 * through an unrelated node. Only what the swap can change is recounted, and
 * the pass stops at a time budget on large maps.
 */
function reduceCrossings(positions: Map<string, Point>, links: Array<[string, string]>) {
  const edges = links.filter(([a, b]) => a !== b && positions.has(a) && positions.has(b))
  const incident = new Map<string, number[]>()
  edges.forEach(([a, b], index) => {
    incident.set(a, [...(incident.get(a) ?? []), index])
    incident.set(b, [...(incident.get(b) ?? []), index])
  })
  const nodeIds = [...positions.keys()]
  const edgeThroughNode = (edge: [string, string], nodeId: string) =>
    nodeId !== edge[0] &&
    nodeId !== edge[1] &&
    distanceToSegment(positions.get(nodeId)!, positions.get(edge[0])!, positions.get(edge[1])!) < NODE_CLEARANCE

  // Conflicts involving the affected edges or the two moved nodes.
  const crossingsFor = (affected: Set<number>, moved: [string, string]) => {
    let count = 0
    affected.forEach((i) => {
      const [a, b] = edges[i]
      edges.forEach(([c, d], j) => {
        if (j === i || (affected.has(j) && j < i)) return
        if (a === c || a === d || b === c || b === d) return
        if (segmentsCross(positions.get(a)!, positions.get(b)!, positions.get(c)!, positions.get(d)!)) count++
      })
      nodeIds.forEach((nodeId) => {
        if (edgeThroughNode(edges[i], nodeId)) count++
      })
    })
    edges.forEach((edge, j) => {
      if (affected.has(j)) return
      moved.forEach((nodeId) => {
        if (edgeThroughNode(edge, nodeId)) count++
      })
    })
    return count
  }

  const ids = [...nodeIds].sort()
  const deadline = performance.now() + CROSSING_BUDGET_MS
  for (let pass = 0; pass < 4; pass++) {
    let improved = false
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (performance.now() > deadline) return
        const affected = new Set([...(incident.get(ids[i]) ?? []), ...(incident.get(ids[j]) ?? [])])
        const moved: [string, string] = [ids[i], ids[j]]
        const before = crossingsFor(affected, moved)
        if (before === 0) continue
        const pi = positions.get(ids[i])!
        const pj = positions.get(ids[j])!
        positions.set(ids[i], pj)
        positions.set(ids[j], pi)
        if (crossingsFor(affected, moved) < before) {
          improved = true
        } else {
          positions.set(ids[i], pi)
          positions.set(ids[j], pj)
        }
      }
    }
    if (!improved) return
  }
}

// Seeds from previous positions so a small change only nudges the map.
function computeLayout(
  entities: ArchiveEntity[],
  relations: Array<{ sourceId: string; targetId: string }>,
  degree: Map<string, number>,
  previous: Map<string, Point>,
): Map<string, Point> {
  const nodes: LayoutNode[] = entities.map((entity, index) => {
    const known = previous.get(entity.id)
    const angle = (index / Math.max(1, entities.length)) * Math.PI * 2
    return known
      ? { id: entity.id, x: known.x, y: known.y }
      : { id: entity.id, x: Math.cos(angle) * 160, y: Math.sin(angle) * 160 }
  })
  const ids = new Set(nodes.map((node) => node.id))
  const pairs = relations
    .filter((relation) => ids.has(relation.sourceId) && ids.has(relation.targetId))
    .map((relation) => [relation.sourceId, relation.targetId] as [string, string])
  const links: SimulationLinkDatum<LayoutNode>[] = pairs.map(([source, target]) => ({ source, target }))

  const simulation = forceSimulation(nodes)
    .force('link', forceLink<LayoutNode, SimulationLinkDatum<LayoutNode>>(links).id((node) => node.id).distance(130).strength(0.4))
    .force('charge', forceManyBody().strength(-420))
    .force('collide', forceCollide<LayoutNode>((node) => radiusFor(degree.get(node.id) ?? 0) + 30))
    .force('x', forceX(0).strength(0.05))
    .force('y', forceY(0).strength(0.08))
    .stop()
  const warm = nodes.every((node) => previous.has(node.id))
  simulation.alpha(warm ? 0.3 : 1)
  for (let tick = 0; tick < (warm ? 120 : 320); tick++) simulation.tick()

  const positions = new Map(nodes.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]))
  reduceCrossings(positions, pairs)
  return positions
}

/**
 * Force-directed map of entities and their relations, with zoom and pan.
 * Each layout starts from the previous positions, so scrubbing the timeline
 * nudges the map instead of reshuffling it, and nodes glide into place.
 */
export function RelationMap({
  entities,
  pairs,
  selectedEntityId,
  selectedPairKey,
  connectFromId,
  onSelectEntity,
  onSelectPair,
  onOpenEntity,
  onConnect,
}: RelationMapProps) {
  const degree = useMemo(() => {
    const counts = new Map<string, number>()
    pairs.forEach((pair) => {
      counts.set(pair.aId, (counts.get(pair.aId) ?? 0) + 1)
      counts.set(pair.bId, (counts.get(pair.bId) ?? 0) + 1)
    })
    return counts
  }, [pairs])
  const links = useMemo(() => pairs.map((pair) => ({ sourceId: pair.aId, targetId: pair.bId })), [pairs])

  // Settled layout (frames the view) and the animated positions on screen.
  const [layout, setLayout] = useState<Map<string, Point>>(new Map())
  const [display, setDisplay] = useState<Map<string, Point>>(new Map())
  const settledRef = useRef(new Map<string, Point>())
  const displayRef = useRef(new Map<string, Point>())

  useEffect(() => {
    const next = computeLayout(entities, links, degree, settledRef.current)
    settledRef.current = next
    const from = displayRef.current
    const instant = prefersReducedMotion() || from.size === 0
    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      const t = instant ? 1 : Math.min(1, (now - start) / TWEEN_MS)
      const ease = 1 - Math.pow(1 - t, 3)
      const positions = new Map<string, Point>()
      next.forEach((target, id) => {
        const origin = from.get(id) ?? target
        positions.set(id, {
          x: origin.x + (target.x - origin.x) * ease,
          y: origin.y + (target.y - origin.y) * ease,
        })
      })
      displayRef.current = positions
      setDisplay(positions)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame((now) => {
      setLayout(next)
      step(now)
    })
    return () => cancelAnimationFrame(frame)
  }, [entities, links, degree])

  const [hoverId, setHoverId] = useState<string | null>(null)
  const focusId = hoverId ?? selectedEntityId
  const neighbours = useMemo(() => {
    if (!focusId) return null
    const set = new Set([focusId])
    pairs.forEach((pair) => {
      if (pair.aId === focusId) set.add(pair.bId)
      if (pair.bId === focusId) set.add(pair.aId)
    })
    return set
  }, [focusId, pairs])

  // Fit the settled layout (not the animated one) so the frame doesn't wobble.
  const viewBox = useMemo(() => {
    const points = [...layout.values()]
    if (points.length === 0) return { x: -200, y: -150, width: 400, height: 300 }
    const pad = 70
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    const x = Math.min(...xs) - pad
    const y = Math.min(...ys) - pad
    return {
      x,
      y,
      width: Math.max(400, Math.max(...xs) + pad - x),
      height: Math.max(300, Math.max(...ys) + pad + 16 - y),
    }
  }, [layout])

  // Zoom and pan, in viewBox units.
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 })
  const [showWheelHint, setShowWheelHint] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const pointersRef = useRef(new Map<number, Point>())
  const gestureRef = useRef<{ moved: boolean; pinchDistance: number | null }>({ moved: false, pinchDistance: null })

  function toUser(clientX: number, clientY: number): Point {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return { x: 0, y: 0 }
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
    return { x: point.x, y: point.y }
  }

  function zoomAt(factor: number, center: Point) {
    setView((current) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.k * factor))
      const ratio = k / current.k
      return { k, x: center.x - (center.x - current.x) * ratio, y: center.y - (center.y - current.y) * ratio }
    })
  }

  function zoomFromCenter(factor: number) {
    zoomAt(factor, { x: viewBox.x + viewBox.width / 2, y: viewBox.y + viewBox.height / 2 })
  }

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms; a plain wheel keeps scrolling the page.
  const hintTimerRef = useRef(0)
  const zoomAtRef = useRef(zoomAt)
  const toUserRef = useRef(toUser)
  useEffect(() => {
    zoomAtRef.current = zoomAt
    toUserRef.current = toUser
  })
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        setShowWheelHint(true)
        window.clearTimeout(hintTimerRef.current)
        hintTimerRef.current = window.setTimeout(() => setShowWheelHint(false), 1400)
        return
      }
      event.preventDefault()
      zoomAtRef.current(Math.exp(-event.deltaY * 0.0025), toUserRef.current(event.clientX, event.clientY))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      svg.removeEventListener('wheel', onWheel)
      window.clearTimeout(hintTimerRef.current)
    }
  }, [])

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const onItem = (event.target as Element).closest('.map-node, .map-edge')
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (onItem && pointersRef.current.size === 1) return
    event.currentTarget.setPointerCapture(event.pointerId)
    gestureRef.current = { moved: false, pinchDistance: null }
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const pointers = pointersRef.current
    const previous = pointers.get(event.pointerId)
    if (!previous || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const last = gestureRef.current.pinchDistance
      if (last) zoomAt(distance / last, toUser((a.x + b.x) / 2, (a.y + b.y) / 2))
      gestureRef.current = { moved: true, pinchDistance: distance }
      return
    }

    const from = toUser(previous.x, previous.y)
    const to = toUser(event.clientX, event.clientY)
    if (Math.abs(event.clientX - previous.x) + Math.abs(event.clientY - previous.y) > 0) {
      gestureRef.current.moved = true
    }
    setView((current) => ({ ...current, x: current.x + (to.x - from.x), y: current.y + (to.y - from.y) }))
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size < 2) gestureRef.current.pinchDistance = null
    const onItem = (event.target as Element).closest('.map-node, .map-edge')
    // A click (no drag) on empty space clears the selection.
    if (!onItem && !gestureRef.current.moved && event.currentTarget.hasPointerCapture(event.pointerId)) {
      onSelectEntity(null)
      onSelectPair(null)
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function activateNode(entityId: string) {
    if (connectFromId) {
      if (entityId !== connectFromId) onConnect(entityId)
      return
    }
    onSelectEntity(entityId)
  }

  // Beyond a dozen lines, labels show only around the focused node.
  const showAllLabels = pairs.length <= 12
  const byId = new Map(entities.map((entity) => [entity.id, entity]))

  return (
    <div className={`relation-map-frame${connectFromId ? ' is-connecting' : ''}`}>
      <svg
        aria-label="Mapa de relações entre entidades"
        className={`relation-map${neighbours ? ' has-focus' : ''}`}
        preserveAspectRatio="xMidYMid meet"
        ref={svgRef}
        role="group"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        onPointerCancel={onPointerUp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <defs>
          <marker
            id="map-arrow"
            markerHeight="7"
            markerWidth="7"
            orient="auto-start-reverse"
            refX="9"
            refY="5"
            viewBox="0 0 10 10"
          >
            <path className="map-arrow" d="M0 0 L10 5 L0 10 z" />
          </marker>
          <marker
            id="map-arrow-active"
            markerHeight="7"
            markerWidth="7"
            orient="auto-start-reverse"
            refX="9"
            refY="5"
            viewBox="0 0 10 10"
          >
            <path className="map-arrow is-active" d="M0 0 L10 5 L0 10 z" />
          </marker>
        </defs>

        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g className="map-edges">
            {pairs.map((pair) => {
              const a = display.get(pair.aId)
              const b = display.get(pair.bId)
              if (!a || !b) return null
              const dx = b.x - a.x
              const dy = b.y - a.y
              const length = Math.hypot(dx, dy) || 1
              const ux = dx / length
              const uy = dy / length
              // Stop at the circles where an arrowhead sits.
              const insetA = pair.backward ? radiusFor(degree.get(pair.aId) ?? 0) + 4 : 0
              const insetB = pair.forward ? radiusFor(degree.get(pair.bId) ?? 0) + 4 : 0
              const start = { x: a.x + ux * insetA, y: a.y + uy * insetA }
              const end = { x: b.x - ux * insetB, y: b.y - uy * insetB }
              const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
              const isSelected = pair.key === selectedPairKey
              const isActive = isSelected || (!!focusId && (pair.aId === focusId || pair.bId === focusId))
              const isDimmed = !!focusId && !isActive
              const count = pair.relations.length
              const label = pairLabel(pair)
              const marker = isActive ? 'url(#map-arrow-active)' : 'url(#map-arrow)'
              const d = `M${start.x} ${start.y} L${end.x} ${end.y}`
              const names = `${byId.get(pair.aId)?.name} e ${byId.get(pair.bId)?.name}`
              return (
                <g
                  aria-label={`${names}: ${count === 1 ? label : `${count} relações (${label})`}`}
                  aria-pressed={isSelected}
                  className={`map-edge${isActive ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}${isDimmed ? ' is-dimmed' : ''}`}
                  key={pair.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectPair(pair.key)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelectPair(pair.key)
                    }
                  }}
                >
                  <path className="map-edge-hit" d={d} />
                  <path
                    className="map-edge-line"
                    d={d}
                    markerEnd={pair.forward ? marker : undefined}
                    markerStart={pair.backward ? marker : undefined}
                  />
                  {(isActive || (showAllLabels && length > 130)) && (
                    <text className="map-edge-label" x={middle.x} y={middle.y - (count > 1 ? 12 : 5)}>
                      {label}
                    </text>
                  )}
                  {count > 1 && (
                    <g className="map-edge-count" transform={`translate(${middle.x} ${middle.y})`}>
                      <circle r={8} />
                      <text dy="0.35em">{count}</text>
                    </g>
                  )}
                </g>
              )
            })}
          </g>

          <g className="map-nodes">
            {entities.map((entity) => {
              const point = display.get(entity.id)
              if (!point) return null
              const nodeDegree = degree.get(entity.id) ?? 0
              const radius = radiusFor(nodeDegree)
              const isDimmed = !!neighbours && !neighbours.has(entity.id)
              const isSource = entity.id === connectFromId
              return (
                <g
                  aria-label={
                    connectFromId && !isSource
                      ? `Ligar a ${entity.name}`
                      : `${entity.name}, ${entityTypeLabel(entity.type)}, ${nodeDegree} ${nodeDegree === 1 ? 'relação' : 'relações'}`
                  }
                  aria-pressed={entity.id === selectedEntityId}
                  className={`map-node type-${entity.type.toLowerCase()}${isDimmed ? ' is-dimmed' : ''}${focusId === entity.id ? ' is-focused' : ''}${entity.id === selectedEntityId ? ' is-selected' : ''}${isSource ? ' is-source' : ''}`}
                  key={entity.id}
                  role="button"
                  tabIndex={0}
                  transform={`translate(${point.x} ${point.y})`}
                  onBlur={() => setHoverId(null)}
                  onClick={() => activateNode(entity.id)}
                  onDoubleClick={() => onOpenEntity(entity.id)}
                  onFocus={() => setHoverId(entity.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      activateNode(entity.id)
                    }
                  }}
                  onMouseEnter={() => setHoverId(entity.id)}
                  onMouseLeave={() => setHoverId(null)}
                >
                  <g className="map-node-body">
                    <circle r={radius} />
                    <text className="map-node-label" y={radius + 15}>
                      {entity.name}
                    </text>
                  </g>
                </g>
              )
            })}
          </g>
        </g>
      </svg>

      <div className="map-zoom" role="group" aria-label="Zoom do mapa">
        <button aria-label="Aproximar" className="map-zoom-button" type="button" onClick={() => zoomFromCenter(1.3)}>
          +
        </button>
        <button aria-label="Afastar" className="map-zoom-button" type="button" onClick={() => zoomFromCenter(1 / 1.3)}>
          −
        </button>
        <button
          className="map-zoom-button map-zoom-fit"
          disabled={view.k === 1 && view.x === 0 && view.y === 0}
          type="button"
          onClick={() => setView({ k: 1, x: 0, y: 0 })}
        >
          Ajustar
        </button>
        <span className="map-zoom-level" aria-live="polite">
          {Math.round(view.k * 100)}%
        </span>
      </div>
      <p className={`map-hint${showWheelHint ? ' is-visible' : ''}`} aria-hidden="true">
        Use Ctrl + rolagem para ampliar · arraste o fundo para mover
      </p>
    </div>
  )
}
