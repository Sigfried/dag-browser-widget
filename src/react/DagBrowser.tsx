import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
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
import {
  COLORS,
  LinkList,
  RailCell,
  TogglePill,
  depthTint,
  type XrefLink,
} from './parts'
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
  /**
   * Set when this row is a cycle back-edge (the node loops back to one of its
   * own ancestors). The default renderer shows a "⟲ loops back to …" marker;
   * a custom renderRow can style it however it likes. `selfLoop` is true for a
   * one-row A→A self-loop.
   */
  backedge?: { path: string; selfLoop: boolean }
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
  /**
   * Called when the user clicks a cross-reference link ("★ also under …",
   * "⟲ loops back to …", "↳ reveal at …"). Lets the consumer show their own
   * transient feedback (a toast/snackbar) — e.g. when the target is already
   * on screen, so the click would otherwise look like it did nothing. The
   * widget still scrolls the target into view regardless; providing this
   * suppresses the built-in flash so feedback isn't doubled.
   */
  onMessage?: (msg: DagBrowserMessage) => void
  className?: string
}

/** Emitted to `onMessage` when a cross-reference link is followed. */
export type DagBrowserMessage = {
  /**
   * 'already-visible' — the target copy was already on screen; the click just
   *   scrolled to it. This is the case worth surfacing to the user.
   * 'revealed' — the target was hidden and has now been pinned visible.
   */
  kind: 'already-visible' | 'revealed'
  /** The node id of the target copy. */
  targetId: string
  /** The unfolding posIdx of the target copy. */
  targetPosIdx: number
  /**
   * Slash-joined path shown on the clicked link (e.g. "app/core"). Use this
   * rather than just the node name when phrasing feedback.
   */
  targetPath: string
  /**
   * Where the target sits relative to the clicked row, in render order:
   * 'up' = above it, 'down' = below it. (For an 'already-visible' target this
   * is what tells you whether to say "shown above ↑" or "shown below ↓".)
   */
  direction: 'up' | 'down'
}

const EMPTY: string[] = []

