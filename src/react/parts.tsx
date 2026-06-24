import { useEffect, useRef, type CSSProperties } from 'react'
import type { RailKind, ToggleState } from '../core'

export const RAIL_CELL_WIDTH = 18

export const COLORS = {
  rail: '#9ca3af',
  partial: 'rgba(217, 119, 6, 0.18)',
  partialBorder: 'rgba(217, 119, 6, 0.5)',
  partialText: '#92400e',
  toggleBg: 'rgba(255, 255, 255, 0.65)',
  toggleText: '#1f2937',
  toggleBorder: 'rgba(0,0,0,0.15)',
  link: '#1d4ed8',
  reveal: '#92400e',
  revealHover: '#7c2d12',
}

// Subtle depth shading so nesting reads at a glance.
export function depthTint(depth: number): string {
  const alpha = Math.min(0.08 + depth * 0.05, 0.33)
  return `rgba(59, 130, 246, ${alpha})`
}

// ----------------------------------------------------------------------------
// Rails (the ├ │ └ gutter), drawn with absolutely-positioned 1px lines.
// ----------------------------------------------------------------------------

export function RailCell({ kind }: { kind: RailKind }) {
  if (kind === 'empty') {
    return <span style={{ width: RAIL_CELL_WIDTH, flexShrink: 0 }} />
  }
  const vertStyle: CSSProperties =
    kind === 'corner'
      ? { top: -2, height: 'calc(50% + 2px)' }
      : { top: -2, bottom: -2 }
  const showHoriz = kind === 'tee' || kind === 'corner'
  return (
    <span
      style={{
        width: RAIL_CELL_WIDTH,
        flexShrink: 0,
        position: 'relative',
        alignSelf: 'stretch',
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-0.5px)',
          width: 1,
          background: COLORS.rail,
          ...vertStyle,
        }}
      />
      {showHoriz && (
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            right: 0,
            height: 1,
            background: COLORS.rail,
          }}
        />
      )}
    </span>
  )
}

// ----------------------------------------------------------------------------
// Toggle pill (▼/▷/▶ + child count).
// ----------------------------------------------------------------------------

type TogglePillProps = {
  state: ToggleState
  count: number
  title?: string
  onClick?: () => void
  // When provided, a double-click fires this instead of onClick. The single
  // click is delayed briefly so a pending double-click can cancel it.
  onDoubleClick?: () => void
}

const DBLCLICK_MS = 220

export function TogglePill({
  state,
  count,
  title,
  onClick,
  onDoubleClick,
}: TogglePillProps) {
  // Pending single-click timer, so a double-click can cancel it.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (clickTimer.current) clearTimeout(clickTimer.current)
    },
    [],
  )

  if (state === 'leaf') return null
  const arrow = state === 'expanded' ? '▼' : state === 'partial' ? '▷' : '▶'
  const isPartial = state === 'partial'
  const isExpanded = state === 'expanded'
  const isDisabled = state === 'disabled'

  const handleClick = () => {
    if (isDisabled || !onClick) return
    if (!onDoubleClick) {
      onClick() // no double-click handler -> act immediately
      return
    }
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
      onClick()
    }, DBLCLICK_MS)
  }

  const handleDoubleClick = () => {
    if (isDisabled || !onDoubleClick) return
    if (clickTimer.current) {
      clearTimeout(clickTimer.current) // cancel the pending single click
      clickTimer.current = null
    }
    onDoubleClick()
  }

  return (
    <span
      title={title}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        minWidth: 28,
        height: 18,
        padding: '0 5px',
        border: '1px solid',
        borderColor: isPartial
          ? COLORS.partialBorder
          : isExpanded
            ? 'rgba(0,0,0,0.25)'
            : COLORS.toggleBorder,
        borderRadius: 3,
        background: isPartial
          ? COLORS.partial
          : isExpanded
            ? 'rgba(255,255,255,0.9)'
            : COLORS.toggleBg,
        color: isPartial ? COLORS.partialText : COLORS.toggleText,
        fontSize: 10,
        lineHeight: 1,
        fontFamily: 'ui-monospace, monospace',
        userSelect: 'none',
        opacity: isDisabled ? 0.35 : 1,
        cursor: isDisabled ? 'default' : onClick ? 'pointer' : 'default',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 9 }}>{arrow}</span>
      <span>{count}</span>
    </span>
  )
}

// ----------------------------------------------------------------------------
// Cross-reference link lists ("★ also under …", "↳ reveal at …").
// ----------------------------------------------------------------------------

type LinkListProps = {
  prefix: string
  links: { path: string; targetPosIdx: number }[]
  title: string
  onClick: (targetPosIdx: number) => void
}

export function LinkList({ prefix, links, title, onClick }: LinkListProps) {
  if (links.length === 0) return null
  return (
    <span
      style={{
        fontSize: 11,
        color: COLORS.reveal,
        fontStyle: 'italic',
        marginLeft: 6,
      }}
    >
      {prefix}{' '}
      {links.map((link, idx) => (
        <span key={link.targetPosIdx}>
          {idx > 0 && ', '}
          <span
            className="dbw-xref"
            onClick={() => onClick(link.targetPosIdx)}
            title={title}
          >
            {link.path}
          </span>
        </span>
      ))}
    </span>
  )
}
