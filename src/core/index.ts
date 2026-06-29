// Dependency-free DAG-browser core. No React, no view dependencies.
export {
  buildGraph,
  fullUnfolding,
  type Node,
  type Graph,
  type UnfoldingRow,
} from './graph'
export {
  ancestorPath,
  computeVisible,
  computeToggleState,
  decorateRows,
  descendantPosIdxs,
  type RailKind,
  type ToggleState,
  type ForceVisibleSet,
  type ExpandedSet,
  type AlsoUnderLink,
  type RevealAtLink,
  type BackedgeLink,
  type DecoratedRow,
} from './visibility'
export { seedFromSelected } from './seed'
