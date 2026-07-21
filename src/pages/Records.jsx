import { useMemo } from 'react'
import { useData } from '../data/DataContext.jsx'
import { isParThreeCourse, isScramble, tracksStats } from '../utils/rounds.js'
import { TrophyIcon, TargetIcon, FlagIcon, CircleIcon, StarIcon, FlameIcon } from '../components/Icons.jsx'

// Personal Records ("PRs") — bests and career totals across all rounds.
//
// Rules:
//  - Scramble rounds never count (a best-ball score isn't your record).
//  - Incomplete rounds count toward per-hole records (birdies, pars, streaks),
//    career totals, and a completed front/back nine — but NOT toward full-18
//    records (lowest 18, fewest putts), where partial data would be unfair.
export default function Records() {
  const { rounds, loading } = useData()
  const records = useMemo(() => computeRecords(rounds), [rounds])

  if (loading) return <div className="container center muted">Loading…</div>

  return (
    <div className="container">
      <h1>Personal records</h1>

      {records.roundCount === 0 ? (
        <div className="card center muted">
          No rounds logged yet — your records will show up here as you play.
        </div>
      ) : (
        <>
          <h2>Round bests</h2>
          <div className="grid cols-3">
            {records.roundRecords.map((r) => (
              <RecordCard key={r.id} record={r} />
            ))}
          </div>

          <h2>Career totals</h2>
          <div className="grid cols-3">
            {records.totals.map((t) => (
              <div className="card stat-tile interactive" key={t.id} style={{ '--tile-accent': t.accent }}>
                <div className="stat-label">{t.label}</div>
                <div className="stat-value" style={t.color ? { color: t.color } : undefined}>
                  {t.value}
                </div>
                {t.sub ? <div className="stat-sub">{t.sub}</div> : null}
              </div>
            ))}
          </div>

          <p className="muted" style={{ marginTop: 24, fontSize: '0.85rem' }}>
            Scramble rounds count only toward rounds logged and holes played — they're
            excluded from every other record and total on this page.
          </p>
        </>
      )}
    </div>
  )
}

function RecordCard({ record }) {
  const { label, display, round, icon, badge } = record
  return (
    <div className="card interactive">
      <div className="stat-head">
        <span className="stat-label">{label}</span>
        <span className={`icon-badge ${badge || ''}`}>{icon}</span>
      </div>
      <div className="stat-value">{display ?? '—'}</div>
      {round ? (
        <div className="stat-sub">
          {round.courseName}
          {round.date ? ` · ${round.date}` : ''}
        </div>
      ) : (
        <div className="stat-sub">No qualifying round yet</div>
      )}
    </div>
  )
}

const holesOf = (r) => (Array.isArray(r.holes) ? r.holes : [])
const scored = (h) => typeof h?.score === 'number'
const scoredWithPar = (h) => typeof h?.score === 'number' && typeof h?.par === 'number'

// Count holes in a round matching a (score, par) predicate.
function countHoles(round, pred) {
  return holesOf(round).filter((h) => scoredWithPar(h) && pred(h.score, h.par)).length
}

// Longest run of consecutive played holes matching a predicate. An unplayed
// hole (or one that fails the predicate) breaks the streak.
function longestStreak(round, pred) {
  let best = 0
  let cur = 0
  for (const h of holesOf(round)) {
    if (scoredWithPar(h) && pred(h.score, h.par)) {
      cur += 1
      if (cur > best) best = cur
    } else {
      cur = 0
    }
  }
  return best
}

// Sum of a nine (start = 0 for front, 9 for back), or null if not fully played.
function nineSum(round, start) {
  const hs = holesOf(round)
  if (hs.length < start + 9) return null
  const slice = hs.slice(start, start + 9)
  if (!slice.every(scored)) return null
  return slice.reduce((s, h) => s + h.score, 0)
}

const isFull18 = (r) => {
  const hs = holesOf(r)
  return hs.length === 18 && hs.every(scored)
}

function fmtVsPar(diff) {
  if (diff === 0) return 'E'
  return diff > 0 ? `+${diff}` : `${diff}`
}

// Lowest single nine (front or back) across all rounds. Each round contributes
// up to two candidates; par-3 courses are skipped. Returns { value, round }.
function pickNine(rounds) {
  let best = null
  for (const r of rounds) {
    if (isParThreeCourse(r)) continue
    for (const start of [0, 9]) {
      const v = nineSum(r, start)
      if (v == null) continue
      if (best == null || v < best.value) best = { value: v, round: r }
    }
  }
  return best
}

