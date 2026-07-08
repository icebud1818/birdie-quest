import { useMemo, useState } from 'react'
import { COURSES, getCourse } from '../data/courses.js'
import { tracksStats } from '../utils/rounds.js'

const CUSTOM = '__custom__'

const SORTED_COURSES = [...COURSES].sort((a, b) => a.name.localeCompare(b.name))

function todayIso() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Shared add/edit form. Pass `initialRound` to prefill it (edit mode); omit for
// a blank new round. `onSubmit(round)` should persist the round and may throw
// to surface an error; it may also navigate away on success.
export default function RoundForm({
  initialRound = null,
  onSubmit,
  submitLabel = 'Save round',
  busyLabel = 'Saving…',
  heading = 'Log a round',
}) {
  const initialCourseId = resolveInitialCourseId(initialRound)

  const [date, setDate] = useState(initialRound?.date || todayIso())
  const [courseId, setCourseId] = useState(initialCourseId)
  const [customName, setCustomName] = useState(
    initialCourseId === CUSTOM ? initialRound?.courseName || '' : ''
  )
  const [customHoleCount, setCustomHoleCount] = useState(
    initialRound?.holes?.length === 9 ? 9 : 18
  )
  const [holes, setHoles] = useState(() => {
    if (initialRound?.holes) return initialRound.holes.map(toFormHole)
    return makeHolesFor(initialCourseId, 18)
  })
  const [notes, setNotes] = useState(initialRound?.notes || '')
  const [incomplete, setIncomplete] = useState(initialRound?.incomplete === true)
  const [trackStats, setTrackStats] = useState(() =>
    initialRound ? tracksStats(initialRound) : false
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const preset = courseId !== CUSTOM ? getCourse(courseId) : null

  const onCourseChange = (nextId) => {
    setCourseId(nextId)
    if (nextId === CUSTOM) {
      setHoles(blankHoles(customHoleCount, /*editablePar*/ true))
    } else {
      setHoles(makeHolesFor(nextId, 18))
    }
  }

  const onCustomHoleCountChange = (n) => {
    setCustomHoleCount(n)
    if (courseId === CUSTOM) setHoles(blankHoles(n, true))
  }

  const updateHole = (idx, field, value) => {
    setHoles((prev) => prev.map((h, i) => (i === idx ? { ...h, [field]: value } : h)))
  }

  // Totals cover only the holes actually played, so an incomplete round's
  // score is measured against the par of the holes it includes.
  const { totalScore, totalPar, filledScoreCount } = useMemo(() => {
    let s = 0, p = 0, filled = 0
    for (const h of holes) {
      if (typeof h.score === 'number') {
        s += h.score
        filled++
        if (typeof h.par === 'number') p += h.par
      }
    }
    return { totalScore: s, totalPar: p, filledScoreCount: filled }
  }, [holes])

  const submit = async (e) => {
    e.preventDefault()
    setError('')

    const courseName = courseId === CUSTOM ? customName.trim() : preset?.name
    if (!courseName) {
      setError('Enter a course name.')
      return
    }
    if (!date) {
      setError('Pick a date.')
      return
    }
    if (incomplete) {
      if (filledScoreCount === 0) {
        setError('Enter a score for at least one hole you played.')
        return
      }
    } else if (filledScoreCount !== holes.length) {
      setError('Enter a score for every hole, or mark the round incomplete.')
      return
    }
    // Custom courses need a par for every hole that was actually played.
    if (
      courseId === CUSTOM &&
      holes.some((h) => typeof h.score === 'number' && typeof h.par !== 'number')
    ) {
      setError('Enter a par for every hole you played.')
      return
    }

    // Keep every hole slot (so hole positions line up across rounds), but leave
    // unplayed holes with a null score.
    const cleanedHoles = holes.map((h) => {
      const out = {
        par: typeof h.par === 'number' ? h.par : null,
        score: typeof h.score === 'number' ? h.score : null,
      }
      if (typeof h.putts === 'number') out.putts = h.putts
      if (typeof h.ob === 'number' && h.ob > 0) out.ob = h.ob
      if (h.gir === true) out.gir = true
      return out
    })

    const round = {
      date,
      courseId: courseId === CUSTOM ? null : courseId,
      courseName,
      holes: cleanedHoles,
      totalScore,
      totalPar,
      incomplete,
      trackStats,
    }
    const trimmedNotes = notes.trim()
    if (trimmedNotes) round.notes = trimmedNotes

    setBusy(true)
    try {
      await onSubmit(round)
    } catch (err) {
      setError(err.message || 'Failed to save round.')
      setBusy(false)
    }
  }

  return (
    <div className="container">
      <h1>{heading}</h1>
      <form onSubmit={submit}>
        <div className="card">
          <div className="grid cols-3">
            <div>
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div>
              <label>Course</label>
              <select value={courseId} onChange={(e) => onCourseChange(e.target.value)}>
                <option value={CUSTOM}>+ Custom course…</option>
                {SORTED_COURSES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.par3 ? ' (par 3 — doesn’t count)' : ''}
                  </option>
                ))}
              </select>
            </div>
            {courseId === CUSTOM && (
              <>
                <div>
                  <label>Custom course name</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Pebble Beach"
                    required
                  />
                </div>
                <div>
                  <label>Number of holes</label>
                  <select
                    value={customHoleCount}
                    onChange={(e) => onCustomHoleCountChange(Number(e.target.value))}
                  >
                    <option value={9}>9</option>
                    <option value={18}>18</option>
                  </select>
                </div>
              </>
            )}
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 16,
              marginBottom: 0,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={incomplete}
              onChange={(e) => setIncomplete(e.target.checked)}
              style={{ width: 'auto' }}
            />
            <span>
              Incomplete round — only played some holes / didn't finish
            </span>
          </label>
          {incomplete && (
            <div className="muted" style={{ fontSize: '0.85rem', marginTop: 6 }}>
              Enter scores only for the holes you played. This round won't count
              toward your handicap or achievements.
            </div>
          )}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 12,
              marginBottom: 0,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={trackStats}
              onChange={(e) => setTrackStats(e.target.checked)}
              style={{ width: 'auto' }}
            />
            <span>Include this round's putts, GIR &amp; OOB in my overall stats</span>
          </label>
          {!trackStats && (
            <div className="muted" style={{ fontSize: '0.85rem', marginTop: 6 }}>
              Leave unchecked if you didn't track these — the round is still saved,
              it just won't affect your putting / GIR / OOB averages.
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <label>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How'd it go? Conditions, highlights, things to work on…"
              rows={4}
            />
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Holes</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="holes-table">
              <thead>
                <tr>
                  <th>Hole</th>
                  <th>Par</th>
                  <th>Score</th>
                  <th>Putts</th>
                  <th>OB</th>
                  <th>GIR</th>
                </tr>
              </thead>
              <tbody>
                {holes.map((h, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>
                      {courseId === CUSTOM ? (
                        <input
                          type="number"
                          min="3" max="6"
                          value={h.par ?? ''}
                          onChange={(e) => updateHole(i, 'par', numOrNull(e.target.value))}
                          required={!incomplete}
                        />
                      ) : (
                        h.par
                      )}
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={h.score ?? ''}
                        onChange={(e) => updateHole(i, 'score', numOrNull(e.target.value))}
                        required={!incomplete}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={h.putts ?? ''}
                        onChange={(e) => updateHole(i, 'putts', numOrNull(e.target.value))}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={h.ob ?? ''}
                        onChange={(e) => updateHole(i, 'ob', numOrNull(e.target.value))}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={h.gir === true}
                        onChange={(e) => updateHole(i, 'gir', e.target.checked)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Total</th>
                  <th>{totalPar || '—'}</th>
                  <th>{totalScore || '—'}</th>
                  <th colSpan="3" className="muted" style={{ textAlign: 'left', paddingLeft: 16 }}>
                    {filledScoreCount}/{holes.length} holes filled
                  </th>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="row">
          <button className="primary" type="submit" disabled={busy}>
            {busy ? busyLabel : submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}

function resolveInitialCourseId(initialRound) {
  if (!initialRound) return COURSES[0]?.id || CUSTOM
  if (initialRound.courseId && getCourse(initialRound.courseId)) return initialRound.courseId
  return CUSTOM
}

function toFormHole(h) {
  return {
    par: typeof h.par === 'number' ? h.par : null,
    score: typeof h.score === 'number' ? h.score : null,
    putts: typeof h.putts === 'number' ? h.putts : null,
    ob: typeof h.ob === 'number' ? h.ob : null,
    gir: h.gir === true,
  }
}

function makeHolesFor(courseId, defaultCount) {
  const c = getCourse(courseId)
  if (c) return c.pars.map((par) => ({ par, score: null, putts: null, ob: null, gir: false }))
  return blankHoles(defaultCount, true)
}

function blankHoles(count, editablePar) {
  return Array.from({ length: count }, () => ({
    par: editablePar ? null : 4,
    score: null,
    putts: null,
    ob: null,
    gir: false,
  }))
}

function numOrNull(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
