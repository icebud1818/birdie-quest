import { useMemo } from 'react'
import { useData } from '../data/DataContext.jsx'
import { isScramble } from '../utils/rounds.js'

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
              <div className="card" key={t.id}>
                <div className="stat-label">{t.label}</div>
                <div className="stat-value">{t.value}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function RecordCard({ record }) {
  const { label, display, round } = record
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
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

  const lowest18 = pick((r) => (isFull18(r) ? r.totalScore : null), lower)
  const bestVsPar = pick((r) => (isFull18(r) ? r.totalScore - r.totalPar : null), lower)
  const front9 = pick((r) => nineSum(r, 0), lower)
  const back9 = pick((r) => nineSum(r, 9), lower)

  const mostBirdies = pick((r) => countHoles(r, (s, p) => s === p - 1) || null, higher)
  const mostPars = pick((r) => countHoles(r, (s, p) => s === p) || null, higher)
  const mostGir = pick((r) => holesOf(r).filter((h) => h.gir === true).length || null, higher)

  const fewestPutts = pick((r) => {
    if (!isFull18(r)) return null
    const hs = holesOf(r)
    if (!hs.every((h) => typeof h.putts === 'number')) return null
    return hs.reduce((s, h) => s + h.putts, 0)
  }, lower)

  const parStreak = pick((r) => longestStreak(r, (s, p) => s <= p) || null, higher)
  const birdieStreak = pick((r) => longestStreak(r, (s, p) => s <= p - 1) || null, higher)

  const roundRecords = [
    rec('lowest-18', 'Lowest 18-hole score', lowest18, (v) => v),
    rec('best-vs-par', 'Best 18 vs par', bestVsPar, fmtVsPar),
    rec('front-9', 'Lowest front 9', front9, (v) => v),
    rec('back-9', 'Lowest back 9', back9, (v) => v),
    rec('most-birdies', 'Most birdies in a round', mostBirdies, (v) => v),
    rec('most-pars', 'Most pars in a round', mostPars, (v) => v),
    rec('fewest-putts', 'Fewest putts in a round', fewestPutts, (v) => v),
    rec('most-gir', 'Most greens in regulation', mostGir, (v) => v),
    rec('par-streak', 'Longest par-or-better streak', parStreak, (v) => v),
    rec('birdie-streak', 'Longest birdie-or-better streak', birdieStreak, (v) => v),
  ]

  // Career totals across every non-scramble round (incomplete included).
  let pars = 0, birdies = 0, eagles = 0, albatrosses = 0, aces = 0, holesPlayed = 0
  for (const r of rounds) {
    for (const h of holesOf(r)) {
      if (!scored(h)) continue
      holesPlayed += 1
      if (h.score === 1) aces += 1
      if (typeof h.par !== 'number') continue
      const diff = h.score - h.par
      if (diff === 0) pars += 1
      else if (diff === -1) birdies += 1
      else if (diff === -2) eagles += 1
      else if (diff <= -3) albatrosses += 1
    }
  }

  const totals = [
    { id: 'rounds', label: 'Rounds logged', value: rounds.length },
    { id: 'holes', label: 'Holes played', value: holesPlayed },
    { id: 'pars', label: 'Total pars', value: pars },
    { id: 'birdies', label: 'Total birdies', value: birdies },
    { id: 'eagles', label: 'Total eagles', value: eagles },
    { id: 'albatrosses', label: 'Total albatrosses', value: albatrosses },
    { id: 'aces', label: 'Total hole-in-ones', value: aces },
  ]

  return { roundCount: rounds.length, roundRecords, totals }
}

// Build a round-record entry for display. `best` is { value, round } or null.
function rec(id, label, best, format) {
  return {
    id,
    label,
    display: best ? format(best.value) : null,
    round: best ? best.round : null,
  }
}
