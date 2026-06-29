import { describe, expect, it } from 'vitest'
import { buildGraph, fullUnfolding, type Node } from './graph'
import {
  ancestorPath,
  computeToggleState,
  computeVisible,
  decorateRows,
  descendantPosIdxs,
} from './visibility'

//   A                 B
//   ├─ C  ───────────┘   (C under both A and B)
//   │  └─ D
//   └─ E
const NODES: Node[] = [
  { id: 'A', name: 'A', parentIds: [] },
  { id: 'B', name: 'B', parentIds: [] },
  { id: 'C', name: 'C', parentIds: ['A', 'B'] },
  { id: 'D', name: 'D', parentIds: ['C'] },
  { id: 'E', name: 'E', parentIds: ['A'] },
]

function setup(nodes: Node[] = NODES) {
  const graph = buildGraph(nodes)
  const unfolding = fullUnfolding(graph)
  const pos = (nodeId: string, nth = 0) => {
    const idxs = unfolding
      .map((r, i) => (r.nodeId === nodeId ? i : -1))
      .filter(i => i >= 0)
    return idxs[nth]
  }
  return { graph, unfolding, pos }
}

describe('ancestorPath', () => {
  it('returns root-to-self chain inclusive', () => {
    const { unfolding, pos } = setup()
    const dUnderA = pos('D', 0) // first D copy is under A
    const chain = ancestorPath(dUnderA, unfolding)
    const names = chain.map(i => unfolding[i].nodeId)
    expect(names).toEqual(['A', 'C', 'D'])
  })

  it('stopAt excludes the stop ancestor', () => {
    const { unfolding, pos } = setup()
    const dUnderA = pos('D', 0)
    const aPos = pos('A')
    const chain = ancestorPath(dUnderA, unfolding, aPos)
    const names = chain.map(i => unfolding[i].nodeId)
    expect(names).toEqual(['C', 'D']) // A excluded, D included
  })
})

describe('computeVisible', () => {
  it('shows only forceVisible + path-protection when nothing expanded', () => {
    const { unfolding, pos } = setup()
    const dUnderA = pos('D', 0)
    const visible = computeVisible(unfolding, new Set([dUnderA]), new Set())
    const names = [...visible].map(i => unfolding[i].nodeId).sort()
    // Path protection brings A and C along so the chain to D connects.
    expect(names).toEqual(['A', 'C', 'D'])
  })

  it('expands children of an expanded, visible node', () => {
    const { unfolding, pos } = setup()
    const aPos = pos('A')
    const visible = computeVisible(unfolding, new Set([aPos]), new Set([aPos]))
    const names = [...visible].map(i => unfolding[i].nodeId).sort()
    // A visible + expanded -> its children C and E become visible.
    expect(names).toEqual(['A', 'C', 'E'])
  })

  it('does not show children of a collapsed node', () => {
    const { unfolding, pos } = setup()
    const aPos = pos('A')
    const visible = computeVisible(unfolding, new Set([aPos]), new Set())
    expect([...visible].map(i => unfolding[i].nodeId)).toEqual(['A'])
  })

  it('bridges between two forceVisibles (path-protection)', () => {
    const { unfolding, pos } = setup()
    const aPos = pos('A')
    const dUnderA = pos('D', 0)
    const visible = computeVisible(
      unfolding,
      new Set([aPos, dUnderA]),
      new Set(),
    )
    const names = [...visible].map(i => unfolding[i].nodeId).sort()
    expect(names).toEqual(['A', 'C', 'D']) // C bridges A and D
  })
})

describe('descendantPosIdxs', () => {
  it('returns the whole subtree under a path (DFS-contiguous)', () => {
    const { unfolding, pos } = setup()
    const aPos = pos('A') // A -> C -> D, and A -> E
    const names = descendantPosIdxs(aPos, unfolding).map(
      i => unfolding[i].nodeId,
    )
    expect(names).toEqual(['C', 'D', 'E'])
  })

  it('is empty for a leaf', () => {
    const { unfolding, pos } = setup()
    expect(descendantPosIdxs(pos('E'), unfolding)).toEqual([])
  })

  it('covers only this copy’s subtree, not other copies elsewhere', () => {
    const { unfolding, pos } = setup()
    // C under B has its own D copy; C under A has a different D copy.
    const cUnderB = pos('C', 1)
    const sub = descendantPosIdxs(cUnderB, unfolding).map(
      i => unfolding[i].nodeId,
    )
    expect(sub).toEqual(['D'])
  })
})

