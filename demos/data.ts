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
// Demo 2: a music-genre polyhierarchy (a true DAG). Relationships are taken
// from MusicBrainz genre data (CC0 / public domain). `parentIds` combines two
// MusicBrainz relationship types: "subgenre of" (a strict parent) and
// "fusion of" (two or more parents — these are the multi-parent nodes). Those
// fusion genres are where the "★ also under …" de-duplication links appear;
// because some fusion parents are themselves fusions, several nodes are
// reachable by more than one path from a common ancestor (visible diamonds).
//
// Genre names and relationships are derived from MusicBrainz
// (https://musicbrainz.org/genres), whose core data is released under CC0 1.0
// (public domain). MusicBrainz is a community-maintained project; this demo
// includes a small hand-picked subset of its genre graph.
// ---------------------------------------------------------------------------
export const GENRES: Node[] = [
  // A single synthetic root, so the demo is a tree-rooted DAG (one top node)
  // rather than a forest of 12 top-level genres. This is also how a real
  // consumer typically frames things: one entry point above the real data.
  { id: 'root', name: 'Music Genres', parentIds: [] },

  // Top-level genres (children of the synthetic root).
  { id: 'jazz', name: 'Jazz', parentIds: ['root'] },
  { id: 'rock', name: 'Rock', parentIds: ['root'] },
  { id: 'hip-hop', name: 'Hip Hop', parentIds: ['root'] },
  { id: 'metal', name: 'Metal', parentIds: ['root'] },
  { id: 'funk', name: 'Funk', parentIds: ['root'] },
  { id: 'punk-rock', name: 'Punk Rock', parentIds: ['root'] },
  { id: 'ska', name: 'Ska', parentIds: ['root'] },
  { id: 'electronic', name: 'Electronic', parentIds: ['root'] },
  { id: 'country', name: 'Country', parentIds: ['root'] },
  { id: 'swing', name: 'Swing', parentIds: ['root'] },
  { id: 'hardcore-punk', name: 'Hardcore Punk', parentIds: ['root'] },
  { id: 'thrash-metal', name: 'Thrash Metal', parentIds: ['root'] },

  // Single-parent subgenres.
  { id: 'jazz-fusion', name: 'Jazz Fusion', parentIds: ['jazz'] },
  { id: 'folk-metal', name: 'Folk Metal', parentIds: ['metal'] },
  { id: 'celtic-metal', name: 'Celtic Metal', parentIds: ['folk-metal'] },
  { id: 'medieval-metal', name: 'Medieval Metal', parentIds: ['folk-metal'] },
  { id: 'jazz-rap', name: 'Jazz Rap', parentIds: ['hip-hop'] },
  {
    id: 'alternative-metal',
    name: 'Alternative Metal',
    parentIds: ['metal'],
  },
  {
    id: 'nu-metal',
    name: 'Nu Metal',
    parentIds: ['alternative-metal'],
  },
  {
    id: 'rap-metal',
    name: 'Rap Metal',
    parentIds: ['alternative-metal'],
  },
  { id: 'folktronica', name: 'Folktronica', parentIds: ['electronic'] },

  // Multi-parent "fusion of" genres — the DAG part.
  { id: 'funk-rock', name: 'Funk Rock', parentIds: ['funk', 'rock'] },
  { id: 'rap-rock', name: 'Rap Rock', parentIds: ['hip-hop', 'rock'] },
  { id: 'ska-punk', name: 'Ska Punk', parentIds: ['punk-rock', 'ska'] },
  {
    id: 'country-rock',
    name: 'Country Rock',
    parentIds: ['country', 'rock'],
  },
  {
    id: 'electro-swing',
    name: 'Electro Swing',
    parentIds: ['electronic', 'swing'],
  },
  {
    id: 'crossover-thrash',
    name: 'Crossover Thrash',
    parentIds: ['hardcore-punk', 'thrash-metal'],
  },
  // Fusion of a fusion: "rock" reaches Funk Metal via two paths
  // (rock → funk-rock → funk-metal, and rock → … ). A visible diamond.
  {
    id: 'funk-metal',
    name: 'Funk Metal',
    parentIds: ['funk-rock', 'metal'],
  },

  // Subgenres of fusion genres.
  { id: 'skacore', name: 'Skacore', parentIds: ['ska-punk'] },
  {
    id: 'crack-rock-steady',
    name: 'Crack Rock Steady',
    parentIds: ['ska-punk'],
  },
  {
    id: 'cosmic-country',
    name: 'Cosmic Country',
    parentIds: ['country-rock'],
  },
]

