// Simplified handicap calculation.
//
// The World Handicap System uses per-course rating + slope values that we don't
// have here, so we approximate: each round's "differential" is (score - par),
// and the handicap is the average of the best 8 of the most recent 20
// 18-hole rounds. If the user has fewer than 3 eligible rounds we return null.
//
// This is not USGA-official, but it tracks improvement well enough for a
// group of friends.

import { isParThreeCourse, isScramble } from './rounds.js'

export function calculateHandicap(rounds) {
  const eligible = rounds
    .filter((r) => !r.incomplete)
    .filter((r) => !isScramble(r))
    .filter((r) => !isParThreeCourse(r))
    .filter((r) => Array.isArray(r.holes) && r.holes.length === 18)
    .filter((r) => r.holes.every((h) => typeof h.score === 'number'))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 20)

  if (eligible.length < 3) return null

  const differentials = eligible.map((r) => r.totalScore - r.totalPar)
  const bestCount = Math.min(8, Math.max(1, Math.floor(eligible.length * 0.4)))
  const best = [...differentials].sort((a, b) => a - b).slice(0, bestCount)
  const avg = best.reduce((s, d) => s + d, 0) / best.length
  return Math.round(avg * 10) / 10
}
