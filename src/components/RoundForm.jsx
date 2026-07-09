import { useMemo, useRef, useState } from 'react'
import { useData } from '../data/DataContext.jsx'
import CourseCombobox from './CourseCombobox.jsx'
import { fetchCourse } from '../utils/firestore.js'
import { courseLookupEnabled, importCourse, searchCourses } from '../utils/courseApi.js'
import { tracksStats } from '../utils/rounds.js'

const CUSTOM = '__custom__'
const SEARCH = '__search__'

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
  const { courses, getCourse, addCourse, rounds } = useData()
  const initialCourseId = resolveInitialCourseId(initialRound, courses, getCourse)

  const [date, setDate] = useState(initialRound?.date || todayIso())
  const [courseId, setCourseId] = useState(initialCourseId)
  const [customName, setCustomName] = useState(
    initialCourseId === CUSTOM ? initialRound?.courseName || '' : ''
  )
  const [customHoleCount, setCustomHoleCount] = useState(
    initialRound?.holes?.length === 9 ? 9 : 18
  )
  const initialTee = initialRound?.tee || null
  const [teeId, setTeeId] = useState(
    () => initialTee?.id || getCourse(initialCourseId)?.tees?.[0]?.id || ''
  )
  const [customTeeName, setCustomTeeName] = useState(
    initialCourseId === CUSTOM ? initialTee?.name || '' : ''
  )
  const [customRating, setCustomRating] = useState(
    initialCourseId === CUSTOM && initialTee?.rating != null ? String(initialTee.rating) : ''
  )
  const [customSlope, setCustomSlope] = useState(
    initialCourseId === CUSTOM && initialTee?.slope != null ? String(initialTee.slope) : ''
  )
  const [holes, setHoles] = useState(() => {
    if (initialRound?.holes) return initialRound.holes.map(toFormHole)
    return makeHolesFor(initialCourseId, 18, getCourse)
  })
  const [notes, setNotes] = useState(initialRound?.notes || '')
  const [incomplete, setIncomplete] = useState(initialRound?.incomplete === true)
  const [scramble, setScramble] = useState(initialRound?.scramble === true)
  const [trackStats, setTrackStats] = useState(() =>
    initialRound ? tracksStats(initialRound) : false
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const preset = courseId !== CUSTOM ? getCourse(courseId) : null

  // The dropdown lists only *your* courses — ones you've played plus your seeded
  // presets — so the shared catalog (potentially thousands of courses) doesn't
  // bloat it. Everything else is reachable via "Find a course". The currently
  // selected course is always included (e.g. one just imported this session).
  const SORTED_COURSES = useMemo(() => {
    const played = new Set(rounds.map((r) => r.courseId).filter(Boolean))
    return courses
      .filter((c) => played.has(c.id) || c.source === 'preset' || c.id === courseId)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [courses, rounds, courseId])

  // Course-search / import state (only used when the lookup Worker is configured).
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [importing, setImporting] = useState(null) // externalId currently importing
  const [lookupError, setLookupError] = useState('')

  const onCourseChange = (nextId) => {
    setCourseId(nextId)
    if (nextId === CUSTOM) {
      setHoles(blankHoles(customHoleCount, /*editablePar*/ true))
    } else if (nextId === SEARCH) {
      // Show the search panel; leave the current holes until a course is picked.
    } else {
      setHoles(makeHolesFor(nextId, 18, getCourse))
      setTeeId(getCourse(nextId)?.tees?.[0]?.id || '')
    }
  }

  const onCustomHoleCountChange = (n) => {
    setCustomHoleCount(n)
    if (courseId === CUSTOM) setHoles(blankHoles(n, true))
  }

  // Once a course is chosen from search, switch the form onto it (build holes
  // and default the tee straight from the course object to avoid a state race).
  const selectCourse = (course) => {
    setCourseId(course.id)
    setHoles(course.pars.map((par) => ({ par, score: null, putts: null, ob: null, gir: false })))
    setTeeId(course.tees?.[0]?.id || '')
    setResults([])
    setQuery('')
    setLookupError('')
  }

  const runSearch = async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setLookupError('')
    try {
      setResults(await searchCourses(q))
    } catch (err) {
      setLookupError(err.message || 'Search failed.')
    } finally {
      setSearching(false)
    }
  }

  // Reuse a course we already have (0 API calls); otherwise import it from the
  // API once and persist to the shared catalog so nobody fetches it again.
  const pickResult = async (r) => {
    setImporting(r.externalId)
    setLookupError('')
    try {
      const id = `gca-${r.externalId}`
      const local = getCourse(id)
      if (local) {
        selectCourse(local)
        return
      }
      const remote = await fetchCourse(id)
      const course = remote || (await importCourse(r.externalId))
      await addCourse(course)
      selectCourse(course)
    } catch (err) {
      setLookupError(err.message || 'Could not add that course.')
    } finally {
      setImporting(null)
    }
  }

  const updateHole = (idx, field, value) => {
    setHoles((prev) => prev.map((h, i) => (i === idx ? { ...h, [field]: value } : h)))
  }

  // Enter in a hole input jumps to the same column on the next hole, instead of
  // submitting the round. Refs are keyed `${field}-${holeIndex}`.
  const cellRefs = useRef({})
  const onCellEnter = (e, field, i) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const next = cellRefs.current[`${field}-${i + 1}`]
    if (next) {
      next.focus()
      next.select?.()
    }
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

  const scoreChip = diffChip(totalScore - totalPar)

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

    // Resolve the tee played. Preset courses snapshot the selected tee's
    // ratings; custom courses take them from the form so the handicap can use
    // them. Ratings are only required when the round would actually count
    // toward the handicap (a complete, non-scramble round).
    const countsForHandicap = !incomplete && !scramble
    let tee = null
    if (courseId === CUSTOM) {
      const teeName = customTeeName.trim()
      const rating = numOrNull(customRating)
      const slope = numOrNull(customSlope)
      if (!teeName) {
        setError('Enter the tee you played from.')
        return
      }
      if (countsForHandicap && (rating == null || slope == null)) {
        setError('Enter the course rating and slope for this tee so the round counts toward your handicap.')
        return
      }
      if (rating != null && (rating < 50 || rating > 90)) {
        setError('Course rating should be a number like 71.2.')
        return
      }
      if (slope != null && (slope < 55 || slope > 155)) {
        setError('Slope rating should be between 55 and 155.')
        return
      }
      tee = { id: null, name: teeName, rating, slope }
    } else {
      const t = (preset?.tees || []).find((x) => x.id === teeId)
      if (t) tee = { id: t.id, name: t.name, rating: t.rating, slope: t.slope }
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
      // Snapshot whether this was a par-3 course so stats/achievements never
      // need the live catalog. Custom courses are never treated as par-3.
      par3: courseId === CUSTOM ? false : preset?.par3 === true,
      holes: cleanedHoles,
      totalScore,
      totalPar,
      incomplete,
      scramble,
      trackStats,
    }
    if (tee) round.tee = tee
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
      <h1 style={{ marginBottom: 8 }}>{heading}</h1>
      <p className="subtitle" style={{ margin: '0 0 20px' }}>
        Fill in your scorecard below — press Enter to jump to the next hole.
      </p>
      <form onSubmit={submit}>
        <div className="card">
          <div className="grid cols-3">
            <div>
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div>
              <label>Course</label>
              <CourseCombobox
                items={SORTED_COURSES.map((c) => ({
                  id: c.id,
                  label: c.name,
                  note: c.par3 ? 'par 3' : undefined,
                }))}
                value={courseId}
                onChange={onCourseChange}
                actions={[
                  ...(courseLookupEnabled ? [{ id: SEARCH, label: '+ Find a course…' }] : []),
                  { id: CUSTOM, label: '+ Custom course…' },
                ]}
                placeholder="Search your courses…"
              />
            </div>
            {courseId !== CUSTOM && preset?.tees?.length > 0 && (
              <div>
                <label>Tee</label>
                <select value={teeId} onChange={(e) => setTeeId(e.target.value)}>
                  {preset.tees.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.rating != null && t.slope != null ? ` — ${t.rating}/${t.slope}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
                <div>
                  <label>Tee played</label>
                  <input
                    type="text"
                    value={customTeeName}
                    onChange={(e) => setCustomTeeName(e.target.value)}
                    placeholder="e.g. White"
                    required
                  />
                </div>
                <div>
                  <label>Course rating</label>
                  <input
                    type="number"
                    step="0.1"
                    min="50"
                    max="90"
                    value={customRating}
                    onChange={(e) => setCustomRating(e.target.value)}
                    placeholder="e.g. 71.2"
                  />
                </div>
                <div>
                  <label>Slope rating</label>
                  <input
                    type="number"
                    min="55"
                    max="155"
                    value={customSlope}
                    onChange={(e) => setCustomSlope(e.target.value)}
                    placeholder="e.g. 128"
                  />
                </div>
              </>
            )}
          </div>
          {courseId === CUSTOM && (
            <div className="muted" style={{ fontSize: '0.85rem', marginTop: 10 }}>
              Course &amp; slope rating come from the scorecard for the tee you
              played. They let this round count toward your handicap — leave them
              blank only for a casual round you don't want scored.
            </div>
          )}
          {courseId === SEARCH && (
            <div style={{ marginTop: 16 }}>
              <label>Search for a course</label>
              <div className="row" style={{ gap: 8 }}>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      runSearch()
                    }
                  }}
                  placeholder="e.g. Pebble Beach"
                />
                <button type="button" onClick={runSearch} disabled={searching || !query.trim()}>
                  {searching ? 'Searching…' : 'Search'}
                </button>
              </div>
              {lookupError && <div className="error">{lookupError}</div>}
              {results.length > 0 && (
                <div className="grid" style={{ marginTop: 12 }}>
                  {results.map((r) => (
                    <button
                      type="button"
                      key={r.externalId}
                      className="achievement"
                      onClick={() => pickResult(r)}
                      disabled={importing != null}
                      style={{ textAlign: 'left', cursor: importing != null ? 'wait' : 'pointer' }}
                    >
                      <div style={{ flex: 1 }}>
                        <div className="title">{r.name}</div>
                        {r.location && <div className="desc">{r.location}</div>}
                      </div>
                      <span className="muted">{importing === r.externalId ? 'Adding…' : 'Add'}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="muted" style={{ fontSize: '0.85rem', marginTop: 10 }}>
                Can't find it? Choose “+ Custom course…” to enter the pars manually.
              </div>
            </div>
          )}
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
              checked={scramble}
              onChange={(e) => setScramble(e.target.checked)}
              style={{ width: 'auto' }}
            />
            <span>
              Scramble — played in a team scramble / best-ball format
            </span>
          </label>
          {scramble && (
            <div className="muted" style={{ fontSize: '0.85rem', marginTop: 6 }}>
              Scramble scores don't reflect solo play, so this round won't count
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
          <div className="row" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Holes</h2>
            <div className="spacer" />
            {filledScoreCount > 0 && (
              <span className="score-pill">
                <span className="score-num">{totalScore}</span>
                <span className={`diff-chip ${scoreChip.cls}`}>{scoreChip.label}</span>
              </span>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="holes-table">
              <thead>
                <tr>
                  <th>Hole</th>
                  <th>Par</th>
                  <th>Strokes</th>
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
                        ref={(el) => { cellRefs.current[`score-${i}`] = el }}
                        onChange={(e) => updateHole(i, 'score', numOrNull(e.target.value))}
                        onKeyDown={(e) => onCellEnter(e, 'score', i)}
                        required={!incomplete}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={h.putts ?? ''}
                        ref={(el) => { cellRefs.current[`putts-${i}`] = el }}
                        onChange={(e) => updateHole(i, 'putts', numOrNull(e.target.value))}
                        onKeyDown={(e) => onCellEnter(e, 'putts', i)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={h.ob ?? ''}
                        ref={(el) => { cellRefs.current[`ob-${i}`] = el }}
                        onChange={(e) => updateHole(i, 'ob', numOrNull(e.target.value))}
                        onKeyDown={(e) => onCellEnter(e, 'ob', i)}
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

function resolveInitialCourseId(initialRound, courses, getCourse) {
  if (initialRound) {
    if (initialRound.courseId && getCourse(initialRound.courseId)) return initialRound.courseId
    return CUSTOM
  }
  // New round: default to one of the user's own (preset) courses rather than an
  // arbitrary entry from the shared catalog.
  const preset = courses.find((c) => c.source === 'preset')
  return preset?.id || courses[0]?.id || CUSTOM
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

function makeHolesFor(courseId, defaultCount, getCourse) {
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

// Score-vs-par chip label + color class (matches the Rounds list).
function diffChip(diff) {
  const cls = diff <= 0 ? 'under' : diff <= 5 ? 'even' : 'over'
  const label = diff > 0 ? `+${diff}` : diff === 0 ? 'E' : String(diff)
  return { cls, label }
}
