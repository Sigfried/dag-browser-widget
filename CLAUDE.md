# CLAUDE.md

Guidance for working in this repo. Standalone — it depends on nothing outside
itself.

## What this is

A reusable widget for browsing a **DAG (polyhierarchy)** as a collapsible tree.
A node may have many parents; it's unfolded once in full, and its other parents
become "★ also under …" links rather than duplicated subtrees. Two layers:

- `src/core/` — dependency-free TS logic. No React, no DOM imports. This is the
  valuable part; it does the hard graph work and is fully unit-tested.
- `src/react/` — a thin React view over the core. Plain React + inline styles +
  one CSS file. **No MUI, no router, no other UI libraries** — keep it that way.

`src/index.ts` re-exports both; `src/core/index.ts` is the core-only entry
(published as `dag-browser-widget/core`).

## Architecture / data flow

1. `buildGraph(nodes)` → adjacency + depth. Roots = nodes with no (present)
   parent. Children/roots sorted by trailing-number-then-name.
2. `fullUnfolding(graph)` → `UnfoldingRow[]`, a DFS pre-order list with **one
   row per path** to each node. A multi-parent node appears multiple times.
   Each row knows its `parentIdx` (always a lower index — relied on everywhere)
   and a `kind`: `'node'` for an ordinary unfolded row, or `'backedge'` for a
   cycle marker (a node that loops back to an ancestor on its own path). A
   back-edge row carries `backedgeTo` (the ancestor row's posIdx) and is never
   descended into — that's the cycle guard.
3. `computeVisible(unfolding, forceVisible, expanded)` → set of visible posIdxs.
   A position is visible iff it's in `forceVisible`, or it's a path-protection
   bridge between two forceVisibles, or its parent is visible and expanded.
4. `decorateRows(unfolding, visible, graph, selectedIds)` → per-visible-row
   render data: rails (`├ │ └`), toggle state, child count, `alsoUnderPaths`
   (other copies of this node), `revealAt` (links to hidden selected copies).
5. The React view (`DagBrowser.tsx`) holds `forceVisible`/`expanded` state, ports
   the toggle machine, runs the exit animation, and renders rows.

## Locked design decisions — do not re-litigate

These were settled deliberately (see git history / the original handoff):

- **Interface B.** The consumer passes `selected: string[]` and a `renderRow`.
  The widget owns `forceVisible`/`expanded` entirely; the consumer never touches
  them. Rationale: collapsing a parent mutates `forceVisible` (drops its fv
  descendants), so the consumer can't own that set without the widget editing
  its state. The consumer owns the *semantic* selection; the widget owns the
  *mechanical* visibility.
- **Highlighting is the consumer's job**, done in `renderRow` via the
  `isSelected` flag. Core/view never style a "selected"/"chosen" row. There is
  no `chosen`/`isChosen` concept in this codebase (it existed in the synapse
  original; it was removed on purpose).
- **`selected` is a set, generalized from the original single `chosenNodeId`.**
  The seeding and reveal-at logic loop over the set.
- **Keep `forceVisible` + path-protection.** It's the mechanism behind "keep
  this node and its path to root open while everything else collapses."
- **Seeding always shows all roots; runs once at mount.** `seedFromSelected`
  force-visibles every root, expands the top `levelsExpanded` levels (default 1
  at the view), and opens the path to each selected node. It is INITIAL-only:
  `DagBrowserImpl` seeds via a `useState` initializer with no re-seed effect.
- **`nodes` change = remount, not an effect.** The exported `DagBrowser` is a
  thin shell that keys `DagBrowserImpl` on the `nodes` array identity; a new
  array throws the instance away and remounts fresh. So nothing inside ever
  detects "nodes changed" — and under a future lazy unfolder, an unfolding that
  grows on expand will NOT trigger a reset (the trigger is the `nodes` ref, not
  the unfolding). Consumers pass a stable/memoized `nodes`; no React `key`
  needed on their side.
- **Changing `selected` never resets expand/collapse.** Selection flows to
  `renderRow` (highlight) and `decorateRows` (reveal-at links) only. It does not
  re-seed. Selecting happens by clicking a visible row, so there's nothing to
  reveal; reveal-at exists for selections set from OUTSIDE the widget.
- **`levelsExpanded` (default 1)** opens the top N levels at mount; initial-only.
- **Expand-all via double-click.** Single click on a toggle = expand one level
  / collapse. Double-click = expand the whole subtree (`handleExpandAll` adds
  the row + `descendantPosIdxs(...)` to `expanded`). `TogglePill` debounces the
  single click (`DBLCLICK_MS`) so a pending double-click cancels it. The
  double-click affordance only appears when `descendantCount > childCount`.
- **Keep reveal-at.** When a selected node is collapsed off-screen, its closest
  visible ancestor gets a "↳ reveal at …" link (clicking pins the hidden copy).
  This already existed in core; it is the breadcrumb back. Don't drop it.
- **Keep the exit animation, MUI-free.** Rows leaving the visible set are parked
  in `exitingRef` until their collapse transition ends, then unmounted. The
  collapse is a CSS `grid-template-rows: 0fr/1fr` transition (no JS height
  measurement, no MUI `Collapse`). The exiting-row bookkeeping is ported
  verbatim from the original and is view logic, not MUI-specific.
- **Unfolding is eager now; the seam for lazy is preserved.** `decorateRows`
  /visibility only need rows with a `parentIdx`, so a lazy/bounded unfolder can
  drop in later. Don't build it now; don't wall it out.
- **Cycles render as back-edge marker rows; don't drop the back-edge.** When a
  child loops back to an ancestor on its own path, `fullUnfolding` emits a leaf
  row with `kind: 'backedge'` + `backedgeTo` instead of recursing (the old code
  silently dropped it). `decorateRows` makes it a forced leaf with a
  `backedge: BackedgeLink` (`{ path, targetPosIdx, selfLoop }`); the view shows
  a "⟲ loops back to …" link (or "self-loop" for A→A, where the target is the
  immediate parent so there's no separate link). Back-edge rows are **not**
  counted as node "copies" (no spurious "★ also under") and **not** counted in
  `descendantCount`; `seedFromSelected`'s first-copy map skips them too. Keep all
  of that — a back-edge is a reference, not a real second placement.
- **Rootless cycles get a synthetic root.** A strongly-connected component with
  no parentless entry is unreachable from any natural root, so `buildGraph`
  promotes one node per orphaned component to a root (BFS reachability check
  after the natural roots). Without this, such a component vanishes entirely.
  With a single overall root (as the demos and most consumers use) this never
  fires, but it's the safety net for arbitrary digraphs.

## Origin

Lifted and de-coupled from synapse's `HierarchyWidget`
(`apps/portals/b2ai.standards/src/components/HierarchyWidget` in
synapse-web-monorepo). `graph.ts` is essentially verbatim. `visibility.ts` had
two view-type imports inlined (`RailKind`, `ToggleState` now live in
`visibility.ts`) and was generalized off the single `chosenNodeId`. The MUI/
react-router/toast view was rewritten as `src/react/`. This repo must not
reference synapse or any consuming app.

## Conventions

- ES modules; destructured imports; lean DRY.
- `npm run typecheck` after changes (`tsc --noEmit`). Run single vitest files
  while iterating, e.g. `npx vitest run src/core/visibility.test.ts`.
- The core has zero view/DOM imports — keep it that way. If you need a view
  type in core, define it in core (don't import from `src/react/`).
- Demos (`demos/`) use **public, non-informatics data** only. At least one demo
  must be a true DAG so the "★ also under" de-duplication is visible. The genre
  demo's relationships come from MusicBrainz genre data (CC0); `parentIds`
  combines its "subgenre of" + "fusion of" edges (fusion = multi-parent). The
  `deps` demo is a synthetic cyclic dependency graph (2-cycle, 3-hop cycle,
  self-loop) so the "⟲ loops back to …" back-edge markers are visible.

## Commands

| | |
| --- | --- |
| `npm run dev` | serve the demo app |
| `npm test` | core unit tests (vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | build `dist/` (ESM + `.d.ts` + css) via vite-plugin-dts |
| `npm run build:demo` | build the demo app to `dist-demo/` |

The published CSS is a separate file (`dist/dag-browser-widget.css`, exported as
`dag-browser-widget/styles.css`) — vite extracts it, so the JS bundle does not
import it and consumers must import it explicitly.