// Geometry of one transient cross-ref arrow, in root-relative coordinates.
type ArrowGeom = { x1: number; y1: number; x2: number; y2: number }

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
  onMessage,
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

  // --- Cross-reference navigation: refs, scroll+flash, transient arrow ------
  // The container (arrow overlay is positioned against it) and a live map of
  // posIdx -> row element, so a cross-ref click/hover can locate its target.
  const rootRef = useRef<HTMLDivElement>(null)
  const rowElsRef = useRef<Map<number, HTMLElement>>(new Map())
  const registerRow = useCallback((posIdx: number, el: HTMLElement | null) => {
    if (el) rowElsRef.current.set(posIdx, el)
    else rowElsRef.current.delete(posIdx)
  }, [])

  // Transient arrows from a hovered row/link to its target row(s). Coordinates
  // are measured relative to the root on hover and cleared on leave; nothing is
  // kept in sync across layout changes (steady state stays measurement-free). A
  // row can point at several targets at once (multiple "★ also under" links).
  const [arrows, setArrows] = useState<ArrowGeom[]>([])

  // Briefly flash a row element (target of a cross-ref) by toggling a class.
  const flashRow = useCallback((el: HTMLElement) => {
    el.classList.remove('dbw-flash')
    // Force reflow so re-adding the class restarts the animation.
    void el.offsetWidth
    el.classList.add('dbw-flash')
    const clear = () => el.classList.remove('dbw-flash')
    el.addEventListener('animationend', clear, { once: true })
  }, [])

  // Scroll a target row into view (centered) and flash it. Returns false if the
  // row isn't currently in the DOM (caller may need to reveal it first).
  const scrollAndFlash = useCallback(
    (targetPosIdx: number, flash: boolean) => {
      const el = rowElsRef.current.get(targetPosIdx)
      if (!el) return false
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      if (flash) flashRow(el)
      return true
    },
    [flashRow],
  )

  // Draw transient arrows from a source row to each of its target rows. Both
  // rects are taken relative to the root container. Targets not currently in the
  // DOM are skipped.
  const showArrows = useCallback(
    (fromPosIdx: number, targetPosIdxs: number[]) => {
      const root = rootRef.current
      const fromEl = rowElsRef.current.get(fromPosIdx)
      if (!root || !fromEl) return
      const r = root.getBoundingClientRect()
      const f = fromEl.getBoundingClientRect()
      const y1 = f.top - r.top + f.height / 2
      const x1 = f.left - r.left
      const geoms: ArrowGeom[] = []
      for (const target of targetPosIdxs) {
        const toEl = rowElsRef.current.get(target)
        if (!toEl) continue
        const t = toEl.getBoundingClientRect()
        // Start/end at the left edge of each row, vertically centered — the
        // curve bows out to the left.
        geoms.push({
          x1,
          y1,
          x2: t.left - r.left,
          y2: t.top - r.top + t.height / 2,
        })
      }
      setArrows(geoms)
    },
    [],
  )
  const clearArrows = useCallback(() => setArrows([]), [])

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

  // Follow a cross-reference link (also-under / reveal-at / loops-back). If the
  // target is already on screen, just scroll+flash it and report 'already-
  // visible' (the dead-click case). Otherwise pin it, then scroll+flash once it
  // mounts and report 'revealed'. When the consumer supplies onMessage we skip
  // the built-in flash so feedback isn't doubled. `sourcePosIdx` is the row the
  // link was clicked from — used only to report up/down direction.
  function reveal(link: XrefLink, sourcePosIdx: number) {
    const { targetPosIdx, path: targetPath } = link
    const targetId = unfolding[targetPosIdx]?.nodeId ?? ''
    // Rows render in ascending posIdx order, so a lower target posIdx is above.
    const direction: 'up' | 'down' =
      targetPosIdx < sourcePosIdx ? 'up' : 'down'
    const flash = !onMessage
    clearArrows()
    const msg = { targetId, targetPosIdx, targetPath, direction } as const
    if (visible.has(targetPosIdx)) {
      scrollAndFlash(targetPosIdx, flash)
      onMessage?.({ kind: 'already-visible', ...msg })
      return
    }
    setForceVisible(prev => withAdded(prev, targetPosIdx))
    onMessage?.({ kind: 'revealed', ...msg })
    // The row mounts on the next commit; scroll+flash after it exists.
    requestAnimationFrame(() => scrollAndFlash(targetPosIdx, flash))
  }

  if (nodes.length === 0) {
    return <div className={joinClass('dbw-root', className)}>No nodes.</div>
  }

  return (
    <div
      ref={rootRef}
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
              registerRow={registerRow}
              onToggle={() => handleToggle(row.posIndex, row.toggleState)}
              onExpandAll={() => handleExpandAll(row.posIndex)}
              onReveal={reveal}
              onXrefHover={targets => showArrows(row.posIndex, targets)}
              onXrefLeave={clearArrows}
            />
          </CollapsibleRow>
        )
      })}
      {arrows.length > 0 && (
        <svg className="dbw-arrow-overlay">
          {arrows.map((g, i) => (
            <XrefArrow key={i} {...g} />
          ))}
        </svg>
      )}
    </div>
  )
}

