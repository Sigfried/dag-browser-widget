import type { Node } from '../src/core'

// ---------------------------------------------------------------------------
// Demo 1: a file-system tree (pure tree — every node has exactly one parent).
// ---------------------------------------------------------------------------
export const FILES: Node[] = [
  { id: 'root', name: 'project/', parentIds: [] },
  { id: 'src', name: 'src/', parentIds: ['root'] },
  { id: 'core', name: 'core/', parentIds: ['src'] },
  { id: 'graph.ts', name: 'graph.ts', parentIds: ['core'] },
  { id: 'visibility.ts', name: 'visibility.ts', parentIds: ['core'] },
  { id: 'react', name: 'react/', parentIds: ['src'] },
  { id: 'DagBrowser.tsx', name: 'DagBrowser.tsx', parentIds: ['react'] },
  { id: 'parts.tsx', name: 'parts.tsx', parentIds: ['react'] },
  { id: 'index.ts', name: 'index.ts', parentIds: ['src'] },
  { id: 'demos', name: 'demos/', parentIds: ['root'] },
  { id: 'app.tsx', name: 'app.tsx', parentIds: ['demos'] },
  { id: 'data.ts', name: 'data.ts', parentIds: ['demos'] },
  { id: 'pkg', name: 'package.json', parentIds: ['root'] },
  { id: 'readme', name: 'README.md', parentIds: ['root'] },
]

// ---------------------------------------------------------------------------
// Demo 2: a music-genre polyhierarchy (a true DAG). Several genres descend
// from more than one parent — e.g. "Jazz Fusion" is both Jazz and Rock, and
// "Acid Jazz" is both Jazz and Electronic. These multi-parent nodes are where
// the "★ also under …" de-duplication links appear.
// ---------------------------------------------------------------------------
export const GENRES: Node[] = [
  { id: 'g-jazz', name: 'Jazz', parentIds: [] },
  { id: 'g-rock', name: 'Rock', parentIds: [] },
  { id: 'g-electronic', name: 'Electronic', parentIds: [] },

  { id: 'g-bebop', name: 'Bebop', parentIds: ['g-jazz'] },
  { id: 'g-swing', name: 'Swing', parentIds: ['g-jazz'] },

  { id: 'g-prog', name: 'Progressive Rock', parentIds: ['g-rock'] },
  { id: 'g-punk', name: 'Punk', parentIds: ['g-rock'] },

  { id: 'g-house', name: 'House', parentIds: ['g-electronic'] },
  { id: 'g-techno', name: 'Techno', parentIds: ['g-electronic'] },

  // Multi-parent nodes — the DAG part:
  { id: 'g-fusion', name: 'Jazz Fusion', parentIds: ['g-jazz', 'g-rock'] },
  {
    id: 'g-acid-jazz',
    name: 'Acid Jazz',
    parentIds: ['g-jazz', 'g-electronic'],
  },
  {
    id: 'g-electro-swing',
    name: 'Electro Swing',
    parentIds: ['g-swing', 'g-house'],
  },
  // A grandchild of a multi-parent node, so it unfolds under every path too:
  {
    id: 'g-nu-jazz',
    name: 'Nu Jazz',
    parentIds: ['g-fusion', 'g-acid-jazz'],
  },
]

export type DemoKey = 'genres' | 'files'

export const DEMOS: Record<
  DemoKey,
  { label: string; nodes: Node[]; selected: string[]; blurb: string }
> = {
  genres: {
    label: 'Music genres (DAG)',
    nodes: GENRES,
    selected: ['g-nu-jazz'],
    blurb:
      'A polyhierarchy: genres like “Jazz Fusion”, “Acid Jazz” and “Nu Jazz” ' +
      'sit under more than one parent. Each appears once in full; its other ' +
      'parents become “★ also under …” links. Collapse a branch the selected ' +
      'genre lives under and a “↳ reveal at …” breadcrumb appears.',
  },
  files: {
    label: 'File tree',
    nodes: FILES,
    selected: ['graph.ts'],
    blurb:
      'A plain tree (every file has one parent). No “also under” links here — ' +
      'this shows the widget behaves as an ordinary collapsible file browser ' +
      'when the data is a pure tree.',
  },
}
