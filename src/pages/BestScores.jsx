import { useMemo, useState } from 'react'
import { useData } from '../data/DataContext.jsx'
import { seedPresetCourses } from '../utils/seedCourses.js'
import { isIncomplete, isScramble, scoreColor } from '../utils/rounds.js'

// The Best Scores page shows one course at a time (chosen from a dropdown):
// the best score you've ever carded on each hole, plus a set of "completion"
// tasks for that course.
//
// Scoring rules:
//  - Scramble rounds never count here (a best-ball score isn't your score).
//  - Incomplete rounds count for per-hole things (a par you made on hole 7 is
//    real) but NOT for whole-round score tasks — an 80 through 14 holes isn't
//    an 18-hole score, so it can't "break 90".
export default function BestScores() {
  const { rounds, courses: catalog, loading, reload } = useData()

  const courses = useMemo(() => buildCourses(rounds, catalog), [rounds, catalog])
  const [selectedKey, setSelectedKey] = useState('')
  const [seeding, setSeeding] = useState(false)
  const [seedError, setSeedError] = useState('')

  if (loading) return <div className="container center muted">Loading…</div>

  const seedNow = async () => {
    setSeeding(true)
    setSeedError('')
    try {
      await seedPresetCourses()
      await reload()
    } catch (err) {
      setSeedError(err.message || 'Failed to import preset courses.')
      setSeeding(false)
    }
  }

  const selected = courses.find((c) => c.key === selectedKey) || courses[0]

  return (
    <div className="container">
      <div className="row">
        <h1 style={{ margin: 0 }}>Courses</h1>
        <div className="spacer" />
        <div>
          <label htmlFor="course-select">Course</label>
          <select
            id="course-select"
            value={selected?.key || ''}
            onChange={(e) => setSelectedKey(e.target.value)}
            style={{ minWidth: 220 }}
          >
            {courses.map((c) => (
              <option key={c.key} value={c.key}>
                {c.completed ? '✓ ' : ''}{c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {catalog.length === 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Import your courses</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Your course catalog is empty. Add your preset courses to get started —
            then log rounds against them (or search for new courses when adding a round).
          </p>
          <button className="primary" onClick={seedNow} disabled={seeding}>
            {seeding ? 'Importing…' : 'Import preset courses'}
          </button>
          {seedError && <div className="error">{seedError}</div>}
        </div>
      )}

      {!selected ? (
        <div className="card center muted">No courses to show yet.</div>
      ) : (
        <>
          <div className="row" style={{ marginTop: 20 }}>
            <h2 style={{ margin: 0 }}>{selected.name}</h2>
            {selected.par3 && <span className="tag">Par 3</span>}
            <div className="spacer" />
            {selected.completed ? (
              <span className="tag complete">✓ Completed</span>
            ) : (
              <span className="tag">
                {selected.doneCount}/{selected.tasks.length} tasks
              </span>
            )}
          </div>

          <h3 style={{ margin: '20px 0 10px', fontSize: '1rem' }}>Completion</h3>
          <div className="grid cols-2">
            {selected.tasks.map((t) => (
              <div className={`achievement ${t.done ? '' : 'locked'}`} key={t.id}>
                <div className="badge">{t.done ? '✓' : '○'}</div>
                <div>
                  <div className="title">{t.label}</div>
                  <div className="desc">{t.detail}</div>
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ margin: '24px 0 10px', fontSize: '1rem' }}>Best score per hole</h3>
          {selected.roundCount === 0 ? (
            <div className="card center muted">
              No rounds logged on {selected.name} yet.
            </div>
          ) : (
            <div className="card">
              <div className="row" style={{ marginBottom: 12 }}>
                <span className="muted">
                  {selected.roundCount} round{selected.roundCount === 1 ? '' : 's'} counted
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="holes-table">
                  <thead>
                    <tr>
                      <th></th>
                      {selected.bestPerHole.map((_, i) => <th key={i}>{i + 1}</th>)}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Par</th>
                      {selected.bestPerHole.map((h, i) => (
                        <td key={i} className="muted">{h.par ?? '—'}</td>
                      ))}
                      <td className="muted"><strong>{selected.totalPar || '—'}</strong></td>
                    </tr>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Best</th>
                      {selected.bestPerHole.map((h, i) => {
                        const diff = h.best != null && h.par != null ? h.best - h.par : null
                        const color = diff == null ? 'var(--muted)' : scoreColor(diff)
                        return <td key={i} style={{ color, fontWeight: 600 }}>{h.best ?? '—'}</td>
                      })}
                      <td><strong>{selected.totalBest || '—'}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Build the full list of selectable courses (preset + any custom names that
// appear in rounds), each with its best-per-hole data and completion tasks,
// sorted alphabetically by name.
function buildCourses(rounds, catalog) {
  const entries = catalog.map((c) => ({
    key: c.id,
    name: c.name,
    par3: c.par3 === true,
    holeCount: c.pars.length,
    pars: c.pars,
    belongs: (r) => r.courseId === c.id,
  }))

  // Custom courses: grouped by name, skipping any that collide with a catalog course.
  const presetNames = new Set(catalog.map((c) => c.name))
  const customNames = [
    ...new Set(
      rounds
        .filter((r) => !r.courseId && r.courseName && !presetNames.has(r.courseName))
        .map((r) => r.courseName)
    ),
  ]
  for (const name of customNames) {
    const rs = rounds.filter((r) => !r.courseId && r.courseName === name)
    const holeCount = Math.max(...rs.map((r) => r.holes?.length ?? 0), 0)
    const knownPars = rs.flatMap((r) => (r.holes ?? []).map((h) => h.par)).filter((p) => typeof p === 'number')
    const par3 = knownPars.length > 0 && knownPars.every((p) => p === 3)
    entries.push({
      key: `custom:${name}`,
      name,
      par3,
      holeCount,
      pars: null,
      belongs: (r) => !r.courseId && r.courseName === name,
    })
  }

  return entries
    .map((e) => computeCourse(e, rounds))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Compute best-per-hole + completion tasks for a single course.
function computeCourse(course, allRounds) {
  // Scrambles never count on this page.
  const rounds = allRounds.filter((r) => course.belongs(r) && !isScramble(r))
  const holeCount = course.holeCount

  // Best score per hole across every played hole (incomplete rounds' played
  // holes count — their scores on the holes they finished are real).
  const bestPerHole = []
  for (let i = 0; i < holeCount; i++) {
    let best = null
    let par = course.pars?.[i] ?? null
    for (const r of rounds) {
      const h = r.holes?.[i]
      if (!h || typeof h.score !== 'number') continue
      if (best == null || h.score < best) best = h.score
      if (par == null && typeof h.par === 'number') par = h.par
    }
    bestPerHole.push({ par, best })
  }
  const totalBest = bestPerHole.reduce((s, h) => s + (h.best ?? 0), 0)
  const totalPar = bestPerHole.reduce((s, h) => s + (h.par ?? 0), 0)

  // Per-hole achievements (incomplete rounds included).
  const parredHoles = new Set()
  let hasBirdie = false
  for (const r of rounds) {
    const holes = Array.isArray(r.holes) ? r.holes : []
    holes.forEach((h, i) => {
      if (typeof h.score !== 'number' || typeof h.par !== 'number') return
      if (h.score <= h.par) parredHoles.add(i)       // par or better
      if (h.score <= h.par - 1) hasBirdie = true      // birdie or better
    })
  }
  const parredCount = [...parredHoles].filter((i) => i < holeCount).length

  // Whole-round score task: only fully-played rounds of this course's length.
  const fullRounds = rounds.filter(
    (r) =>
      !isIncomplete(r) &&
      Array.isArray(r.holes) &&
      r.holes.length === holeCount &&
      r.holes.every((h) => typeof h.score === 'number')
  )
  const scoreTarget = course.par3 ? 72 : 90
  const bestFull = fullRounds.length ? Math.min(...fullRounds.map((r) => r.totalScore)) : null
  const brokeTarget = bestFull != null && bestFull < scoreTarget
  const broke100 = bestFull != null && bestFull < 100

  const playCount = rounds.length

  const tasks = [
    {
      id: 'played',
      label: 'Play the course',
      done: playCount >= 1,
      detail: playCount ? `${playCount} round${playCount === 1 ? '' : 's'} played` : 'Not played yet',
    },
    {
      id: 'played-3',
      label: 'Play 3 rounds',
      done: playCount >= 3,
      detail: `${Math.min(playCount, 3)} of 3 rounds`,
    },
    {
      id: 'played-5',
      label: 'Play 5 rounds',
      done: playCount >= 5,
      detail: `${Math.min(playCount, 5)} of 5 rounds`,
    },
    {
      id: 'par-one',
      label: 'Make a par',
      done: parredCount >= 1,
      detail: parredCount ? 'Parred a hole (or better)' : 'No pars yet',
    },
    {
      id: 'birdie',
      label: 'Make a birdie',
      done: hasBirdie,
      detail: hasBirdie ? 'Carded a birdie (or better)' : 'No birdies yet',
    },
    {
      id: 'par-all',
      label: 'Par or better on every hole',
      done: holeCount > 0 && parredCount >= holeCount,
      detail: `${Math.min(parredCount, holeCount)} of ${holeCount} holes parred`,
    },
    ...(course.par3
      ? []
      : [
          {
            id: 'break-100',
            label: 'Break 100',
            done: broke100,
            detail:
              bestFull != null ? `Best full round: ${bestFull}` : 'No complete rounds yet',
          },
        ]),
    {
      id: 'break',
      label: `Break ${scoreTarget}`,
      done: brokeTarget,
      detail:
        bestFull != null
          ? `Best full round: ${bestFull}`
          : 'No complete rounds yet',
    },
  ]

  const doneCount = tasks.filter((t) => t.done).length
  const completed = doneCount === tasks.length

  return {
    ...course,
    roundCount: rounds.length,
    bestPerHole,
    totalBest,
    totalPar,
    tasks,
    doneCount,
    completed,
  }
}