// One transient curved arrow drawn over the tree, from a cross-ref link's row
// to the target row it points at. Bows out to the LEFT (into the gutter margin)
// so it doesn't cross the row text. Pure SVG, no measurement upkeep — it lives
// only while a row/link is hovered.
function XrefArrow({ x1, y1, x2, y2 }: ArrowGeom) {
  // Control-point offset: bow left proportional to the vertical span, with a
  // generous floor so even a one-row jump bows out enough to read clearly.
  const span = Math.abs(y2 - y1)
  const bow = Math.min(44 + span * 0.18, 120)
  const cx1 = x1 - bow
  const cx2 = x2 - bow
  const d = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`
  // Arrowhead at the target end, pointing right (toward the row).
  const a = 5
  return (
    <g>
      <path className="dbw-arrow-path" d={d} />
      <path
        className="dbw-arrow-head"
        d={`M ${x2} ${y2} L ${x2 - a} ${y2 - a} L ${x2 - a} ${y2 + a} Z`}
      />
    </g>
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
  registerRow,
  onToggle,
  onExpandAll,
  onReveal,
  onXrefHover,
  onXrefLeave,
}: {
  row: DecoratedRow
  node: Node | undefined
  isSelected: boolean
  renderRow?: (ctx: RenderRowContext) => ReactNode
  registerRow: (posIdx: number, el: HTMLElement | null) => void
  onToggle: () => void
  onExpandAll: () => void
  onReveal: (link: XrefLink, sourcePosIdx: number) => void
  onXrefHover: (targetPosIdxs: number[]) => void
  onXrefLeave: () => void
}) {
  const name = node?.name ?? row.nodeId
  const isBackedge = !!row.backedge
  const body = renderRow
    ? renderRow({
        node: node ?? { id: row.nodeId, name, parentIds: [] },
        isSelected,
        toggleState: row.toggleState,
        depth: row.renderDepth,
        backedge: row.backedge
          ? { path: row.backedge.path, selfLoop: row.backedge.selfLoop }
          : undefined,
      })
    : isBackedge
      ? <BackedgeMarker name={name} selfLoop={row.backedge!.selfLoop} />
      : <span className="dbw-name">{name}</span>

  // Shared props for every cross-ref LinkList: click reveals/scrolls, hovering
  // a single link previews just that one connection.
  const xref = {
    onClick: (link: XrefLink) => onReveal(link, row.posIndex),
    onHover: (t: number) => onXrefHover([t]),
    onLeave: onXrefLeave,
  }

  // Every target this row points at (for hovering anywhere on the row, not just
  // a single link): the loop-back/self-loop target on a back-edge row (a self-
  // loop's target is the parent right above, which has no link of its own —
  // including it here is what gives self-loops an arrow), plus all also-under
  // and reveal-at targets. Multiple targets draw multiple arrows at once.
  const allTargets = row.backedge
    ? [row.backedge.targetPosIdx]
    : [...row.alsoUnderPaths, ...row.revealAt].map(l => l.targetPosIdx)

  return (
    <div
      ref={el => registerRow(row.posIndex, el)}
      className={isBackedge ? 'dbw-row dbw-backedge' : 'dbw-row'}
      style={{ background: depthTint(row.renderDepth) }}
      onMouseEnter={
        allTargets.length ? () => onXrefHover(allTargets) : undefined
      }
      onMouseLeave={allTargets.length ? onXrefLeave : undefined}
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
      {row.backedge && !row.backedge.selfLoop && (
        <LinkList
          prefix={
            <>
              <span className="dbw-loop-glyph">⟲</span> loops back to
            </>
          }
          links={[
            {
              path: row.backedge.path,
              targetPosIdx: row.backedge.targetPosIdx,
            },
          ]}
          title="Click to scroll to the ancestor this loops back to"
          {...xref}
        />
      )}
      <LinkList
        prefix="↳ reveal at"
        links={row.revealAt}
        title="Click to reveal this selected node in the tree"
        {...xref}
      />
      <LinkList
        prefix="★ also under"
        links={row.alsoUnderPaths}
        title="Click to reveal this copy in the tree"
        {...xref}
      />
    </div>
  )
}

// Default body for a cycle back-edge row: a non-navigational marker. The loop
// target itself is shown as a clickable "⟲ loops back to …" link alongside
// (except for self-loops, where the target is the immediate parent right above).
function BackedgeMarker({
  name,
  selfLoop,
}: {
  name: string
  selfLoop: boolean
}) {
  return (
    <span className="dbw-name dbw-backedge-name">
      <span className="dbw-loop-glyph">⟲</span> {name}{' '}
      <span className="dbw-backedge-note">
        ({selfLoop ? 'self-loop' : 'cycle — shown above'})
      </span>
    </span>
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
