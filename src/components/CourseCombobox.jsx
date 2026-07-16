import { useEffect, useMemo, useRef, useState } from 'react'

// A searchable picker. Behaves like a dropdown until you type, then filters the
// list by substring. Generic over its data:
//
//   items    — [{ id, label, note? }]  the selectable rows (note is a small
//              right-aligned tag, e.g. "par 3" or "✓")
//   value    — selected id
//   onChange(id)
//   actions  — optional [{ id, label }] pinned below the items (e.g.
//              "+ Find a course…"); selecting one just calls onChange(id)
//   placeholder
export default function CourseCombobox({ items, value, onChange, actions = [], placeholder = 'Search…' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const boxRef = useRef(null)

  const selectedLabel = useMemo(() => {
    const a = actions.find((x) => x.id === value)
    if (a) return a.label
    const it = items.find((x) => x.id === value)
    return it ? it.label : ''
  }, [value, items, actions])

  // Show nothing until the user types — the played-courses list can grow large,
  // so an empty query yields no course rows (pinned actions still show).
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? items.filter((it) => it.label.toLowerCase().includes(q)) : []
  }, [items, query])

  const options = useMemo(() => {
    const opts = matches.map((it) => ({ ...it, kind: 'item' }))
    for (const a of actions) opts.push({ ...a, kind: 'action' })
    return opts
  }, [matches, actions])

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return
    const onDocDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) close()
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const openMenu = () => {
    if (open) return
    setOpen(true)
    setQuery('')
    setActive(0)
  }

  const choose = (opt) => {
    onChange(opt.id)
    close()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) return openMenu()
      setActive((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && options[active]) {
        e.preventDefault()
        choose(options[active])
      }
    } else if (e.key === 'Escape') {
      close()
    }
  }

  return (
    <div className="combobox" ref={boxRef}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        placeholder={placeholder}
        value={open ? query : selectedLabel}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          if (!open) setOpen(true)
        }}
        onFocus={openMenu}
        onClick={openMenu}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div className="combobox-menu" role="listbox">
          {query.trim() === '' && (
            <div className="combobox-empty">Type to search your courses…</div>
          )}
          {options.map((opt, i) => {
            const isAction = opt.kind === 'action'
            const firstAction = isAction && (i === 0 || options[i - 1].kind !== 'action')
            return (
              <div key={opt.id}>
                {firstAction && matches.length > 0 && <div className="combobox-sep" />}
                <div
                  role="option"
                  aria-selected={i === active}
                  className={`combobox-option ${i === active ? 'active' : ''} ${isAction ? 'combobox-pinned' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault() // keep focus; select before blur
                    choose(opt)
                  }}
                >
                  <span>{opt.label}</span>
                  {opt.note && <span className="muted">{opt.note}</span>}
                </div>
              </div>
            )
          })}
          {query.trim() !== '' && matches.length === 0 && actions.length === 0 && (
            <div className="combobox-empty">No matches.</div>
          )}
          {query.trim() !== '' && matches.length === 0 && actions.length > 0 && (
            <div className="combobox-empty">No matches in your courses — try “Find a course”.</div>
          )}
        </div>
      )}
    </div>
  )
}
