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
    const { forceVisible } = seedFromSelected(unfolding, ['nope'])
    expect(forceVisible.size).toBe(0)
  })

  it('empty selection seeds nothing', () => {
    const graph = buildGraph(NODES)
    const unfolding = fullUnfolding(graph)
    const { forceVisible, expanded } = seedFromSelected(unfolding, [])
    expect(forceVisible.size).toBe(0)
    expect(expanded.size).toBe(0)
  })
})
