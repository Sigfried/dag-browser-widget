# dag-browser-widget

[![npm](https://img.shields.io/npm/v/dag-browser-widget)](https://www.npmjs.com/package/dag-browser-widget)
[![license](https://img.shields.io/npm/l/dag-browser-widget)](./LICENSE)

**[Live demo →](https://sigfried.github.io/dag-browser-widget/)**

Browse a **DAG (polyhierarchy)** as a collapsible tree. A node that legitimately
lives under several parents is unfolded once in full; its other parents become
compact **"★ also under …"** links instead of duplicate subtrees. Selected nodes
that scroll off-screen after a collapse get a **"↳ reveal at …"** breadcrumb back.

The package is two layers:

- **`dag-browser-widget/core`** — ~400 lines of dependency-free TypeScript. No
  React, no DOM. Unfolds the DAG, computes which rows are visible under collapse,
  computes the rails (`├ │ └`), the also-under cross-references, and the
  reveal-at links. Fully unit-tested.
- **`dag-browser-widget`** — a thin React view over the core. Plain React +
  inline styles + one small CSS file. **No MUI, no router, no other UI deps.**

## Install

```bash
npm install dag-browser-widget
```

`react` and `react-dom` (>=18) are peer dependencies. Import the stylesheet once
in your app:

```ts
import 'dag-browser-widget/styles.css'
```

## Quick start

```tsx
import { DagBrowser, type Node } from 'dag-browser-widget'
import 'dag-browser-widget/styles.css'

const nodes: Node[] = [
  { id: 'jazz', name: 'Jazz', parentIds: [] },
  { id: 'rock', name: 'Rock', parentIds: [] },
  // A node with two parents — this is what makes it a DAG, not a tree:
  { id: 'fusion', name: 'Jazz Fusion', parentIds: ['jazz', 'rock'] },
]

export function Example() {
  return <DagBrowser nodes={nodes} selected={['fusion']} />
}
```

## The `Node` contract

The entire input is a flat list of nodes:

```ts
type Node = { id: string; name: string; parentIds: string[] }
```

A **tree** is just a DAG where every node has `parentIds.length <= 1`. Convert
your own data into `Node[]`; the widget does the rest. `parentIds` pointing at
ids not present in the list are ignored (those nodes become roots).

## Who owns what (important)

The boundary between you (the consumer) and the widget is deliberately small:

| You own | The widget owns |
| --- | --- |
| `selected` — which node ids matter to your app | `expanded` / collapse state |
| Row body: name, badges, highlight, buttons (`renderRow`) | rails, the toggle pill, child counts |
| What "selecting" means and how it looks | the also-under and reveal-at links |
| Your own click / hover / navigation handlers | the exit animation |

You **never** manipulate the widget's internal visibility directly. You pass
`selected`, and the widget:

1. always shows every root (top-level node),
2. on mount, opens the path from a root down to each selected node, and
3. shows a **"↳ reveal at …"** breadcrumb on the closest visible ancestor of any
   selected node that is currently collapsed off-screen — so a selection set
   from outside (a URL param, an external list) is never lost.

Changing `selected` at runtime updates the highlight and the reveal-at links but
**does not reset** the user's expand/collapse state. (In practice you select by
clicking a visible row, so there's nothing to reveal; the reveal-at breadcrumb
is for selections that arrive from outside the widget.) With no `selected`, the
widget opens at `levelsExpanded` levels (default: roots' children shown).

### Expanding rows

Each row's toggle pill (`▶`/`▷`/`▼`) controls its children:

- **Click** — expand one level (show direct children) or collapse.
- **Double-click** — expand the **entire subtree** below that row, when it runs
  deeper than its direct children. The tooltip shows the descendant count, e.g.
  *"Click: show 4 children · double-click: show all 11"*.

### Highlighting is your job

The widget does **not** style "selected" rows. `renderRow` receives
`isSelected`; do the highlighting (and any select/deselect buttons) yourself:

```tsx
<DagBrowser
  nodes={nodes}
  selected={selected}
  renderRow={({ node, isSelected }) => (
    <span style={{ background: isSelected ? '#fef3c7' : undefined }}>
      {node.name}
      <button onClick={() => toggleSelected(node.id)}>
        {isSelected ? 'unselect' : 'select'}
      </button>
    </span>
  )}
/>
```

This keeps the widget ignorant of badges, dialogs, routing, and selection
semantics — all of which differ per app.

## `<DagBrowser>` props

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `nodes` | `Node[]` | — | The DAG. Changing the array identity restarts the widget (see below). |
| `selected` | `string[]` | `[]` | Node ids your app cares about (see above). |
| `renderRow` | `(ctx: RenderRowContext) => ReactNode` | name only | Renders each row's body. |
| `levelsExpanded` | `number` | `1` | How many levels to open on mount. `1` shows the roots' children; `0` = all collapsed. Initial-state only. |
| `animationMs` | `number` | `220` | Collapse/expand duration; `0` disables. |
| `className` | `string` | — | Added to the root element. |

`RenderRowContext` = `{ node, isSelected, toggleState, depth }`.

### `nodes` changes restart the widget

A new `nodes` array means "different data — start over": the widget remounts and
re-seeds from scratch, discarding the current expand/collapse state. So pass a
**stable / memoized `nodes`** and only build a new array when the data actually
changes (rebuilding it every render would reset the widget every render). You do
*not* need a React `key` for this — the widget keys itself internally.

Changing `selected` or `levelsExpanded`, by contrast, never resets anything the
user has opened.

## Using the core without React

The core is published separately so you can drive your own renderer (a
different framework, a canvas, tests, server-side analysis):

```ts
import {
  buildGraph,
  fullUnfolding,
  computeVisible,
  decorateRows,
  seedFromSelected,
} from 'dag-browser-widget/core'

const graph = buildGraph(nodes)
const unfolding = fullUnfolding(graph)               // DAG -> rows (one per path)
const { forceVisible, expanded } = seedFromSelected(unfolding, ['fusion'])
const visible = computeVisible(unfolding, forceVisible, expanded)
const rows = decorateRows(unfolding, visible, graph, new Set(['fusion']))
// `rows` carries rails, toggle state, alsoUnderPaths, revealAt — ready to draw.
```

See `src/core/*.ts` for the full API and `src/core/*.test.ts` for worked
examples of every function.

## Demos

```bash
npm install
npm run dev      # opens the demo app
```

Two demos: a **music-genre DAG** (multi-parent genres show the "★ also under"
de-duplication) and a plain **file tree** (shows the widget degrades to an
ordinary collapsible tree when the data has no multi-parent nodes).

The genre demo's data is derived from [MusicBrainz](https://musicbrainz.org/genres),
whose core data is public domain ([CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)).

## Develop

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest (core unit tests)
npm run build       # builds dist/ (ESM + .d.ts + css)
npm run build:demo  # builds the demo app to dist-demo/
```

## Performance note

Unfolding is **eager**: every path to every node becomes a row. For the small
class/containment/taxonomy graphs this is built for, that's fine. A DAG with
very high fan-in could blow up the path count — the visibility layer is
decoupled from *how* rows are produced (`decorateRows` only needs rows with a
`parentIdx`), so a lazy/bounded unfolder can be dropped in later without
touching the visibility logic.

## License

GPL-3.0-or-later (see [LICENSE](./LICENSE)).

If the copyleft terms don't fit your use, I'm happy to discuss alternatives — I
can grant an individual/commercial license, or relicense the whole project under
a permissive license (Apache-2.0 / MIT) on request. Open an issue or reach out.

> The MusicBrainz-derived genre data used in the demo is public domain (CC0) and
> is not affected by this license.
