import type { Graph, UnfoldingRow } from './graph'

// Rail kinds drawn in the left gutter of each row (the ├ │ └ structure).
export type RailKind = 'vline' | 'tee' | 'corner' | 'empty'

// Toggle state of a row, derived purely from the displayed picture:
//   leaf      = no children at all
//   collapsed = no children visible
//   expanded  = all children visible
//   partial   = some-but-not-all children visible
//   disabled  = reserved (view may force a non-interactive toggle)
export type ToggleState =
  | 'expanded'
  | 'partial'
  | 'collapsed'
  | 'disabled'
  | 'leaf'

// State:
//   forceVisible: posIndexes pinned visible (seeded from `selected`, plus any
//                 the user reveals by clicking an also-under / reveal-at link).
//   expanded:     posIndexes whose children should be shown.
//
// Visibility: a position is visible iff
//   - it's in forceVisible, OR
//   - it's a bridge ancestor between two forceVisibles (path-protection), OR
//   - its parent position is visible AND parent ∈ expanded.
//
// Toggle state is derived purely from the rendered picture — see
// computeToggleState.

export type ForceVisibleSet = ReadonlySet<number>
export type ExpandedSet = ReadonlySet<number>

// Walk up via `unfolding[i].parentIdx` from `posIdx`, returning the chain of
// ancestor posIndexes from root down to `posIdx` (inclusive). With `stopAt`
// set, stops before adding that ancestor (so the returned chain is the
// strict path BETWEEN stopAt and posIdx, exclusive of stopAt, inclusive of
// posIdx).
export function ancestorPath(
  posIdx: number,
  unfolding: UnfoldingRow[],
  stopAt?: number,
): number[] {
  const chain: number[] = []
  let cursor = posIdx
  while (cursor >= 0 && cursor !== stopAt) {
    chain.unshift(cursor)
    cursor = unfolding[cursor].parentIdx
  }
  return chain
}

// Path-protection set: walking up from each forceVisible to its nearest
// forceVisible ancestor (or root), collecting every position along the way
// (not including the starting fv, but including the ancestor fv if found).
// These are the bridge positions that must be visible even though they're
// not in `expanded`, so the FV ancestors connect to FV descendants on screen.
function pathProtectionSet(
  forceVisible: ForceVisibleSet,
  unfolding: UnfoldingRow[],
): Set<number> {
  const out = new Set<number>()
  for (const idx of forceVisible) {
    let cursor = unfolding[idx].parentIdx
    while (cursor >= 0) {
      out.add(cursor)
      if (forceVisible.has(cursor)) break // stop at next FV ancestor (inclusive)
      cursor = unfolding[cursor].parentIdx
    }
  }
  return out
}

// Compute the set of visible positions. A single forward sweep suffices
// because the unfolding is DFS pre-order: every row's parent appears at a
// lower index, so by the time we process row i, its parent's visibility
// is already settled.
export function computeVisible(
  unfolding: UnfoldingRow[],
  forceVisible: ForceVisibleSet,
  expanded: ExpandedSet,
): Set<number> {
  // Seed: forceVisible + path-protection (bridges up to nearest FV).
  const visible = new Set<number>(forceVisible)
  for (const a of pathProtectionSet(forceVisible, unfolding)) {
    visible.add(a)
  }

  for (let i = 0; i < unfolding.length; i++) {
    const pi = unfolding[i].parentIdx
    if (pi < 0) continue
    if (visible.has(pi) && expanded.has(pi)) visible.add(i)
  }

  return visible
}

// Toggle state per visible row — derived purely from what's currently shown.
// Independent of whether posIdx is in `expanded` or `forceVisible` — the state
// describes the displayed picture, not the underlying mechanism.
export function computeToggleState(
  childCount: number,
  visibleChildCount: number,
): ToggleState {
  if (childCount === 0) return 'leaf'
  if (visibleChildCount === 0) return 'collapsed'
  if (visibleChildCount >= childCount) return 'expanded'
  return 'partial'
}