// ---------------------------------------------------------------------------
// Demo 3: a dependency digraph WITH cycles. Software package "depends on"
// edges form a directed graph that is not acyclic: a few packages depend on
// each other (directly or transitively). The widget unfolds each package once;
// when a dependency loops back to a package already on the path, it shows a
// "⟲ loops back to …" back-edge marker instead of recursing forever. The
// self-referential `recursive-helper` (depends on itself) shows the self-loop
// case. Synthetic, public, non-informatics data.
// ---------------------------------------------------------------------------
// Convention (same as the other demos): a node's `parentIds` are the nodes
// that sit ABOVE it in the tree. Reading top-down, "X is a parent of Y" means
// the widget can show Y nested under X. The interesting structure:
//   • A 2-cycle:    core → utils → core
//   • A 3-hop cycle: store → events → dispatch → store
//   • A self-loop:   recursive-helper → recursive-helper
//   • A plain DAG diamond: utils also sits under store, so it gets a real
//     "★ also under" link in addition to its cycle marker.
// To make a child loop back UP to an ancestor, that ancestor is listed among
// the descendant's parentIds (so the descendant becomes a "parent" of the
// ancestor, closing the loop). The unfolder detects this on descent and shows
// a "⟲ loops back to …" marker instead of recursing.
export const DEPS: Node[] = [
  { id: 'app', name: 'app', parentIds: [] },

  // app → ui → theme → tokens  (an ordinary acyclic branch)
  { id: 'ui', name: 'ui', parentIds: ['app'] },
  { id: 'theme', name: 'theme', parentIds: ['ui'] },
  { id: 'tokens', name: 'tokens', parentIds: ['theme'] },

  // core ↓ utils ↓ (back to core): the 2-cycle. core is under app; utils is
  // under core AND under store (the diamond → "★ also under"); core is also
  // under utils, which closes the loop.
  { id: 'core', name: 'core', parentIds: ['app', 'utils'] },
  { id: 'utils', name: 'utils', parentIds: ['core', 'store'] },

  // store → events → dispatch → store: the 3-hop cycle. dispatch is under
  // events (under store); store is also under dispatch, closing the loop.
  { id: 'store', name: 'store', parentIds: ['app', 'dispatch'] },
  { id: 'events', name: 'events', parentIds: ['store'] },
  { id: 'dispatch', name: 'dispatch', parentIds: ['events'] },

  // A self-loop: a package that lists itself as a dependency.
  {
    id: 'recursive-helper',
    name: 'recursive-helper',
    parentIds: ['tokens', 'recursive-helper'],
  },
]

export type DemoKey = 'genres' | 'files' | 'deps'

export type DemoConfig = {
  label: string
  nodes: Node[]
  selected: string[]
  blurb: string
  credit?: { text: string; href: string }
}

export const DEMOS: Record<DemoKey, DemoConfig> = {
  genres: {
    label: 'Music genres (DAG)',
    nodes: GENRES,
    selected: [],
    blurb:
      'A polyhierarchy: genres like “Funk Rock”, “Rap Rock” and “Funk Metal” ' +
      'sit under more than one parent. Each appears once in full; its other ' +
      'parents become “★ also under …” links. Expand a branch to see them, or ' +
      'double-click a toggle to expand a whole subtree. Select a genre, then ' +
      'collapse the branch it lives under, to see a “↳ reveal at …” breadcrumb.',
    credit: {
      text: 'Genre data from MusicBrainz (CC0)',
      href: 'https://musicbrainz.org/genres',
    },
  },
  files: {
    label: 'File tree',
    nodes: FILES,
    selected: [],
    blurb:
      'A plain tree (every file has one parent). No “also under” links here — ' +
      'this shows the widget behaves as an ordinary collapsible file browser ' +
      'when the data is a pure tree.',
  },
  deps: {
    label: 'Dependencies (cyclic)',
    nodes: DEPS,
    selected: [],
    blurb:
      'A directed graph that is NOT acyclic. Some packages depend on each ' +
      'other (core ⇄ utils), some form longer loops (store → events → ' +
      'dispatch → store), and one depends on itself (recursive-helper). The ' +
      'widget unfolds each package once; where a dependency loops back to a ' +
      'package already on the path, it shows a “⟲ loops back to …” marker ' +
      'instead of recursing forever. `utils` also sits under two parents, so ' +
      'it carries a normal “★ also under …” link too.',
  },
}
