import type { UnfoldingRow } from './graph'

// Seed forceVisible/expanded for the initial render.
//
// - All roots are always pinned visible, so the top level shows regardless of
//   selection.
// - `levelsExpanded` opens the top N levels: every position with depth <
//   levelsExpanded is expanded. 1 (the default at the view layer) reveals the
//   roots' children; 0 leaves everything collapsed.
// - For every selected node, the path from a root down to its first copy (DFS
//   order) is opened: pin the copy and expand it so its own children show.
//   Path-protection (in computeVisible) fills in the bridge ancestors.
export function seedFromSelected(
  unfolding: UnfoldingRow[],
  selectedIds: Iterable<string>,
  levelsExpanded = 0,
): { forceVisible: Set<number>; expanded: Set<number> } {
  const forceVisible = new Set<number>()
  const expanded = new Set<number>()

  for (let i = 0; i < unfolding.length; i++) {
    // Always show every root (parentIdx === -1), collapsed.
    if (unfolding[i].parentIdx === -1) forceVisible.add(i)
    // Expand the top `levelsExpanded` levels.
    if (unfolding[i].depth < levelsExpanded) expanded.add(i)
  }

  // First copy (lowest posIdx) per node id.
  const firstCopy = new Map<string, number>()
  for (let i = 0; i < unfolding.length; i++) {
    const id = unfolding[i].nodeId
    if (!firstCopy.has(id)) firstCopy.set(id, i)
  }

  for (const id of selectedIds) {
    const pos = firstCopy.get(id)
    if (pos === undefined) continue
    forceVisible.add(pos)
    expanded.add(pos)
  }
  return { forceVisible, expanded }
}
