import type { UnfoldingRow } from './graph'
import { ancestorPath } from './visibility'

// Seed forceVisible/expanded so the path from a root down to each selected
// node is visible. For every selected node we open the first copy in the
// unfolding (DFS order): pin the copy and its root, and expand the copy so
// its own children show. Path-protection (in computeVisible) fills in the
// bridge ancestors between the root and the copy.
export function seedFromSelected(
  unfolding: UnfoldingRow[],
  selectedIds: Iterable<string>,
): { forceVisible: Set<number>; expanded: Set<number> } {
  const forceVisible = new Set<number>()
  const expanded = new Set<number>()

  // First copy (lowest posIdx) per selected node id.
  const firstCopy = new Map<string, number>()
  for (let i = 0; i < unfolding.length; i++) {
    const id = unfolding[i].nodeId
    if (!firstCopy.has(id)) firstCopy.set(id, i)
  }

  for (const id of selectedIds) {
    const pos = firstCopy.get(id)
    if (pos === undefined) continue
    const rootPos = ancestorPath(pos, unfolding)[0]
    forceVisible.add(pos)
    forceVisible.add(rootPos)
    expanded.add(pos)
  }
  return { forceVisible, expanded }
}
