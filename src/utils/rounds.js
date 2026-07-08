import { getCourse } from '../data/courses.js'

// Color a hole's score by its strokes vs. par (diff = score - par):
//   birdie or better  → brightest green
//   par               → green
//   bogey             → yellow-green
//   double bogey → +4 → scale yellow → orange → red
//   +5 or worse       → straight red
export function scoreColor(diff) {
  if (diff <= -1) return 'hsl(150, 90%, 58%)'
  if (diff === 0) return 'hsl(140, 68%, 50%)'
  if (diff === 1) return 'hsl(90, 62%, 52%)'
  const t = Math.min((diff - 2) / 3, 1) // 0 at double bogey, 1 at +5 and beyond
  const hue = 55 - 55 * t // 55° yellow → 0° red
  return `hsl(${hue}, 82%, 55%)`
}

// Helpers for reasoning about complete vs. partial (incomplete) rounds.
//
// A round is "incomplete" when the golfer didn't finish what they set out to
// play — e.g. only played 9 of an 18-hole course, or walked off early. These
// rounds are still stored and shown, but they're excluded from the handicap,
// achievements, and best-score-of-round stats. Individual holes they *did*
// play still carry real scores.
//
// A round is a "scramble" when it was played in the scramble format (team
// takes each shot from the best lie), so the score doesn't reflect one
// golfer's play. Like incomplete rounds, scrambles are stored and shown but
// excluded from the handicap and — for now — from achievements.

export function holesPlayed(round) {
  if (!Array.isArray(round?.holes)) return 0
  return round.holes.filter((h) => typeof h.score === 'number').length
}

// True if the round is flagged incomplete, or (defensively) if it's missing a
// score on any of its holes — so old/hand-edited data can't slip through.
export function isIncomplete(round) {
  if (round?.incomplete === true) return true
  if (!Array.isArray(round?.holes)) return true
  return round.holes.some((h) => typeof h.score !== 'number')
}

// True if the round was played in scramble format (flagged `scramble: true`
// on the round). Scrambles are excluded from the handicap and achievements.
export function isScramble(round) {
  return round?.scramble === true
}

// True if the round was played on a par-3 / executive course (flagged
// `par3: true` in courses.js). Only preset courses carry the flag; custom
// rounds have no courseId, so they're never treated as par-3.
export function isParThreeCourse(round) {
  if (!round?.courseId) return false
  return getCourse(round.courseId)?.par3 === true
}

// Rounds that count toward stats (handicap, achievements): fully played,
// nothing missing, not on a par-3 course, and not a scramble.
export function isCountable(round) {
  return !isIncomplete(round) && !isParThreeCourse(round) && !isScramble(round)
}

// Whether a round's putts / GIR / OOB should feed the overall detailed stats.
// New rounds carry an explicit `trackStats` flag set from the form checkbox.
// Older rounds predate the flag, so we infer it: they're included only if they
// actually recorded some detailed data (otherwise every untracked hole would
// wrongly count as a missed green, zero putts, etc.).
export function tracksStats(round) {
  if (typeof round?.trackStats === 'boolean') return round.trackStats
  const holes = Array.isArray(round?.holes) ? round.holes : []
  return holes.some(
    (h) =>
      typeof h.putts === 'number' ||
      h.gir === true ||
      (typeof h.ob === 'number' && h.ob > 0)
  )
}