// ----------------------------------------------------------------------------
// decorateRows
// ----------------------------------------------------------------------------

export type AlsoUnderLink = {
  path: string // slash-joined ancestor names (e.g. "Data/Waveform/Voice")
  targetPosIdx: number // posIndex of the OTHER copy of this node (under
  // the other parent). Clicking this link should add this to forceVisible.
}

export type RevealAtLink = {
  path: string // slash-joined names from this row down to the hidden copy
  targetPosIdx: number // posIdx of the hidden selected copy — click to reveal it
}

export type DecoratedRow = {
  posIndex: number
  posKey: string
  nodeId: string
  renderDepth: number
  toggleState: ToggleState
  childCount: number
  alsoUnderPaths: AlsoUnderLink[]
  rails: RailKind[]
  // For each selected node that is hidden but has a copy in this row's subtree,
  // the closest visible ancestor of that copy gets a reveal link. At most one
  // link per (row, selected node) is tracked, keyed by the hidden copy's posIdx.
  revealAt: RevealAtLink[]
}

export function decorateRows(
  unfolding: UnfoldingRow[],
  visible: ReadonlySet<number>,
  graph: Graph,
  selectedIds: ReadonlySet<string> = new Set(),
): DecoratedRow[] {
  if (visible.size === 0) return []

  // Iterate visible positions in unfolding (DFS pre-order) for stable order.
  const visibleOrdered: number[] = []
  for (let i = 0; i < unfolding.length; i++) {
    if (visible.has(i)) visibleOrdered.push(i)
  }

  // Map posIdx -> row position in visibleOrdered (for subtree-range lookups).
  const rowAt = new Map<number, number>()
  for (let r = 0; r < visibleOrdered.length; r++) {
    rowAt.set(visibleOrdered[r], r)
  }

  // All copies of each node in the unfolding, keyed by nodeId. Used to find
  // "other copies" for the alsoUnder links and hidden selected copies.
  const posIdxsByNodeId = new Map<string, number[]>()
  for (let i = 0; i < unfolding.length; i++) {
    const arr = posIdxsByNodeId.get(unfolding[i].nodeId)
    if (arr) arr.push(i)
    else posIdxsByNodeId.set(unfolding[i].nodeId, [i])
  }

  // visibleChildren[parentPosIdx] = ordered list of that parent's visible
  // direct child posIdxs (in DFS / visibleOrdered order).
  const visibleChildren = new Map<number, number[]>()
  for (const i of visibleOrdered) {
    const pi = unfolding[i].parentIdx
    const arr = visibleChildren.get(pi)
    if (arr) arr.push(i)
    else visibleChildren.set(pi, [i])
  }

  // Each visible row's rails accumulate one cell per visible ancestor as we
  // process parents from outermost (depth 0) to innermost. We process parents
  // in DFS / visibleOrdered order, which naturally goes outermost-first.
  const railsByRow: RailKind[][] = visibleOrdered.map(() => [])

  for (const parentPosIdx of visibleOrdered) {
    const kids = visibleChildren.get(parentPosIdx)
    if (!kids || kids.length === 0) continue
    const lastKid = kids[kids.length - 1]
    const kidSet = new Set(kids)

    // Walk the parent's visible subtree starting just after the parent row.
    // Since unfolding is DFS pre-order, the subtree is contiguous in
    // visibleOrdered: we stop as soon as we hit a row that isn't a
    // descendant.
    const parentRow = rowAt.get(parentPosIdx)
    if (parentRow === undefined) continue

    let sawLastKid = false
    for (let r = parentRow + 1; r < visibleOrdered.length; r++) {
      const d = visibleOrdered[r]
      if (!isAncestor(parentPosIdx, d, unfolding)) break

      if (kidSet.has(d)) {
        if (d === lastKid) {
          railsByRow[r].push('corner')
          sawLastKid = true
        } else {
          railsByRow[r].push('tee')
        }
      } else {
        railsByRow[r].push(sawLastKid ? 'empty' : 'vline')
      }
    }
  }

  const pathNames = (idxs: number[]) =>
    idxs
      .map(i => graph.node(unfolding[i].nodeId)?.name ?? unfolding[i].nodeId)
      .join('/')

  // Build decorated rows.
  const decorated: DecoratedRow[] = []
  for (let r = 0; r < visibleOrdered.length; r++) {
    const posIdx = visibleOrdered[r]
    const row = unfolding[posIdx]
    const rails = railsByRow[r]
    const renderDepth = rails.length

    // alsoUnderPaths: for each OTHER copy of this row's node in the unfolding,
    // derive its actual ancestor-chain path and a click target. Skips the
    // copy at the current row (i.e. skips this very position).
    const alsoUnderPaths: AlsoUnderLink[] = []
    const copies = posIdxsByNodeId.get(row.nodeId) ?? []
    if (copies.length > 1) {
      for (const otherPosIdx of copies) {
        if (otherPosIdx === posIdx) continue
        const chain = ancestorPath(otherPosIdx, unfolding)
        // Drop the copy itself from the displayed path; show only its ancestry.
        const ancestors = chain.slice(0, -1)
        if (ancestors.length === 0) continue
        alsoUnderPaths.push({
          path: pathNames(ancestors),
          targetPosIdx: otherPosIdx,
        })
      }
    }

    const childCount = graph.children(row.nodeId).length
    const visibleChildCount = (visibleChildren.get(posIdx) ?? []).length
    const toggleState = computeToggleState(childCount, visibleChildCount)

    decorated.push({
      posIndex: posIdx,
      posKey: String(posIdx),
      nodeId: row.nodeId,
      renderDepth,
      toggleState,
      childCount,
      alsoUnderPaths,
      rails,
      revealAt: [],
    })
  }

  // For each selected node with NO visible copy, attach a "reveal at: <path>"
  // link to the closest visible ancestor of its FIRST hidden copy (in
  // unfolding/DFS order). One link per selected node. If any copy of a
  // selected node is visible, skip it — its alsoUnder links reveal the others.
  const rowByPos = new Map<number, DecoratedRow>()
  for (const d of decorated) rowByPos.set(d.posIndex, d)

  for (const selId of selectedIds) {
    const copies = posIdxsByNodeId.get(selId) ?? []
    if (copies.length === 0) continue
    if (copies.some(p => visible.has(p))) continue

    // Pick the first hidden copy (DFS order) that actually sits under a visible
    // ancestor — that's the copy the user can be guided to. Copies buried under
    // wholly-collapsed branches have no visible anchor to hang a link on.
    for (const hiddenPos of copies) {
      let cursor = unfolding[hiddenPos].parentIdx
      while (cursor >= 0 && !visible.has(cursor)) {
        cursor = unfolding[cursor].parentIdx
      }
      if (cursor < 0) continue
      const ancestorRow = rowByPos.get(cursor)
      if (!ancestorRow) continue
      // Path: names from just below the visible ancestor down to (and
      // including) the hidden copy.
      const chain = ancestorPath(hiddenPos, unfolding, cursor)
      ancestorRow.revealAt.push({
        path: pathNames(chain),
        targetPosIdx: hiddenPos,
      })
      break // one reveal link per selected node
    }
  }

  return decorated
}

function isAncestor(
  ancestor: number,
  descendant: number,
  unfolding: UnfoldingRow[],
): boolean {
  // ancestorPath returns the chain from root down to descendant (inclusive).
  // The last element is descendant itself, so checking earlier elements is
  // equivalent to "is ancestor a strict ancestor of descendant?".
  const chain = ancestorPath(descendant, unfolding)
  for (let i = 0; i < chain.length - 1; i++) {
    if (chain[i] === ancestor) return true
  }
  return false
}
