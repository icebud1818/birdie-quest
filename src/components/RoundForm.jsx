import { useMemo, useRef, useState } from 'react'
import { useData } from '../data/DataContext.jsx'
import CourseCombobox from './CourseCombobox.jsx'
import { fetchCourse } from '../utils/firestore.js'
import { courseLookupEnabled, importClubCourses, searchCourses } from '../utils/courseApi.js'
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
  // Rating/slope for a preset-course tee — defaults to the selected tee's values
  // but is editable so a wrong/re-rated course can be corrected on this round.
  const [teeRating, setTeeRating] = useState(() => {
    if (initialCourseId === CUSTOM) return ''
    const c = getCourse(initialCourseId)
    const r = initialTee?.rating ?? teeById(c, initialTee?.id || c?.tees?.[0]?.id)?.rating
    return r != null ? String(r) : ''
  })
  const [teeSlope, setTeeSlope] = useState(() => {
    if (initialCourseId === CUSTOM) return ''
    const c = getCourse(initialCourseId)
    const s = initialTee?.slope ?? teeById(c, initialTee?.id || c?.tees?.[0]?.id)?.slope
    return s != null ? String(s) : ''
  })
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
  // Tracks whether the user hand-edited any hole's stroke index, so the
  // course-wide backfill can leave this round's values alone.
  const [siEdited, setSiEdited] = useState(false)

  const preset = courseId !== CUSTOM ? getCourse(courseId) : null
  const selectedTee = teeById(preset, teeId)

  // Preset courses show their pars/stroke indexes read-only until you opt into
  // overriding them, so a wrong scorecard can be corrected on this round without
  // stray edits happening by accident. In edit mode, start checked when the
  // saved round already differs from the course.
  const [parOverride, setParOverride] = useState(() =>
    initialRound ? holesDifferFromCourse(initialRound.holes, getCourse(initialCourseId)) : false
  )
  const parsEditable = courseId === CUSTOM || parOverride
  const siEditable = courseId === CUSTOM || parOverride

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
  const [searchedFor, setSearchedFor] = useState('') // last query that completed
  const [importing, setImporting] = useState(null) // externalId currently importing
  const [lookupError, setLookupError] = useState('')
  const [courseChoices, setCourseChoices] = useState(null) // courses to pick from, or null

  // Select a tee and load its rating/slope into the editable fields.
  const setTeeFrom = (course, id) => {
    const t = (course?.tees || []).find((x) => x.id === id)
    setTeeId(t?.id || id || '')
    setTeeRating(t?.rating != null ? String(t.rating) : '')
    setTeeSlope(t?.slope != null ? String(t.slope) : '')
  }

  const onCourseChange = (nextId) => {
    setCourseId(nextId)
    setParOverride(false)
    if (nextId === CUSTOM) {
      setHoles(blankHoles(customHoleCount, /*editablePar*/ true))
    } else if (nextId === SEARCH) {
      // Show the search panel; leave the current holes until a course is picked.
    } else {
      setHoles(makeHolesFor(nextId, 18, getCourse))
      setTeeFrom(getCourse(nextId), getCourse(nextId)?.tees?.[0]?.id)
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
    setParOverride(false)
    setHoles(course.pars.map((par, i) => ({
      par,
      si: course.strokeIndexes?.[i] ?? null,
      score: null, putts: 2, ob: 0, gir: false,
    })))
    setTeeFrom(course, course.tees?.[0]?.id)
    setResults([])
    setCourseChoices(null)
    setQuery('')
    setSearchedFor('')
    setLookupError('')
  }

  const runSearch = async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setLookupError('')
    setResults([])
    setCourseChoices(null)
    try {
      setResults(await searchCourses(q))
      setSearchedFor(q)
    } catch (err) {
      setLookupError(err.message || 'Search failed.')
      setSearchedFor('')
    } finally {
      setSearching(false)
    }
  }

  // Turn a fully-formed course (from the lookup) into the selected course,
  // reusing a shared-catalog copy when one already exists (0 extra writes).
  const finalizeCourse = async (course) => {
    const local = getCourse(course.id)
    if (local) {
      selectCourse(local)
      return
    }
    const remote = await fetchCourse(course.id)
    if (remote) {
      selectCourse(remote)
      return
    }
    await addCourse(course)
    selectCourse(course)
  }

  // A search result is a club, which may map to several courses (e.g. a 27-hole
  // facility's 9-hole pairings). Fetch them; auto-select when there's one,
  // otherwise show a picker.
  const pickResult = async (r) => {
    setImporting(r.externalId)
    setLookupError('')
    try {
      const found = await importClubCourses(r.externalId)
      if (found.length === 0) throw new Error('No course data is available for this facility yet.')
      if (found.length === 1) await finalizeCourse(found[0])
      else setCourseChoices(found)
    } catch (err) {
      setLookupError(err.message || 'Could not add that course.')
    } finally {
      setImporting(null)
    }
  }

  const pickCourseChoice = async (course) => {
    setImporting(course.id)
    setLookupError('')
    try {
      await finalizeCourse(course)
    } catch (err) {
      setLookupError(err.message || 'Could not add that course.')
    } finally {
      setImporting(null)
    }
  }

  const updateHole = (idx, field, value) => {
    setHoles((prev) => prev.map((h, i) => (i === idx ? { ...h, [field]: value } : h)))
  }

  // Turning the override off discards the edits and restores the course's own
  // pars / stroke indexes, so unchecking is always a clean undo.
  const onParOverrideChange = (checked) => {
    setParOverride(checked)
    if (!checked && preset) {
      setHoles((prev) =>
        prev.map((h, i) => ({
          ...h,
          par: preset.pars?.[i] ?? h.par,
          si: preset.strokeIndexes?.[i] ?? null,
        }))
      )
      setSiEdited(false)
    }
  }

  // Enter in a hole input jumps to the same column on the next hole, instead of
  // submitting the round. Refs are keyed `${field}-${holeIndex}`.
  const cellRefs = useRef({})
  const focusField = (el) => {
    if (!el) return
    el.focus()
    // select() throws on some input types (date, etc.) — only text/number.
    if (el.type === 'text' || el.type === 'number') el.select?.()
  }
  const onCellEnter = (e, field, i) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    focusField(cellRefs.current[`${field}-${i + 1}`])
  }

  // Outside the hole table, Enter advances to the next field in the form rather
  // than submitting it. Hole cells (which jump down their own column) and the
  // course/search boxes handle Enter themselves and call preventDefault, so
  // they're skipped here.
  const formRef = useRef(null)
  const onFormEnter = (e) => {
    if (e.key !== 'Enter' || e.defaultPrevented) return
    const el = e.target
    if (el.tagName !== 'INPUT' || el.type === 'checkbox') return
    if (el.getAttribute('role') === 'combobox') return
    e.preventDefault()
    const fields = Array.from(
      formRef.current.querySelectorAll('input, select, textarea')
    ).filter((f) => !f.disabled && f.type !== 'hidden' && f.type !== 'checkbox')
    focusField(fields[fields.indexOf(el) + 1])
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
    // Wherever pars are hand-entered, every hole actually played needs one.
    if (
      parsEditable &&
      holes.some((h) => typeof h.score === 'number' && typeof h.par !== 'number')
    ) {
      setError('Enter a par for every hole you played.')
      return
    }
    // Stroke index, if used at all, must be a complete set — each number 1..N
    // exactly once — so per-hole handicap strokes are allocated correctly.
    // (Leaving every hole's HCP blank is allowed for courses without one.)
    const siVals = holes.map((h) => h.si).filter((v) => typeof v === 'number')
    if (siVals.length > 0) {
      const n = holes.length
      const seen = new Set(siVals)
      const complete =
        siVals.length === n && seen.size === n && Array.from({ length: n }, (_, i) => i + 1).every((k) => seen.has(k))
      if (!complete) {
        setError(`Stroke index must list each number 1–${n} exactly once (or leave every hole's HCP blank).`)
        return
      }
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
      if (t) {
        const rating = numOrNull(teeRating)
        const slope = numOrNull(teeSlope)
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
        tee = { id: t.id, name: t.name, rating, slope }
      }
    }

    // Keep every hole slot (so hole positions line up across rounds), but leave
    // unplayed holes with a null score.
    const cleanedHoles = holes.map((h) => {
      const out = {
        par: typeof h.par === 'number' ? h.par : null,
        score: typeof h.score === 'number' ? h.score : null,
      }
      if (typeof h.si === 'number') out.si = h.si
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
    // Once a round's stroke index is hand-edited, protect it from the backfill.
    if (siEdited || initialRound?.siManual === true) round.siManual = true
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
        Fill in your scorecard below — press Enter to jump to the next box.
      </p>
      <form onSubmit={submit} onKeyDown={onFormEnter} ref={formRef}>
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
                <select value={teeId} onChange={(e) => setTeeFrom(preset, e.target.value)}>
                  {preset.tees.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.rating != null && t.slope != null ? ` — ${t.rating}/${t.slope}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {courseId !== CUSTOM && preset?.tees?.length > 0 && (
              <>
                <div>
                  <label>Course rating</label>
                  <input
                    type="number"
                    step="0.1"
                    min="50"
                    max="90"
                    value={teeRating}
                    onChange={(e) => setTeeRating(e.target.value)}
                    placeholder="e.g. 71.2"
                  />
                </div>
                <div>
                  <label>Slope rating</label>
                  <input
                    type="number"
                    min="55"
                    max="155"
                    value={teeSlope}
                    onChange={(e) => setTeeSlope(e.target.value)}
                    placeholder="e.g. 128"
                  />
                </div>
              </>
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
          {/* USGA is the authoritative source for tee ratings; when it had no
              match, the import falls back to OpenGC's own numbers and the tee
              list is often incomplete. Say so, since a one-tee course otherwise
              looks indistinguishable from a course that really has one tee. */}
          {selectedTee?.ratingSource === 'opengc' && (
            <div className="muted" style={{ fontSize: '0.85rem', marginTop: 10 }}>
              Ratings for this tee come from OpenGC — USGA had no match for this
              course, so the tee list may be incomplete and the rating/slope
              unverified. Check them against your scorecard.
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
                  {searching ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span className="spinner" />
                      Searching…
                    </span>
                  ) : (
                    'Search'
                  )}
                </button>
              </div>
              {importing != null && (
                <div
                  className="muted"
                  style={{ fontSize: '0.85rem', marginTop: 10 }}
                  role="status"
                  aria-live="polite"
                >
                  Loading hole data from OpenGC and ratings from USGA — this can
                  take a few seconds.
                </div>
              )}
              {lookupError && <div className="error">{lookupError}</div>}
              {!searching && searchedFor && results.length === 0 && !courseChoices && !lookupError && (
                <div className="muted" style={{ fontSize: '0.85rem', marginTop: 8 }}>
                  No courses matched “{searchedFor}”. Try a shorter name, or use
                  “+ Custom course…” to enter the pars yourself.
                </div>
              )}
              {courseChoices ? (
                <div className="grid" style={{ marginTop: 12 }}>
                  <div className="row">
                    <strong>Which course did you play?</strong>
                    <div className="spacer" />
                    <button
                      type="button"
                      onClick={() => setCourseChoices(null)}
                      disabled={importing != null}
                    >
                      ← Back
                    </button>
                  </div>
                  {courseChoices.some((c) => c.ambiguous) && (
                    <div className="muted" style={{ fontSize: '0.85rem' }}>
                      Some of these are the same course listed twice upstream with
                      conflicting hole data. Compare the pars below against your
                      scorecard and pick the one that matches — you can also correct
                      pars per-round with the override on the scorecard.
                    </div>
                  )}
                  {courseChoices.map((c, ci) => (
                    <button
                      type="button"
                      key={c.id}
                      className="achievement"
                      onClick={() => pickCourseChoice(c)}
                      disabled={importing != null}
                      style={{ textAlign: 'left', cursor: importing != null ? 'wait' : 'pointer' }}
                    >
                      <div style={{ flex: 1 }}>
                        <div className="title">
                          {c.name}
                          {c.ambiguous && ci === 0 && (
                            <span className="tag complete" style={{ marginLeft: 8 }}>
                              Best match
                            </span>
                          )}
                        </div>
                        <div className="desc">
                          {c.tees.length} tee{c.tees.length === 1 ? '' : 's'} ·{' '}
                          {parSummary(c.pars)}
                          {c.source === 'opengc' && (
                            <span className="tag par3" style={{ marginLeft: 8 }}>
                              no USGA ratings
                            </span>
                          )}
                        </div>
                        <div className="desc par-seq">{parSequence(c.pars)}</div>
                      </div>
                      <span className="muted">
                        {importing === c.id ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span className="spinner" />
                            Adding…
                          </span>
                        ) : (
                          'Select'
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                results.length > 0 && (
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
                        <span className="muted">
                          {importing === r.externalId ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span className="spinner" />
                              Adding…
                            </span>
                          ) : (
                            'Add'
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              )}
              <div className="muted" style={{ fontSize: '0.85rem', marginTop: 10 }}>
                Can't find it? Choose “+ Custom course…” to enter the pars manually.
              </div>
              <div className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                Hole info (par &amp; stroke index) from OpenGC · course &amp; slope ratings from USGA.
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
          {preset && (
            <>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: parOverride ? 6 : 12,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={parOverride}
                  onChange={(e) => onParOverrideChange(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                <span>Override this course's pars &amp; stroke index (HCP)</span>
              </label>
              {parOverride && (
                <div className="muted" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
                  Use this when the course's scorecard is wrong. Your values are
                  saved with this round only — unchecking restores the course's.
                </div>
              )}
            </>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="holes-table">
              <thead>
                <tr>
                  <th>Hole</th>
                  <th>Par</th>
                  <th>HCP</th>
                  <th>Strokes</th>
                  <th>Putts</th>
                  <th>OB</th>
                  <th>GIR</th>
                </tr>
              </thead>
              <tbody>
                {holes.map((h, i) => (
                  <tr key={i}>
                    <td className="hole-num">{i + 1}</td>
                    <td>
                      {parsEditable ? (
                        <input
                          type="number"
                          min="3" max="6"
                          value={h.par ?? ''}
                          ref={(el) => { cellRefs.current[`par-${i}`] = el }}
                          onChange={(e) => updateHole(i, 'par', numOrNull(e.target.value))}
                          onKeyDown={(e) => onCellEnter(e, 'par', i)}
                          required={!incomplete}
                        />
                      ) : (
                        h.par
                      )}
                    </td>
                    <td>
                      {siEditable ? (
                        <input
                          type="number"
                          min="1"
                          max={holes.length}
                          value={h.si ?? ''}
                          ref={(el) => { cellRefs.current[`si-${i}`] = el }}
                          onChange={(e) => {
                            setSiEdited(true)
                            updateHole(i, 'si', numOrNull(e.target.value))
                          }}
                          onKeyDown={(e) => onCellEnter(e, 'si', i)}
                        />
                      ) : (
                        h.si ?? '—'
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

// "7 tees · par 71 (out 35 · in 36) · 18 holes" — the out/in split is what
// distinguishes two upstream copies of a course whose nines are swapped, since
// their totals are identical.
function parSummary(pars) {
  const total = pars.reduce((s, p) => s + p, 0)
  if (pars.length !== 18) return `par ${total} · ${pars.length} holes`
  const out9 = pars.slice(0, 9).reduce((s, p) => s + p, 0)
  return `par ${total} (out ${out9} · in ${total - out9}) · 18 holes`
}

// Hole-by-hole pars, nines separated, for comparing against a scorecard.
function parSequence(pars) {
  if (pars.length !== 18) return pars.join(' ')
  return `${pars.slice(0, 9).join(' ')}  |  ${pars.slice(9).join(' ')}`
}

// True when a saved round's pars / stroke indexes don't match the course it was
// played on — i.e. they were overridden when the round was logged.
function holesDifferFromCourse(roundHoles, course) {
  if (!roundHoles || !course) return false
  if (roundHoles.length !== course.pars?.length) return true
  return roundHoles.some((h, i) => {
    const par = typeof h.par === 'number' ? h.par : null
    const si = typeof h.si === 'number' ? h.si : null
    return par !== (course.pars[i] ?? null) || si !== (course.strokeIndexes?.[i] ?? null)
  })
}

function toFormHole(h) {
  return {
    par: typeof h.par === 'number' ? h.par : null,
    si: typeof h.si === 'number' ? h.si : null,
    score: typeof h.score === 'number' ? h.score : null,
    putts: typeof h.putts === 'number' ? h.putts : null,
    ob: typeof h.ob === 'number' ? h.ob : null,
    gir: h.gir === true,
  }
}

function makeHolesFor(courseId, defaultCount, getCourse) {
  const c = getCourse(courseId)
  if (c) {
    return c.pars.map((par, i) => ({
      par,
      si: c.strokeIndexes?.[i] ?? null,
      score: null, putts: 2, ob: 0, gir: false,
    }))
  }
  return blankHoles(defaultCount, true)
}

function blankHoles(count, editablePar) {
  return Array.from({ length: count }, () => ({
    par: editablePar ? null : 4,
    si: null,
    score: null,
    putts: 2,
    ob: 0,
    gir: false,
  }))
}

function teeById(course, id) {
  return (course?.tees || []).find((t) => t.id === id) || null
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
