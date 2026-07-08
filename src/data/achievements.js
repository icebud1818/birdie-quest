// Add achievements here. Each has:
//   id: unique string (used as the Firestore doc id — don't change once earned)
//   name: display title
//   description: shown to the user
//   check(round, allRounds): returns true if this round earned it.
//     - round: the newly-submitted round { date, courseName, holes: [{ par, score, putts?, ob?, gir? }], totalScore, totalPar }
//     - allRounds: array of all previously-saved rounds (does NOT include the new one)

import { isCountable } from '../utils/rounds.js'

export const ACHIEVEMENTS = [
  {
    id: 'first-round',
    name: 'First Round',
    description: 'Log your first round on scorePulse.',
    check: (round, allRounds) => allRounds.length === 0,
  },
  {
    id: 'break-100',
    name: 'Breaking 100',
    description: 'Shoot under 100 on an 18-hole round.',
    check: (round) => round.holes.length === 18 && round.totalScore < 100,
  },
  {
    id: 'break-90',
    name: 'Breaking 90',
    description: 'Shoot under 90 on an 18-hole round.',
    check: (round) => round.holes.length === 18 && round.totalScore < 90,
  },
  {
    id: 'first-birdie',
    name: 'First Birdie',
    description: 'Score one under par on any hole.',
    check: (round) => round.holes.some((h) => h.score != null && h.score === h.par - 1),
  },
  // Add more here — see README for examples.
]

export function evaluateAchievements(round, allRounds, alreadyEarnedIds) {
  const newlyEarned = []
  for (const ach of ACHIEVEMENTS) {
    if (alreadyEarnedIds.includes(ach.id)) continue
    try {
      if (ach.check(round, allRounds)) newlyEarned.push(ach)
    } catch (e) {
      console.warn(`Achievement "${ach.id}" check threw:`, e)
    }
  }
  return newlyEarned
}

// Recompute the full set of earned achievements from scratch, given the
// complete set of rounds. Rounds are replayed in chronological order so that
// order-dependent checks (e.g. "first round", which tests allRounds.length)
// resolve exactly as they did when rounds were originally submitted.
//
// Because this derives the earned set purely from the current rounds, it is
// the source of truth after any add/edit/delete: an achievement that no
// longer applies to any round simply won't be in the returned set.
export function computeEarnedAchievements(allRounds) {
  // Incomplete, par-3, and scramble rounds don't count toward achievements —
  // and they're excluded from the replay entirely (via isCountable), so they
  // also don't advance order-dependent checks like "first round".
  const sorted = allRounds.filter(isCountable).sort(byChronology)
  const earned = new Set()
  const prior = []
  for (const round of sorted) {
    for (const ach of ACHIEVEMENTS) {
      if (earned.has(ach.id)) continue
      try {
        if (ach.check(round, prior)) earned.add(ach.id)
      } catch (e) {
        console.warn(`Achievement "${ach.id}" check threw:`, e)
      }
    }
    prior.push(round)
  }
  return earned
}

function byChronology(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  return tsMillis(a.createdAt) - tsMillis(b.createdAt)
}

function tsMillis(ts) {
  if (!ts) return 0
  if (typeof ts.toMillis === 'function') return ts.toMillis()
  if (typeof ts.seconds === 'number') return ts.seconds * 1000
  return 0
}
