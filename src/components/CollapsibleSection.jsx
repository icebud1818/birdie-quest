import { useState } from 'react'

// A section whose heading toggles its body. The achievements page stacks a lot of
// these, so folding one away makes the rest scannable.
//
//   title       heading text
//   count       optional "3/6" tag rendered beside the title
//   defaultOpen start expanded (the default) or collapsed
export default function CollapsibleSection({ title, count, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="collapsible">
      {/* Button nested inside the heading, not the other way round: a <button>
          takes phrasing content only, and this keeps the heading itself in the
          document outline for screen-reader heading navigation. */}
      <h2 className="collapsible-title">
        <button
          type="button"
          className="collapsible-head"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`collapsible-chevron ${open ? 'open' : ''}`} aria-hidden="true">
            ▶
          </span>
          {title}
          {count && <span className="count-tag muted"> {count}</span>}
        </button>
      </h2>
      {open && <div className="collapsible-body">{children}</div>}
    </section>
  )
}
