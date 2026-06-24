import { useState } from 'react'
import { DagBrowser, type RenderRowContext } from '../src'
import { DEMOS, type DemoKey } from './data'

export function App() {
  const [demoKey, setDemoKey] = useState<DemoKey>('genres')
  const demo = DEMOS[demoKey]

  // `selected` is owned by the consumer (this app), not the widget. The widget
  // opens the path to each selected node and shows reveal-at breadcrumbs for
  // any selected node the user later collapses away. Highlighting + the
  // add/remove buttons live entirely in our renderRow below.
  const [selected, setSelected] = useState<string[]>(demo.selected)

  function pickDemo(key: DemoKey) {
    setDemoKey(key)
    setSelected(DEMOS[key].selected)
  }

  function toggleSelected(id: string) {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    )
  }

  const renderRow = ({ node, isSelected }: RenderRowContext) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          padding: '1px 6px',
          borderRadius: 3,
          fontWeight: isSelected ? 600 : 400,
          background: isSelected ? '#fef3c7' : 'transparent',
        }}
      >
        {node.name}
      </span>
      <button
        onClick={() => toggleSelected(node.id)}
        title={isSelected ? 'Remove from selection' : 'Add to selection'}
        style={{
          fontSize: 10,
          lineHeight: 1,
          padding: '2px 5px',
          cursor: 'pointer',
          border: '1px solid #d1d5db',
          borderRadius: 3,
          background: isSelected ? '#fde68a' : '#fff',
        }}
      >
        {isSelected ? '− selected' : '+ select'}
      </button>
    </span>
  )

  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 760,
        margin: '32px auto',
        padding: '0 16px',
        color: '#111827',
      }}
    >
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>dag-browser-widget</h1>
      <p style={{ color: '#6b7280', marginTop: 0 }}>
        Browse a DAG (polyhierarchy) as a collapsible tree.
      </p>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        {(Object.keys(DEMOS) as DemoKey[]).map(key => (
          <button
            key={key}
            onClick={() => pickDemo(key)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #d1d5db',
              background: key === demoKey ? '#1d4ed8' : '#fff',
              color: key === demoKey ? '#fff' : '#111827',
              cursor: 'pointer',
            }}
          >
            {DEMOS[key].label}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6 }}>
        {demo.blurb}
      </p>

      {/* No key needed: the widget restarts itself when `nodes` changes. */}
      <DagBrowser
        nodes={demo.nodes}
        selected={selected}
        renderRow={renderRow}
      />

      <p style={{ fontSize: 12, color: '#6b7280', marginTop: 16 }}>
        Selected: {selected.length ? selected.join(', ') : '(none)'}
      </p>

      {demo.credit && (
        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
          <a
            href={demo.credit.href}
            target="_blank"
            rel="noreferrer"
            style={{ color: '#9ca3af' }}
          >
            {demo.credit.text}
          </a>
        </p>
      )}
    </div>
  )
}
