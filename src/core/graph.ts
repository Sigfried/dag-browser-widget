// Generic DAG primitives. No view dependencies, no app-specific knowledge.

export type Node = {
  id: string
  name: string
  parentIds: string[]
}

export type Graph = {
  node: (id: string) => Node | undefined
  parents: (id: string) => string[]
  children: (id: string) => string[]
  depth: (id: string) => number
  roots: string[]
  allIds: string[]
}

// Order children/roots by a trailing number in the id when present (so
// `item-2` sorts before `item-10`), then by name, then by id. This keeps a
// stable, human-friendly order without assuming any particular id scheme.
function compareIds(a: Node | undefined, b: Node | undefined): number {
  const an = trailingNum(a?.id)
  const bn = trailingNum(b?.id)
  if (an !== bn) return an - bn
  const aName = a?.name ?? a?.id ?? ''
  const bName = b?.name ?? b?.id ?? ''
  if (aName !== bName) return aName < bName ? -1 : 1
  const aId = a?.id ?? ''
  const bId = b?.id ?? ''
  return aId < bId ? -1 : aId > bId ? 1 : 0
}

function trailingNum(id: string | undefined): number {
  if (!id) return Number.POSITIVE_INFINITY
  const m = id.match(/(\d+)$/)
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY
}

export function buildGraph(nodes: Node[]): Graph {
  const byId: Record<string, Node> = {}
  const parentsOf: Record<string, string[]> = {}
  const childrenOf: Record<string, string[]> = {}
  const roots: string[] = []

  for (const n of nodes) byId[n.id] = n

  for (const n of nodes) {
    const parents = n.parentIds.filter(p => byId[p])
    parentsOf[n.id] = parents
    if (parents.length === 0) roots.push(n.id)
    for (const p of parents) (childrenOf[p] ??= []).push(n.id)
  }

  const sortIds = (ids: string[]) =>
    ids.sort((a, b) => compareIds(byId[a], byId[b]))
  for (const p in childrenOf) sortIds(childrenOf[p])

  // Rootless cycles: a strongly-connected component with no parentless entry
  // (nothing outside it points in) is unreachable from any natural root, so it
  // would vanish from the unfolding. Find such orphaned nodes by BFS from the
  // current roots over the child edges, then promote the best representative of
  // each orphaned region to a synthetic root so it still renders. "Best" = the
  // node whose own present parents are all themselves orphaned (a true entry to
  // the component), preferring lower compareIds order; falls back to the lowest
  // unreached id if every node in the region has an external-looking parent.
  const reached = new Set<string>()
  const queue = [...roots]
  while (queue.length) {
    const id = queue.shift()!
    if (reached.has(id)) continue
    reached.add(id)
    for (const c of childrenOf[id] ?? []) if (!reached.has(c)) queue.push(c)
  }
  const orphans = Object.keys(byId).filter(id => !reached.has(id))
  while (orphans.some(id => !reached.has(id))) {
    const stillOrphan = orphans.filter(id => !reached.has(id))
    // Prefer an orphan all of whose parents are also still-orphaned — it's a
    // genuine entry point to the unreached region, not mid-cycle.
    const entries = stillOrphan.filter(id =>
      (parentsOf[id] ?? []).every(p => !reached.has(p)),
    )
    const pick = (entries.length ? entries : stillOrphan).sort((a, b) =>
      compareIds(byId[a], byId[b]),
    )[0]
    roots.push(pick)
    // BFS from the new synthetic root to mark its whole region reached.
    const q = [pick]
    while (q.length) {
      const id = q.shift()!
      if (reached.has(id)) continue
      reached.add(id)
      for (const c of childrenOf[id] ?? []) if (!reached.has(c)) q.push(c)
    }
  }

  sortIds(roots)

  const depthOf: Record<string, number> = {}
  const computing = new Set<string>()
  function depth(id: string): number {
    if (depthOf[id] !== undefined) return depthOf[id]
    if (computing.has(id)) return 0
    computing.add(id)
    const parents = parentsOf[id] ?? []
    const d = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(depth))
    computing.delete(id)
    depthOf[id] = d
    return d
  }
  for (const id in byId) depth(id)

  return {
    node: id => byId[id],
    parents: id => parentsOf[id] ?? [],
    children: id => childrenOf[id] ?? [],
    depth,
    roots,
    allIds: Object.keys(byId),
  }
}

// ----------------------------------------------------------------------------
// Unfolding: DFS from each root, emitting one {nodeId, depth} per visit.
// Multi-parent nodes appear multiple times — once per path that reaches them.
// ----------------------------------------------------------------------------

export type UnfoldingRow = {
  nodeId: string
  depth: number
  // Ancestor path from a root down to this row's parent (exclusive of self).
  // [] for depth-0 rows.
  pathToParent: string[]
  // Index of this row's parent row in the unfolding. -1 for roots.
  parentIdx: number
  // 'node'    = an ordinary unfolded node row.
  // 'backedge' = a cycle marker: this row's nodeId already appears as one of its
  //   own ancestors on this path, so descending would loop. We emit a leaf
  //   marker row instead of recursing. `backedgeTo` is the posIdx of that
  //   ancestor row (for a self-loop A→A it's the immediate parent).
  kind: 'node' | 'backedge'
  // Only set when kind === 'backedge': the ancestor row this edge loops back to.
  backedgeTo?: number
}

export function fullUnfolding(graph: Graph): UnfoldingRow[] {
  const out: UnfoldingRow[] = []
  // posIdx of each ancestor on the current path, keyed by nodeId, so a back-edge
  // can name the exact ancestor row it loops to.
  const ancestorPos = new Map<string, number>()

  function walk(
    id: string,
    depth: number,
    pathToParent: string[],
    parentIdx: number,
  ) {
    // Cycle: this node already sits on the path from the root to here. Emit a
    // leaf back-edge marker pointing at that ancestor row and do NOT recurse
    // (which would loop forever / blow the stack). Covers self-loops (A→A: the
    // ancestor is the immediate parent) too.
    if (pathToParent.includes(id)) {
      out.push({
        nodeId: id,
        depth,
        pathToParent,
        parentIdx,
        kind: 'backedge',
        backedgeTo: ancestorPos.get(id),
      })
      return
    }
    const myIdx = out.length
    out.push({ nodeId: id, depth, pathToParent, parentIdx, kind: 'node' })
    const nextPath = [...pathToParent, id]
    ancestorPos.set(id, myIdx)
    for (const c of graph.children(id)) walk(c, depth + 1, nextPath, myIdx)
    ancestorPos.delete(id)
  }
  for (const r of graph.roots) walk(r, 0, [], -1)
  return out
}