describe('decorateRows — descendantCount', () => {
  it('counts distinct descendant nodes below each row', () => {
    const { graph, unfolding, pos } = setup()
    const aPos = pos('A')
    const visible = computeVisible(unfolding, new Set([aPos]), new Set([aPos]))
    const rows = decorateRows(unfolding, visible, graph)
    // A's subtree under this path: C, D, E -> 3 distinct nodes.
    expect(rows.find(r => r.nodeId === 'A')!.descendantCount).toBe(3)
    // E is a leaf.
    expect(rows.find(r => r.nodeId === 'E')!.descendantCount).toBe(0)
  })
})

describe('computeToggleState', () => {
  it('classifies leaf / collapsed / expanded / partial', () => {
    expect(computeToggleState(0, 0)).toBe('leaf')
    expect(computeToggleState(3, 0)).toBe('collapsed')
    expect(computeToggleState(3, 3)).toBe('expanded')
    expect(computeToggleState(3, 1)).toBe('partial')
  })
})

describe('decorateRows — rails', () => {
  it('draws tee for non-last child and corner for last child', () => {
    const { graph, unfolding, pos } = setup()
    const aPos = pos('A')
    const visible = computeVisible(unfolding, new Set([aPos]), new Set([aPos]))
    const rows = decorateRows(unfolding, visible, graph)
    const c = rows.find(r => r.nodeId === 'C')!
    const e = rows.find(r => r.nodeId === 'E')!
    // A has children [C, E]; C is non-last -> tee, E is last -> corner.
    expect(c.rails.at(-1)).toBe('tee')
    expect(e.rails.at(-1)).toBe('corner')
  })

  it('renderDepth equals number of rails', () => {
    const { graph, unfolding, pos } = setup()
    const aPos = pos('A')
    const visible = computeVisible(unfolding, new Set([aPos]), new Set([aPos]))
    const rows = decorateRows(unfolding, visible, graph)
    rows.forEach(r => expect(r.renderDepth).toBe(r.rails.length))
  })
})

describe('decorateRows — alsoUnder (DAG de-duplication)', () => {
  it('a visible copy lists the OTHER parents of a multi-parent node', () => {
    const { graph, unfolding, pos } = setup()
    // Show C under A (expand A). C also lives under B -> alsoUnder should point
    // to the B copy.
    const aPos = pos('A')
    const visible = computeVisible(unfolding, new Set([aPos]), new Set([aPos]))
    const rows = decorateRows(unfolding, visible, graph)
    const c = rows.find(r => r.nodeId === 'C')!
    expect(c.alsoUnderPaths).toHaveLength(1)
    expect(c.alsoUnderPaths[0].path).toBe('B')
    // The target points at the OTHER (B) copy of C.
    expect(unfolding[c.alsoUnderPaths[0].targetPosIdx].nodeId).toBe('C')
    expect(c.alsoUnderPaths[0].targetPosIdx).not.toBe(c.posIndex)
  })

  it('single-parent nodes have no alsoUnder links', () => {
    const { graph, unfolding, pos } = setup()
    const aPos = pos('A')
    const visible = computeVisible(unfolding, new Set([aPos]), new Set([aPos]))
    const rows = decorateRows(unfolding, visible, graph)
    expect(rows.find(r => r.nodeId === 'E')!.alsoUnderPaths).toEqual([])
  })
})

