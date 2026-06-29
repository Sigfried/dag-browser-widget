import { describe, expect, it } from 'vitest'
import { buildGraph, fullUnfolding, type Node } from './graph'

// A small polyhierarchy used across tests:
//
//   A            B
//   ├─ C         └─ C   (C has two parents: A and B)
//   │  └─ D
//   └─ E
//
const NODES: Node[] = [
  { id: 'A', name: 'A', parentIds: [] },
  { id: 'B', name: 'B', parentIds: [] },
  { id: 'C', name: 'C', parentIds: ['A', 'B'] },
  { id: 'D', name: 'D', parentIds: ['C'] },
  { id: 'E', name: 'E', parentIds: ['A'] },
]

describe('buildGraph', () => {
  it('identifies roots (no parents)', () => {
    const g = buildGraph(NODES)
    expect(g.roots).toEqual(['A', 'B'])
  })

  it('records children of each node', () => {
    const g = buildGraph(NODES)
    expect(g.children('A')).toEqual(['C', 'E'])
    expect(g.children('B')).toEqual(['C'])
    expect(g.children('C')).toEqual(['D'])
    expect(g.children('D')).toEqual([])
  })

  it('records multiple parents', () => {
    const g = buildGraph(NODES)
    expect(g.parents('C').sort()).toEqual(['A', 'B'])
  })

  it('computes depth as longest path from a root', () => {
    const g = buildGraph(NODES)
    expect(g.depth('A')).toBe(0)
    expect(g.depth('C')).toBe(1)
    expect(g.depth('D')).toBe(2)
  })

  it('ignores parentIds that point to missing nodes', () => {
    const g = buildGraph([
      { id: 'X', name: 'X', parentIds: ['ghost'] },
    ])
    expect(g.roots).toEqual(['X'])
    expect(g.parents('X')).toEqual([])
  })

  it('does not blow up on a cycle (depth returns 0 for the cycle)', () => {
    const g = buildGraph([
      { id: 'P', name: 'P', parentIds: ['Q'] },
      { id: 'Q', name: 'Q', parentIds: ['P'] },
    ])
    expect(() => g.depth('P')).not.toThrow()
  })

  it('promotes a synthetic root for a rootless cycle (no parentless entry)', () => {
    // P ↔ Q with no outside entry: neither is parentless, so without a fallback
    // the whole component would vanish. One of them must become a root.
    const g = buildGraph([
      { id: 'P', name: 'P', parentIds: ['Q'] },
      { id: 'Q', name: 'Q', parentIds: ['P'] },
    ])
    expect(g.roots.length).toBe(1)
    expect(['P', 'Q']).toContain(g.roots[0])
    // Every node is now reachable in the unfolding.
    const seen = new Set(fullUnfolding(g).map(r => r.nodeId))
    expect(seen.has('P')).toBe(true)
    expect(seen.has('Q')).toBe(true)
  })

  it('keeps natural roots and only promotes orphaned components', () => {
    // A normal rooted tree PLUS a separate rootless 2-cycle (X↔Y).
    const g = buildGraph([
      { id: 'root', name: 'root', parentIds: [] },
      { id: 'child', name: 'child', parentIds: ['root'] },
      { id: 'X', name: 'X', parentIds: ['Y'] },
      { id: 'Y', name: 'Y', parentIds: ['X'] },
    ])
    // 'root' stays a root; exactly one of X/Y is promoted.
    expect(g.roots).toContain('root')
    expect(g.roots.length).toBe(2)
    expect(g.roots.some(r => r === 'X' || r === 'Y')).toBe(true)
  })

  it('orders children by trailing number then name', () => {
    const g = buildGraph([
      { id: 'root', name: 'root', parentIds: [] },
      { id: 'item-10', name: 'ten', parentIds: ['root'] },
      { id: 'item-2', name: 'two', parentIds: ['root'] },
    ])
    expect(g.children('root')).toEqual(['item-2', 'item-10'])
  })
})

describe('fullUnfolding', () => {
  it('emits one row per path, so multi-parent nodes appear multiple times', () => {
    const g = buildGraph(NODES)
    const rows = fullUnfolding(g)
    const cCopies = rows.filter(r => r.nodeId === 'C')
    expect(cCopies).toHaveLength(2) // once under A, once under B
    const dCopies = rows.filter(r => r.nodeId === 'D')
    expect(dCopies).toHaveLength(2) // D follows C down both paths
  })

  it('produces DFS pre-order (every parentIdx is lower than its row)', () => {
    const g = buildGraph(NODES)
    const rows = fullUnfolding(g)
    rows.forEach((row, i) => {
      expect(row.parentIdx).toBeLessThan(i)
    })
  })

  it('roots have parentIdx -1 and depth 0', () => {
    const g = buildGraph(NODES)
    const rows = fullUnfolding(g)
    const roots = rows.filter(r => r.parentIdx === -1)
    expect(roots.map(r => r.nodeId)).toEqual(['A', 'B'])
    roots.forEach(r => expect(r.depth).toBe(0))
  })

  it('pathToParent is the ancestor chain to the parent', () => {
    const g = buildGraph(NODES)
    const rows = fullUnfolding(g)
    const dUnderA = rows.find(
      r => r.nodeId === 'D' && rows[r.parentIdx].pathToParent.includes('A'),
    )
    expect(dUnderA?.pathToParent).toEqual(['A', 'C'])
  })

  it('skips cyclic descent without infinite recursion', () => {
    const g = buildGraph([
      { id: 'a', name: 'a', parentIds: [] },
      { id: 'b', name: 'b', parentIds: ['a', 'c'] },
      { id: 'c', name: 'c', parentIds: ['b'] },
    ])
    expect(() => fullUnfolding(g)).not.toThrow()
  })

  it('emits a back-edge marker row for a cycle, pointing at the ancestor', () => {
    // root → a → b → c → a   (c's child a loops back to its ancestor a)
    const g = buildGraph([
      { id: 'root', name: 'root', parentIds: [] },
      { id: 'a', name: 'a', parentIds: ['root', 'c'] },
      { id: 'b', name: 'b', parentIds: ['a'] },
      { id: 'c', name: 'c', parentIds: ['b'] },
    ])
    const rows = fullUnfolding(g)
    const back = rows.filter(r => r.kind === 'backedge')
    expect(back).toHaveLength(1)
    expect(back[0].nodeId).toBe('a')
    // It loops back to the ancestor 'a' row (the real unfolded copy).
    const aRow = rows.findIndex(r => r.nodeId === 'a' && r.kind === 'node')
    expect(back[0].backedgeTo).toBe(aRow)
  })

  it('emits a self-loop back-edge whose target is the immediate parent', () => {
    // root → a → a   (a is its own child as well as root's)
    const g = buildGraph([
      { id: 'root', name: 'root', parentIds: [] },
      { id: 'a', name: 'a', parentIds: ['root', 'a'] },
    ])
    const rows = fullUnfolding(g)
    const back = rows.filter(r => r.kind === 'backedge')
    expect(back).toHaveLength(1)
    expect(back[0].nodeId).toBe('a')
    expect(back[0].backedgeTo).toBe(back[0].parentIdx)
  })

  it('marks ordinary rows kind:node', () => {
    const g = buildGraph(NODES)
    const rows = fullUnfolding(g)
    expect(rows.every(r => r.kind === 'node')).toBe(true)
  })
})
