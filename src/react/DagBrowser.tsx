import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ancestorPath,
  buildGraph,
  computeVisible,
  decorateRows,
  descendantPosIdxs,
  fullUnfolding,
  seedFromSelected,
  type DecoratedRow,
  type ExpandedSet,
  type ForceVisibleSet,
  type Node,
} from '../core'
import { COLORS, LinkList, RailCell, TogglePill, depthTint } from './parts'
import './dag-browser.css'

// Context handed to the consumer's renderRow. Everything it needs to render a
// row's body and wire its own click/select/highlight behavior — but nothing
// about the widget's internal forceVisible/expanded mechanics.
export type RenderRowContext = {
  node: Node
  /** True when this node's id is in the `selected` prop. */
  isSelected: boolean
  /** Toggle/leaf/expand state of this row, for optional styling. */
  toggleState: DecoratedRow['toggleState']
  /** This row's render depth (number of visible ancestors). */
  depth: number
}

export type DagBrowserProps = {
  nodes: Node[]
  /**
   * Node ids the consumer cares about. The widget opens the path to each on
   * mount / when this changes, and shows a "reveal at" breadcrumb for any
   * selected node the user later collapses off-screen. The widget does NOT own
   * the meaning of "selected" or its highlight styling — do that in renderRow.
   */
  selected?: string[]
  /** Renders the body of each row (name, badges, buttons, highlight, …). */
  renderRow?: (ctx: RenderRowContext) => ReactNode
  /**
   * How many levels to expand on mount. 1 (default) reveals the roots' direct
   * children; 0 leaves everything collapsed. Initial-state only — changing it
   * later does not re-collapse what the user has opened.
   */
  levelsExpanded?: number
  /** Collapse/expand animation duration in ms. 0 disables animation. */
  animationMs?: number
  className?: string
}

const EMPTY: string[] = []

// A change of `nodes` means "different data — start over". We express that by
// remounting: the outer component keys the inner impl on the `nodes` array
// identity, so a new array throws the old instance (and all its expand/collapse
// state) away and mounts a fresh one. Nothing inside ever has to detect or
// react to a nodes change. (Pass a stable/memoized `nodes`, per React norms;
// rebuilding it every render would remount every render.)
export default function DagBrowser(props: DagBrowserProps) {
  const keyRef = useRef({ nodes: props.nodes, key: 0 })
  if (keyRef.current.nodes !== props.nodes) {
    keyRef.current = { nodes: props.nodes, key: keyRef.current.key + 1 }
  }
  return <DagBrowserImpl key={keyRef.current.key} {...props} />
}

function DagBrowserImpl({
  nodes,
  selected = EMPTY,
  renderRow,
  levelsExpanded = 1,
  animationMs = 220,
  className,
}: DagBrowserProps) {
  const graph = useMemo(() => buildGraph(nodes), [nodes])
  const unfolding = useMemo(() => fullUnfolding(graph), [graph])

  const selectedSet = useMemo(() => new Set(selected), [selected])

  // Seed ONCE, at mount. `nodes` is stable for this instance's lifetime (the
  // outer component remounts on a nodes change), so there is no re-seed effect
  // and seeding never fights the user's manual expand/collapse. `selected` and
  // `levelsExpanded` are read here only for the initial picture; changing them
  // later does not re-seed.
  const [seed] = useState(() =>
    seedFromSelected(unfolding, selectedSet, levelsExpanded),
  )

  const [forceVisible, setForceVisible] = useState<ForceVisibleSet>(
    seed.forceVisible,
  )
  const [expanded, setExpanded] = useState<ExpandedSet>(seed.expanded)

  const visible = useMemo(
    () => computeVisible(unfolding, forceVisible, expanded),
    [unfolding, forceVisible, expanded],
  )

  const decorated = useMemo(
    () => decorateRows(unfolding, visible, graph, selectedSet),
    [unfolding, visible, graph, selectedSet],
  )

  // --- Exit animation bookkeeping (ported from synapse, MUI-free) -----------
  // Rows that leave `decorated` stay parked in exitingRef until their collapse
  // transition finishes, so they animate out instead of vanishing. Updated
  // SYNCHRONOUSLY during render so a newly-exiting row is still rendered on the
  // render that flips it to collapsed (an effect would unmount it too early).
  const exitingRef = useRef<Map<number, DecoratedRow>>(new Map())
  const prevDecoratedRef = useRef<DecoratedRow[]>([])
  const [, forceRerender] = useState(0)

  const currentPosIdxs = useMemo(
    () => new Set(decorated.map(r => r.posIndex)),
    [decorated],
  )

  if (prevDecoratedRef.current !== decorated) {
    for (const prev of prevDecoratedRef.current) {
      if (!currentPosIdxs.has(prev.posIndex)) {
        exitingRef.current.set(prev.posIndex, prev)
      }
    }
    for (const posIdx of currentPosIdxs) exitingRef.current.delete(posIdx)
    prevDecoratedRef.current = decorated
  }

  const rowsToRender = useMemo(() => {
    const byPosIdx = new Map<number, DecoratedRow>()
    for (const [posIdx, row] of exitingRef.current) byPosIdx.set(posIdx, row)
    for (const row of decorated) byPosIdx.set(row.posIndex, row)
    return [...byPosIdx.values()].sort((a, b) => a.posIndex - b.posIndex)
  }, [decorated])

  function handleRowExited(posIdx: number) {
    if (exitingRef.current.delete(posIdx)) forceRerender(n => n + 1)
  }

  // --- Interaction ----------------------------------------------------------

  function handleToggle(posIndex: number, state: DecoratedRow['toggleState']) {
    if (state === 'partial' || state === 'collapsed') {
      setExpanded(prev => withAdded(prev, posIndex))
      return
    }
    if (state === 'expanded') {
      // Collapsing a parent must drop any forceVisible descendants and promote
      // the parent into forceVisible, so path-protection still shows it.
      const fvDescendants: number[] = []
      for (const fv of forceVisible) {
        if (fv === posIndex) continue
        const chain = ancestorPath(fv, unfolding)
        if (chain.slice(0, -1).includes(posIndex)) fvDescendants.push(fv)
      }
      if (fvDescendants.length > 0) {
        setForceVisible(prev => {
          const next = new Set(prev)
          for (const d of fvDescendants) next.delete(d)
          next.add(posIndex)
          return next
        })
      }
      setExpanded(prev => withRemoved(prev, posIndex))
      return
    }
    // leaf, disabled: no-op
  }

  // Expand this row and its entire subtree (every descendant under this path).
  function handleExpandAll(posIndex: number) {
    const descendants = descendantPosIdxs(posIndex, unfolding)
    if (descendants.length === 0) return // leaf: nothing to expand
    setExpanded(prev => {
      const next = new Set(prev)
      next.add(posIndex)
      for (const d of descendants) next.add(d)
      return next
    })
  }

  // Reveal a hidden copy (clicked from an also-under / reveal-at link): pin it.
  function reveal(targetPosIdx: number) {
    setForceVisible(prev => withAdded(prev, targetPosIdx))
  }

  if (nodes.length === 0) {
    return <div className={joinClass('dbw-root', className)}>No nodes.</div>
  }

  return (
    <div
      className={joinClass('dbw-root', className)}
      style={{ '--dbw-anim': `${animationMs}ms` } as React.CSSProperties}
    >
      {rowsToRender.map(row => {
        const isOpen = currentPosIdxs.has(row.posIndex)
        return (
          <CollapsibleRow
            key={row.posKey}
            open={isOpen}
            onExited={() => handleRowExited(row.posIndex)}
          >
            <Row
              row={row}
              node={graph.node(row.nodeId)}
              isSelected={selectedSet.has(row.nodeId)}
              renderRow={renderRow}
              onToggle={() => handleToggle(row.posIndex, row.toggleState)}
              onExpandAll={() => handleExpandAll(row.posIndex)}
              onReveal={reveal}
            />
          </CollapsibleRow>
        )
      })}
    </div>
  )
}