describe('decorateRows — revealAt (hidden selected node)', () => {
  it('attaches a reveal link to the closest visible ancestor of a hidden selected node', () => {
    const { graph, unfolding, pos } = setup()
    // B is visible and collapsed; C (selected) lives under B but is hidden.
    const bPos = pos('B')
    const visible = computeVisible(unfolding, new Set([bPos]), new Set())
    const rows = decorateRows(unfolding, visible, graph, new Set(['C']))
    const b = rows.find(r => r.nodeId === 'B')!
    expect(b.revealAt).toHaveLength(1)
    expect(b.revealAt[0].path).toBe('C')
    expect(unfolding[b.revealAt[0].targetPosIdx].nodeId).toBe('C')
  })

  it('no reveal link when a copy of the selected node is already visible', () => {
    const { graph, unfolding, pos } = setup()
    const aPos = pos('A')
    // Expand A -> C is visible. Even though another C copy under B is hidden,
    // the visible copy suppresses the reveal link (alsoUnder covers it).
    const visible = computeVisible(unfolding, new Set([aPos]), new Set([aPos]))
    const rows = decorateRows(unfolding, visible, graph, new Set(['C']))
    rows.forEach(r => expect(r.revealAt).toEqual([]))
  })

  it('one reveal link per selected node', () => {
    const { graph, unfolding, pos } = setup()
    const bPos = pos('B')
    const visible = computeVisible(unfolding, new Set([bPos]), new Set())
    // D is also hidden and selected; its closest visible ancestor is also B.
    const rows = decorateRows(unfolding, visible, graph, new Set(['C', 'D']))
    const b = rows.find(r => r.nodeId === 'B')!
    expect(b.revealAt).toHaveLength(2)
    const targets = b.revealAt.map(l => unfolding[l.targetPosIdx].nodeId).sort()
    expect(targets).toEqual(['C', 'D'])
  })

  it('returns [] when nothing is visible', () => {
    const { graph, unfolding } = setup()
    expect(decorateRows(unfolding, new Set(), graph)).toEqual([])
  })
})

describe('decorateRows — cycle back-edges', () => {
  // root → a → b → c → a   (the cycle a→b→c→a hangs off a real root)
  const CYCLE: Node[] = [
    { id: 'root', name: 'root', parentIds: [] },
    { id: 'a', name: 'a', parentIds: ['root', 'c'] },
    { id: 'b', name: 'b', parentIds: ['a'] },
    { id: 'c', name: 'c', parentIds: ['b'] },
  ]

  it('decorates a back-edge row as a leaf with a loop-back link', () => {
    const { graph, unfolding } = setup(CYCLE)
    const all = new Set(unfolding.map((_, i) => i))
    const rows = decorateRows(unfolding, all, graph)
    const back = rows.find(r => r.backedge)
    expect(back).toBeDefined()
    expect(back!.toggleState).toBe('leaf')
    expect(back!.childCount).toBe(0)
    expect(back!.descendantCount).toBe(0)
    // Loops back to the real unfolded 'a' row.
    expect(unfolding[back!.backedge!.targetPosIdx].nodeId).toBe('a')
    expect(back!.backedge!.selfLoop).toBe(false)
    // Path names the ancestor it loops to (root → a), not the cycle traversal.
    expect(back!.backedge!.path).toBe('root/a')
  })

  it('a back-edge is not counted as an also-under copy of the node', () => {
    const { graph, unfolding } = setup(CYCLE)
    const all = new Set(unfolding.map((_, i) => i))
    const rows = decorateRows(unfolding, all, graph)
    // The real unfolded 'a' row must NOT get an "also under" link pointing at
    // the back-edge marker (that marker isn't a separate copy).
    const realA = rows.find(r => r.nodeId === 'a' && !r.backedge)
    expect(realA!.alsoUnderPaths).toEqual([])
  })

  it('flags a self-loop and targets the immediate parent', () => {
    const { graph, unfolding } = setup([
      { id: 'root', name: 'root', parentIds: [] },
      { id: 'a', name: 'a', parentIds: ['root', 'a'] },
    ])
    const all = new Set(unfolding.map((_, i) => i))
    const rows = decorateRows(unfolding, all, graph)
    const back = rows.find(r => r.backedge)
    expect(back!.backedge!.selfLoop).toBe(true)
    expect(unfolding[back!.backedge!.targetPosIdx].nodeId).toBe('a')
  })
})
