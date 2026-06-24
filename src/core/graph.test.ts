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
})
