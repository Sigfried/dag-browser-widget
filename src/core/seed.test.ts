import { describe, expect, it } from 'vitest'
import { buildGraph, fullUnfolding, type Node } from './graph'
import { computeVisible } from './visibility'
import { seedFromSelected } from './seed'

const NODES: Node[] = [
  { id: 'A', name: 'A', parentIds: [] },
  { id: 'B', name: 'B', parentIds: [] },
  { id: 'C', name: 'C', parentIds: ['A', 'B'] },
  { id: 'D', name: 'D', parentIds: ['C'] },
  { id: 'E', name: 'E', parentIds: ['A'] },
]

describe('seedFromSelected', () => {
  it('opens the path from root to each selected node', () => {
    const graph = buildGraph(NODES)
    const unfolding = fullUnfolding(graph)
    const { forceVisible, expanded } = seedFromSelected(unfolding, ['D'])
    const visible = computeVisible(unfolding, forceVisible, expanded)
    const names = new Set([...visible].map(i => unfolding[i].nodeId))
    // The first copy of D is under A -> A/C/D become visible.
    expect(names.has('A')).toBe(true)
    expect(names.has('C')).toBe(true)
    expect(names.has('D')).toBe(true)
  })

  it('expands the selected node so its own children show', () => {
    const graph = buildGraph(NODES)
    const unfolding = fullUnfolding(graph)
    const { forceVisible, expanded } = seedFromSelected(unfolding, ['C'])
    const visible = computeVisible(unfolding, forceVisible, expanded)
    const names = new Set([...visible].map(i => unfolding[i].nodeId))
    expect(names.has('D')).toBe(true) // C expanded -> D visible
  })

  it('handles unknown ids gracefully', () => {
    const graph = buildGraph(NODES)
    const unfolding = fullUnfolding(graph)
    const { forceVisible, expanded } = seedFromSelected(unfolding, ['nope'])
    // Unknown id contributes nothing, but roots are still seeded.
    expect(expanded.size).toBe(0)
    const names = [...forceVisible].map(i => unfolding[i].nodeId).sort()
    expect(names).toEqual(['A', 'B'])
  })

  it('empty selection shows all roots, collapsed', () => {
    const graph = buildGraph(NODES)
    const unfolding = fullUnfolding(graph)
    const { forceVisible, expanded } = seedFromSelected(unfolding, [])
    const visible = computeVisible(unfolding, forceVisible, expanded)
    // Both roots visible; nothing expanded, so no children show.
    expect([...visible].map(i => unfolding[i].nodeId).sort()).toEqual([
      'A',
      'B',
    ])
    expect(expanded.size).toBe(0)
  })

  it('always shows all roots even when a selection is in a different branch', () => {
    const graph = buildGraph(NODES)
    const unfolding = fullUnfolding(graph)
    // Select E (under A). Root B has no selected descendant but must still show.
    const { forceVisible, expanded } = seedFromSelected(unfolding, ['E'])
    const visible = computeVisible(unfolding, forceVisible, expanded)
    const names = new Set([...visible].map(i => unfolding[i].nodeId))
    expect(names.has('B')).toBe(true)
  })

  it('levelsExpanded=1 reveals the roots’ direct children', () => {
    const graph = buildGraph(NODES)
    const unfolding = fullUnfolding(graph)
    const { forceVisible, expanded } = seedFromSelected(unfolding, [], 1)
    const visible = computeVisible(unfolding, forceVisible, expanded)
    const names = new Set([...visible].map(i => unfolding[i].nodeId))
    // Roots A, B + A's children C, E. D (depth 2) stays hidden.
    expect(names.has('C')).toBe(true)
    expect(names.has('E')).toBe(true)
    expect(names.has('D')).toBe(false)
  })

  it('levelsExpanded=0 (default) leaves children collapsed', () => {
    const graph = buildGraph(NODES)
    const unfolding = fullUnfolding(graph)
    const { expanded } = seedFromSelected(unfolding, [])
    expect(expanded.size).toBe(0)
  })
})