// --- Collapse wrapper: grid-template-rows 1fr<->0fr transition --------------
function CollapsibleRow({
  open,
  onExited,
  children,
}: {
  open: boolean
  onExited: () => void
  children: ReactNode
}) {
  return (
    <div
      className={`dbw-collapse${open ? ' dbw-open' : ''}`}
      onTransitionEnd={e => {
        // Only react to the grid-rows transition finishing in the closed state.
        if (e.propertyName === 'grid-template-rows' && !open) onExited()
      }}
    >
      <div className="dbw-collapse-inner">{children}</div>
    </div>
  )
}

function Row({
  row,
  node,
  isSelected,
  renderRow,
  onToggle,
  onExpandAll,
  onReveal,
}: {
  row: DecoratedRow
  node: Node | undefined
  isSelected: boolean
  renderRow?: (ctx: RenderRowContext) => ReactNode
  onToggle: () => void
  onExpandAll: () => void
  onReveal: (targetPosIdx: number) => void
}) {
  const name = node?.name ?? row.nodeId
  const body = renderRow
    ? renderRow({
        node: node ?? { id: row.nodeId, name, parentIds: [] },
        isSelected,
        toggleState: row.toggleState,
        depth: row.renderDepth,
      })
    : <span className="dbw-name">{name}</span>

  return (
    <div
      className="dbw-row"
      style={{ background: depthTint(row.renderDepth) }}
    >
      {row.rails.map((kind, idx) => (
        <RailCell key={idx} kind={kind} />
      ))}
      <TogglePill
        state={row.toggleState}
        count={row.childCount}
        title={toggleTooltip(row)}
        onClick={onToggle}
        onDoubleClick={
          row.descendantCount > row.childCount ? onExpandAll : undefined
        }
      />
      {body}
      <LinkList
        prefix="↳ reveal at"
        links={row.revealAt}
        title="Click to reveal this selected node in the tree"
        onClick={onReveal}
      />
      <LinkList
        prefix="★ also under"
        links={row.alsoUnderPaths}
        title="Click to reveal this copy in the tree"
        onClick={onReveal}
      />
    </div>
  )
}

function toggleTooltip(row: DecoratedRow): string {
  const { childCount, descendantCount, toggleState } = row
  // "double-click: show all N" only when the subtree runs deeper than the
  // direct children (otherwise expand-all and expand-children are identical).
  const deeper = descendantCount > childCount
  const allHint = deeper ? ` · double-click: show all ${descendantCount}` : ''
  const children = `${childCount} child${childCount === 1 ? '' : 'ren'}`
  switch (toggleState) {
    case 'leaf':
      return ''
    case 'disabled':
      return 'No children'
    case 'collapsed':
      return `Click: show ${children}${allHint}`
    case 'expanded':
      return `Click: collapse${allHint}`
    case 'partial':
      return `Click: show ${children}${allHint}`
  }
}

function withAdded(prev: ReadonlySet<number>, i: number): Set<number> {
  const next = new Set(prev)
  next.add(i)
  return next
}
function withRemoved(prev: ReadonlySet<number>, i: number): Set<number> {
  const next = new Set(prev)
  next.delete(i)
  return next
}

function joinClass(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

// Re-export so consumers don't need a separate import for COLORS in their
// renderRow (optional convenience).
export { COLORS }