function computeRecords(allRounds) {
  const rounds = allRounds.filter((r) => !isScramble(r))

  // Pick the round optimizing some per-round value. `value(round)` returns a
  // number or null (skip). `better(a, b)` is true when a beats current best.
  const pick = (value, better) => {
    let best = null // { value, round }
    for (const r of rounds) {
      const v = value(r)
      if (v == null) continue
      if (best == null || better(v, best.value)) best = { value: v, round: r }
    }
    return best
  }

  const lower = (a, b) => a < b
  const higher = (a, b) => a > b

  // Par-3 courses are excluded from full-round / nine / GIR records: their
  // low scoring and easy greens would swamp everything else.
  const notPar3 = (r) => !isParThreeCourse(r)

  const lowest18 = pick((r) => (isFull18(r) && notPar3(r) ? r.totalScore : null), lower)
  const bestVsPar = pick((r) => (isFull18(r) ? r.totalScore - r.totalPar : null), lower)

  // Lowest single nine — front OR back, whichever is best, across all rounds.
  const bestNine = pickNine(rounds)

  const mostBirdies = pick((r) => countHoles(r, (s, p) => s === p - 1) || null, higher)
  const mostPars = pick((r) => countHoles(r, (s, p) => s === p) || null, higher)
  const mostGir = pick(
    (r) => (notPar3(r) ? holesOf(r).filter((h) => h.gir === true).length || null : null),
    higher
  )

  const fewestPutts = pick((r) => {
    if (!isFull18(r)) return null
    const hs = holesOf(r)
    if (!hs.every((h) => typeof h.putts === 'number')) return null
    return hs.reduce((s, h) => s + h.putts, 0)
  }, lower)

  const parStreak = pick((r) => longestStreak(r, (s, p) => s <= p) || null, higher)
  const birdieStreak = pick((r) => longestStreak(r, (s, p) => s <= p - 1) || null, higher)

  const roundRecords = [
    rec('lowest-18', 'Lowest round', lowest18, (v) => v, <TrophyIcon />, ''),
    rec('best-vs-par', 'Best score', bestVsPar, fmtVsPar, <TargetIcon />, ''),
    rec('best-nine', 'Lowest 9 (front or back)', bestNine, (v) => v, <FlagIcon />, 'blue'),
    rec('most-birdies', 'Most birdies in a round', mostBirdies, (v) => v, <StarIcon />, ''),
    rec('most-pars', 'Most pars in a round', mostPars, (v) => v, <CircleIcon />, ''),
    rec('fewest-putts', 'Fewest putts in a round', fewestPutts, (v) => v, <CircleIcon />, 'blue'),
    rec('most-gir', 'Most greens in regulation', mostGir, (v) => v, <TargetIcon />, 'blue'),
    rec('par-streak', 'Longest par-or-better streak', parStreak, (v) => v, <FlameIcon />, 'orange'),
    rec('birdie-streak', 'Longest birdie-or-better streak', birdieStreak, (v) => v, <FlameIcon />, 'orange'),
  ]

  // Rounds logged and holes played count EVERY round (scrambles included);
  // all other totals below exclude scrambles, matching the rest of the page.
  let holesPlayed = 0
  for (const r of allRounds) {
    for (const h of holesOf(r)) if (scored(h)) holesPlayed += 1
  }

  // Career totals across every non-scramble round (incomplete included).
  let pars = 0, birdies = 0, eagles = 0, albatrosses = 0, aces = 0, bogeys = 0
  let gir = 0 // greens in regulation — only from stat-tracked rounds
  const courseSet = new Set()
  for (const r of rounds) {
    const courseKey = r.courseId ?? r.courseName
    if (courseKey != null && courseKey !== '') courseSet.add(courseKey)
    const roundTracks = tracksStats(r)
    for (const h of holesOf(r)) {
      if (roundTracks && h.gir === true) gir += 1
      if (!scored(h)) continue
      if (h.score === 1) aces += 1
      if (typeof h.par !== 'number') continue
      const diff = h.score - h.par
      if (diff === 0) pars += 1
      else if (diff === -1) birdies += 1
      else if (diff === -2) eagles += 1
      else if (diff <= -3) albatrosses += 1
      else if (diff === 1) bogeys += 1
    }
  }

  const totals = [
    { id: 'rounds', label: 'Rounds logged', value: allRounds.length, accent: 'var(--border)' },
    { id: 'holes', label: 'Holes played', value: holesPlayed, accent: 'var(--border)' },
    { id: 'courses', label: 'Courses played', value: courseSet.size, accent: 'var(--border)' },
    { id: 'bogeys', label: 'Total bogeys', value: bogeys, accent: '#f87171', color: '#f87171' },
    { id: 'pars', label: 'Total pars', value: pars, accent: '#4ade80', color: '#4ade80' },
    { id: 'birdies', label: 'Total birdies', value: birdies, accent: '#38bdf8', color: '#38bdf8' },
    { id: 'eagles', label: 'Total eagles', value: eagles, accent: '#fbbf24', color: '#fbbf24' },
    { id: 'albatrosses', label: 'Total albatrosses', value: albatrosses, accent: '#a78bfa', color: '#a78bfa' },
    { id: 'aces', label: 'Total hole-in-ones', value: aces, accent: '#fb7185', color: '#fb7185' },
    { id: 'gir', label: 'Greens in regulation', value: gir, accent: '#2dd4bf', color: '#2dd4bf', sub: 'Tracked rounds only' },
  ]

  return { roundCount: allRounds.length, roundRecords, totals }
}

// Build a round-record entry for display. `best` is { value, round } or null.
function rec(id, label, best, format, icon, badge) {
  return {
    id,
    label,
    display: best ? format(best.value) : null,
    round: best ? best.round : null,
    icon,
    badge,
  }
}

