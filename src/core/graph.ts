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
}

export function fullUnfolding(graph: Graph): UnfoldingRow[] {
  const out: UnfoldingRow[] = []
  function walk(
    id: string,
    depth: number,
    pathToParent: string[],
    parentIdx: number,
  ) {
    // The DAG isn't supposed to contain cycles, but if one slips through skip
    // the recursive descent so we don't blow the stack.
    if (pathToParent.includes(id)) return
    const myIdx = out.length
    out.push({ nodeId: id, depth, pathToParent, parentIdx })
    const nextPath = [...pathToParent, id]
    for (const c of graph.children(id)) walk(c, depth + 1, nextPath, myIdx)
  }
  for (const r of graph.roots) walk(r, 0, [], -1)
  return out
}
