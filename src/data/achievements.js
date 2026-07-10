// Add achievements here. Each has:
//   id: unique string (used as the Firestore doc id — don't change once earned)
//   name: display title
//   description: shown to the user
//   check(round, allRounds): returns true if this round earned it.
//     - round: the newly-submitted round { date, courseName, holes: [{ par, score, putts?, ob?, gir? }], totalScore, totalPar }
//     - allRounds: array of all previously-saved rounds (does NOT include the new one)

import { isCountable, isParThreeCourse, isScramble, tracksStats } from '../utils/rounds.js'
import { calculateHandicap } from '../utils/handicap.js'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Flagship names for round-count milestones; other tiers fall back to "N Rounds".
const ROUND_MILESTONE_NAMES = {
  10: 'Getting Hooked',
  25: 'Dedicated',
  50: 'Half Century',
  75: 'Seasoned',
  100: 'Centurion',
  125: 'Devoted',
  150: 'Die-Hard',
  175: 'Golf Junkie',
  200: 'Double Century',
  225: 'Living Legend',
  250: 'Ironman',
}

// Flagship names for course-variety milestones; others fall back to "N Courses".
const COURSE_MILESTONE_NAMES = {
  3: 'Getting Around',
  5: 'Explorer',
  10: 'Well Traveled',
  15: 'Wanderer',
  20: 'Voyager',
  25: 'Course Collector',
  30: 'Road Warrior',
  35: 'Frequent Flyer',
  40: 'Jetsetter',
  45: 'World Tour',
  50: 'Globetrotter',
}

export const ACHIEVEMENTS = [
  {
    id: 'first-round',
    name: 'First Round',
    description: 'Log your first round on scorePulse.',
    check: (round, allRounds) => allRounds.length === 0,
  },
  {
    id: 'break-100',
    name: 'Double Digits',
    description: 'Shoot under 100 on an 18-hole round.',
    check: (round) => round.holes.length === 18 && round.totalScore < 100,
  },
  {
    id: 'break-90',
    name: 'Breaking Through',
    description: 'Shoot under 90 on an 18-hole round.',
    check: (round) => round.holes.length === 18 && round.totalScore < 90,
  },
  {
    id: 'first-birdie',
    name: 'Bird Is The Word',
    description: 'Score a birdie — one under par on any hole.',
    check: (round) => round.holes.some((h) => h.score != null && h.score === h.par - 1),
  },

  // ---- Single-hole milestones ----
  {
    id: 'first-par',
    name: 'On the Board',
    description: 'Make a par on any hole.',
    check: (round) => round.holes.some((h) => h.score != null && h.par != null && h.score === h.par),
  },
  {
    id: 'first-eagle',
    name: 'Soaring High',
    description: 'Score an eagle — two under par on any hole.',
    check: (round) => round.holes.some((h) => h.score != null && h.par != null && h.score === h.par - 2),
  },
  {
    id: 'first-albatross',
    name: 'Rare Bird',
    description: 'Score an albatross — three under par on any hole.',
    check: (round) => round.holes.some((h) => h.score != null && h.par != null && h.score === h.par - 3),
  },
  {
    id: 'hole-in-one',
    name: 'Ace!',
    description: 'Ace any hole — one shot, one hole.',
    check: (round) => round.holes.some((h) => h.score === 1),
  },

  // ---- Round scoring ----
  {
    id: 'break-80',
    name: 'Club Champion',
    description: 'Shoot under 80 on an 18-hole round.',
    check: (round) => round.holes.length === 18 && round.totalScore < 80,
  },
  {
    id: 'even-par-round',
    name: 'Par Excellence',
    description: 'Shoot even par over an 18-hole round.',
    check: (round) => round.holes.length === 18 && round.totalScore === round.totalPar,
  },
  {
    id: 'under-par-round',
    name: 'Into The Red',
    description: 'Shoot under par over an 18-hole round.',
    check: (round) => round.holes.length === 18 && round.totalScore < round.totalPar,
  },

  // ---- Nine-hole scoring (front or back nine of any round) ----
  {
    id: 'break-60-nine',
    name: 'Getting Warmed Up',
    description: 'Score under 60 on a nine.',
    check: (round) => nines(round).some((n) => n.score < 60),
  },
  {
    id: 'break-50-nine',
    name: 'Heating Up',
    description: 'Score under 50 on a nine.',
    check: (round) => nines(round).some((n) => n.score < 50),
  },
  {
    id: 'break-40-nine',
    name: 'Dialed In',
    description: 'Score under 40 on a nine.',
    check: (round) => nines(round).some((n) => n.score < 40),
  },
  {
    id: 'break-par-nine',
    name: 'Red Hot',
    description: 'Shoot under par on a nine.',
    check: (round) => nines(round).some((n) => n.par > 0 && n.score < n.par),
  },

  // ---- Stat feats ----
  {
    id: 'up-and-down',
    name: 'One And Done',
    description: 'One-putt a hole.',
    check: (round) => round.holes.some((h) => h.putts === 1),
  },
  {
    id: 'no-three-putts',
    name: 'No Three-Putts',
    description: 'Play a round without more than two putts on any hole.',
    check: (round) =>
      round.holes.length > 0 &&
      round.holes.every((h) => typeof h.putts === 'number' && h.putts <= 2),
  },
  {
    id: 'all-gir',
    name: 'Perfect Greens',
    description: 'Hit every green in regulation in a round.',
    check: (round) => round.holes.length > 0 && round.holes.every((h) => h.gir === true),
  },
  {
    id: 'no-oob-round',
    name: 'Straight Shooter',
    description: 'Play a full 18-hole round without hitting out of bounds.',
    check: (round) =>
      round.holes.length === 18 &&
      tracksStats(round) &&
      round.holes.every((h) => !(typeof h.ob === 'number' && h.ob > 0)),
  },

  // ---- Streaks & counts within a round ----
  {
    id: 'birdie-barrage',
    name: 'Birdie Barrage',
    description: 'Make three birdies in a single round.',
    check: (round) => round.holes.filter(isBirdie).length >= 3,
  },
  {
    id: 'turkey',
    name: 'Turkey',
    description: 'Make three birdies in a row.',
    check: (round) => maxStreak(round, isBirdie) >= 3,
  },
  {
    id: 'par-train',
    name: 'Par Train',
    description: 'Make five pars in a row.',
    check: (round) => maxStreak(round, isPar) >= 5,
  },
  {
    id: 'wall-of-pars',
    name: 'Wall of Pars',
    description: 'Make nine pars in a single round.',
    check: (round) => round.holes.filter(isPar).length >= 9,
  },
  {
    id: 'fore-right',
    name: 'Fore Right!',
    description: 'Hit out of bounds on consecutive holes.',
    check: (round) => maxStreak(round, isOob) >= 2,
  },
  {
    id: 'tin-cup',
    name: 'Tin Cup',
    description: 'Hit out of bounds five times in a single round.',
    check: (round) =>
      round.holes.reduce((sum, h) => sum + (typeof h.ob === 'number' && h.ob > 0 ? h.ob : 0), 0) >= 5,
  },

  // ---- Handicap milestones (breaking thresholds toward scratch) ----
  ...[
    { n: 30, name: 'Getting Serious' },
    { n: 25, name: 'Finding Your Swing' },
    { n: 20, name: 'Weekend Warrior' },
    { n: 15, name: 'Club Contender' },
  ].map(({ n, name }) => ({
    id: `handicap-under-${n}`,
    name,
    description: `Reach a handicap below ${n}.`,
    check: (round, allRounds) => {
      const h = calculateHandicap([round, ...allRounds])
      return h != null && h < n
    },
  })),
  {
    id: 'single-digit-handicap',
    name: 'Single Digits',
    description: 'Reach a handicap below 10.',
    check: (round, allRounds) => {
      const h = calculateHandicap([round, ...allRounds])
      return h != null && h < 10
    },
  },
  {
    id: 'handicap-under-5',
    name: 'Elite Company',
    description: 'Reach a handicap below 5.',
    check: (round, allRounds) => {
      const h = calculateHandicap([round, ...allRounds])
      return h != null && h < 5
    },
  },
  {
    id: 'scratch-handicap',
    name: 'Scratch Golfer',
    description: 'Reach a handicap of 0 or better.',
    check: (round, allRounds) => {
      const h = calculateHandicap([round, ...allRounds])
      return h != null && h <= 0
    },
  },
  {
    id: 'plus-handicap',
    name: 'Tour Material',
    description: 'Reach a handicap better than scratch (below 0).',
    check: (round, allRounds) => {
      const h = calculateHandicap([round, ...allRounds])
      return h != null && h < 0
    },
  },

  // ---- Clean cards ----
  {
    id: 'par-nine',
    name: 'Nine at Par',
    description: 'Shoot even par on a nine.',
    check: (round) => nines(round).some((n) => n.par > 0 && n.score === n.par),
  },
  {
    id: 'bogey-or-better-all',
    name: 'No Doubles',
    description: 'Make bogey or better on every hole in a round.',
    check: (round) =>
      round.holes.length > 0 &&
      round.holes.every((h) => h.score != null && h.par != null && h.score <= h.par + 1),
  },
  {
    id: 'par-or-better-all',
    name: 'Bogey-Free Round',
    description: 'Make par or better on every hole in a round.',
    check: (round) =>
      round.holes.length > 0 &&
      round.holes.every((h) => h.score != null && h.par != null && h.score <= h.par),
  },
  {
    id: 'par-after-oob',
    name: 'Great Recovery',
    description: 'Make par or better on a hole after hitting out of bounds.',
    check: (round) =>
      round.holes.some(
        (h) => typeof h.ob === 'number' && h.ob > 0 && h.score != null && h.par != null && h.score <= h.par
      ),
  },

  // ---- Participation (count every round, even par-3 / scramble / partial) ----
  {
    id: 'play-par-3-course',
    name: 'Short Game',
    description: 'Play a round on a par-3 course.',
    countsAllRounds: true,
    check: (round) => isParThreeCourse(round),
  },
  {
    id: 'two-rounds-day',
    name: 'Double Header',
    description: 'Play two full 18-hole rounds in a single day.',
    countsAllRounds: true,
    check: (round, allRounds) =>
      isComplete18(round) &&
      allRounds.some((r) => r.date === round.date && isComplete18(r)),
  },
  {
    id: 'seven-rounds-week',
    name: 'Golf Bender',
    description: 'Play seven rounds within a seven-day span.',
    countsAllRounds: true,
    check: (round, allRounds) => {
      const cur = parseDay(round.date)
      if (cur == null) return false
      const inWindow = allRounds.filter((r) => {
        const d = parseDay(r.date)
        return d != null && d <= cur && d > cur - 7
      }).length
      return inWindow + 1 >= 7
    },
  },

  // ---- Rounds-played milestones (10, then every 25 up to 250) ----
  ...[10, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250].map((n) => ({
    id: `rounds-${n}`,
    name: ROUND_MILESTONE_NAMES[n] || `${n} Rounds`,
    description: `Log ${n} rounds.`,
    countsAllRounds: true,
    check: (round, allRounds) => allRounds.length + 1 >= n,
  })),

  // ---- Course-variety milestones (3, then every 5 up to 50) ----
  ...[3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map((n) => ({
    id: `courses-${n}`,
    name: COURSE_MILESTONE_NAMES[n] || `${n} Courses`,
    description: `Play ${n} different courses.`,
    countsAllRounds: true,
    check: (round, allRounds) => distinctCourses([round, ...allRounds]) >= n,
  })),

  // ---- Scramble scoring (these only count scramble rounds) ----
  ...[
    { id: 'scramble-break-90', name: 'Team Effort', target: 90 },
    { id: 'scramble-break-80', name: 'In Sync', target: 80 },
    { id: 'scramble-break-par', name: 'Dream Team', target: 'par' },
    { id: 'scramble-break-60', name: 'Well-Oiled Machine', target: 60 },
    { id: 'scramble-break-50', name: 'Unbeatable', target: 50 },
  ].map(({ id, name, target }) => ({
    id,
    name,
    description:
      target === 'par'
        ? 'Shoot under par in an 18-hole scramble.'
        : `Shoot under ${target} in an 18-hole scramble.`,
    countsAllRounds: true,
    check: (round) => {
      if (!isScramble(round) || !isComplete18(round)) return false
      return target === 'par' ? round.totalScore < round.totalPar : round.totalScore < target
    },
  })),

  // ---- Seasons ----
  {
    id: 'play-spring',
    name: 'Spring Swing',
    description: 'Log a round in spring (Mar–May).',
    countsAllRounds: true,
    check: (round) => seasonOf(round.date) === 'spring',
  },
  {
    id: 'play-summer',
    name: 'Summer Rounds',
    description: 'Log a round in summer (Jun–Aug).',
    countsAllRounds: true,
    check: (round) => seasonOf(round.date) === 'summer',
  },
  {
    id: 'play-fall',
    name: 'Fall Play',
    description: 'Log a round in fall (Sep–Nov).',
    countsAllRounds: true,
    check: (round) => seasonOf(round.date) === 'fall',
  },
  {
    id: 'play-winter',
    name: 'Winter Warrior',
    description: 'Log a round in winter (Dec–Feb).',
    countsAllRounds: true,
    check: (round) => seasonOf(round.date) === 'winter',
  },
  {
    id: 'all-seasons',
    name: 'Four Seasons',
    description: 'Log a round in all four seasons.',
    countsAllRounds: true,
    check: (round, allRounds) => {
      const seasons = new Set([round, ...allRounds].map((r) => seasonOf(r.date)).filter(Boolean))
      return seasons.size === 4
    },
  },

  // ---- Months: one per month, plus a "played every month" capstone ----
  ...MONTH_NAMES.map((name, i) => ({
    id: `play-month-${i + 1}`,
    name: `Played in ${name}`,
    description: `Log a round in ${name}.`,
    countsAllRounds: true,
    check: (round) => monthOf(round.date) === i + 1,
  })),
  {
    id: 'all-months',
    name: 'Year-Rounder',
    description: 'Log a round in all twelve months.',
    countsAllRounds: true,
    check: (round, allRounds) => {
      const months = new Set([round, ...allRounds].map((r) => monthOf(r.date)).filter(Boolean))
      return months.size === 12
    },
  },

  // ---- Manual feats (no data to detect — the user checks these off) ----
  {
    id: 'chip-in',
    name: 'Chip-In',
    description: 'Hole a chip from off the green.',
    manual: true,
  },
  {
    id: 'sand-save',
    name: 'Sand Save',
    description: 'Get up and down from a greenside bunker.',
    manual: true,
  },
  {
    id: 'bunker-hole-out',
    name: 'Bunker Hole-Out',
    description: 'Hole out directly from a bunker.',
    manual: true,
  },
  {
    id: 'almost-ace',
    name: 'Almost Ace',
    description: 'Land your tee shot within a foot of the hole.',
    manual: true,
  },
  {
    id: 'water-skipper',
    name: 'Water Skipper',
    description: 'Skip a ball across the water and keep it in play.',
    manual: true,
  },
  {
    id: 'drive-the-green',
    name: 'Driving the Green',
    description: 'Drive the green on a par 4 or 5.',
    manual: true,
  },
  {
    id: 'long-drive-300',
    name: '300 Club',
    description: 'Hit a drive 300+ yards.',
    manual: true,
  },
  {
    id: 'rain-round',
    name: 'Rain or Shine',
    description: 'Play in the rain.',
    manual: true,
  },
  {
    id: 'dawn-patrol',
    name: 'Dawn Patrol',
    description: 'Tee off before 7 a.m.',
    manual: true,
  },
  {
    id: 'walking-round',
    name: 'On Foot',
    description: 'Play a full round walking — no cart.',
    manual: true,
  },
  {
    id: 'abroad-round',
    name: 'Passport Stamp',
    description: 'Play a round in another country.',
    manual: true,
  },
]

// Achievement categories, in display order. Every achievement maps to exactly
// one of these via categoryOf(). `manual` is last so the "log it yourself"
// feats sit at the bottom of the page.
export const ACHIEVEMENT_CATEGORIES = [
  { id: 'getting-started', label: 'Getting Started', color: '74,222,128' },
  { id: 'scoring', label: 'Scoring', color: '56,189,248' },
  { id: 'hole-feats', label: 'Hole Feats', color: '250,204,21' },
  { id: 'streaks', label: 'Streaks & Runs', color: '251,146,60' },
  { id: 'consistency', label: 'Consistency', color: '45,212,191' },
  { id: 'handicap', label: 'Handicap', color: '167,139,250' },
  { id: 'milestones', label: 'Milestones', color: '251,191,36' },
  { id: 'variety', label: 'Variety', color: '244,114,182' },
  { id: 'scramble', label: 'Scramble', color: '129,140,248' },
  { id: 'seasons', label: 'Seasons', color: '52,211,153' },
  { id: 'months', label: 'Months', color: '96,165,250' },
  { id: 'manual', label: 'Log It Yourself', color: '148,163,184' },
]

// Category color lookup (r,g,b string) for tinting badges, etc.
export function categoryColor(catId) {
  const c = ACHIEVEMENT_CATEGORIES.find((x) => x.id === catId)
  return c ? c.color : '148,163,184'
}

const HOLE_FEAT_IDS = new Set(['first-par', 'first-birdie', 'first-eagle', 'first-albatross', 'hole-in-one'])
const STREAK_IDS = new Set(['birdie-barrage', 'turkey', 'par-train', 'wall-of-pars', 'fore-right', 'tin-cup'])
const CONSISTENCY_IDS = new Set([
  'up-and-down', 'no-three-putts', 'all-gir', 'no-oob-round',
  'bogey-or-better-all', 'par-or-better-all', 'par-after-oob',
])
const SCORING_IDS = new Set([
  'break-100', 'break-90', 'break-80', 'even-par-round', 'under-par-round',
  'break-60-nine', 'break-50-nine', 'break-40-nine', 'break-par-nine', 'par-nine',
])
const VARIETY_IDS = new Set(['play-par-3-course', 'two-rounds-day', 'seven-rounds-week'])
const SEASON_IDS = new Set(['play-spring', 'play-summer', 'play-fall', 'play-winter', 'all-seasons'])
const HANDICAP_IDS = new Set(['single-digit-handicap', 'scratch-handicap', 'plus-handicap'])

// Which category an achievement belongs to (see ACHIEVEMENT_CATEGORIES).
export function categoryOf(ach) {
  if (ach.manual) return 'manual'
  const id = ach.id
  if (id === 'first-round') return 'getting-started'
  if (HOLE_FEAT_IDS.has(id)) return 'hole-feats'
  if (STREAK_IDS.has(id)) return 'streaks'
  if (CONSISTENCY_IDS.has(id)) return 'consistency'
  if (SCORING_IDS.has(id)) return 'scoring'
  if (VARIETY_IDS.has(id)) return 'variety'
  if (SEASON_IDS.has(id)) return 'seasons'
  if (id === 'all-months' || id.startsWith('play-month-')) return 'months'
  if (id.startsWith('scramble-')) return 'scramble'
  if (id.startsWith('rounds-') || id.startsWith('courses-')) return 'milestones'
  if (HANDICAP_IDS.has(id) || id.startsWith('handicap-under-')) return 'handicap'
  return 'scoring'
}

// Emoji badge per achievement. Anything not listed falls back to a per-pattern
// or per-category default in iconForAchievement().
const ACHIEVEMENT_EMOJI = {
  'first-round': '🏌️',

  // Scoring (18-hole + nine)
  'break-100': '💯',
  'break-90': '🎯',
  'break-80': '🥇',
  'even-par-round': '⚖️',
  'under-par-round': '🔴',
  'break-60-nine': '🌡️',
  'break-50-nine': '♨️',
  'break-40-nine': '🌶️',
  'break-par-nine': '🔥',
  'par-nine': '9️⃣',

  // Hole feats
  'first-par': '👍',
  'first-birdie': '🐦',
  'first-eagle': '🦅',
  'first-albatross': '🕊️',
  'hole-in-one': '🕳️',

  // Streaks & runs
  'birdie-barrage': '🐦',
  'turkey': '🦃',
  'par-train': '🚂',
  'wall-of-pars': '🧱',
  'fore-right': '⛔',
  'tin-cup': '🥫',

  // Consistency
  'up-and-down': '👌',
  'no-three-putts': '🟢',
  'all-gir': '🟩',
  'no-oob-round': '➡️',
  'bogey-or-better-all': '🚫',
  'par-or-better-all': '✨',
  'par-after-oob': '💪',

  // Handicap
  'handicap-under-30': '📉',
  'handicap-under-25': '🏌️',
  'handicap-under-20': '⚔️',
  'handicap-under-15': '🥊',
  'single-digit-handicap': '🔟',
  'handicap-under-5': '💎',
  'scratch-handicap': '0️⃣',
  'plus-handicap': '🌟',

  // Variety
  'play-par-3-course': '⛳',
  'two-rounds-day': '🔁',
  'seven-rounds-week': '🥴',

  // Seasons
  'play-spring': '🌸',
  'play-summer': '☀️',
  'play-fall': '🍂',
  'play-winter': '❄️',
  'all-seasons': '🌍',

  // Months
  'play-month-1': '⛄',
  'play-month-2': '💝',
  'play-month-3': '🌱',
  'play-month-4': '🌧️',
  'play-month-5': '🌷',
  'play-month-6': '😎',
  'play-month-7': '🎆',
  'play-month-8': '🏖️',
  'play-month-9': '🍁',
  'play-month-10': '🎃',
  'play-month-11': '🍽️',
  'play-month-12': '🎄',
  'all-months': '📅',

  // Manual
  'chip-in': '🥏',
  'sand-save': '🏖️',
  'bunker-hole-out': '💥',
  'almost-ace': '😬',
  'water-skipper': '🌊',
  'drive-the-green': '🟩',
  'long-drive-300': '🚀',
  'rain-round': '🌧️',
  'dawn-patrol': '🌅',
  'walking-round': '🚶',
  'abroad-round': '✈️',
}

const CATEGORY_EMOJI = {
  'getting-started': '🏌️',
  'scoring': '⛳',
  'hole-feats': '⛳',
  'streaks': '🔥',
  'consistency': '✅',
  'handicap': '📉',
  'milestones': '🏆',
  'variety': '🎲',
  'scramble': '🤝',
  'seasons': '📅',
  'months': '📅',
  'manual': '📝',
}

// The emoji badge for an achievement: explicit map first, then patterns for the
// generated tiers, then the category default.
export function iconForAchievement(ach) {
  const id = ach.id
  if (ACHIEVEMENT_EMOJI[id]) return ACHIEVEMENT_EMOJI[id]
  if (id.startsWith('rounds-')) return '🏌️'
  if (id.startsWith('courses-')) return '🗺️'
  if (id.startsWith('scramble-')) return '🤝'
  return CATEGORY_EMOJI[categoryOf(ach)] || '⛳'
}

// Per-hole predicates for streak/count achievements.
const isBirdie = (h) => h.score != null && h.par != null && h.score === h.par - 1
const isPar = (h) => h.score != null && h.par != null && h.score === h.par
const isOob = (h) => typeof h.ob === 'number' && h.ob > 0

// Longest run of consecutive holes satisfying `pred`, in hole order.
function maxStreak(round, pred) {
  const holes = Array.isArray(round.holes) ? round.holes : []
  let best = 0
  let cur = 0
  for (const h of holes) {
    if (pred(h)) {
      cur += 1
      if (cur > best) best = cur
    } else {
      cur = 0
    }
  }
  return best
}

// The complete nines within a round (front and/or back), each summed to
// { score, par }. An 18-hole round yields two; a 9-hole round yields one.
// Only fully-scored nines are returned. Achievements only ever see countable
// (complete) rounds, so in practice every nine here is fully played.
function nines(round) {
  const holes = Array.isArray(round.holes) ? round.holes : []
  const out = []
  for (let start = 0; start + 9 <= holes.length; start += 9) {
    const slice = holes.slice(start, start + 9)
    if (!slice.every((h) => typeof h.score === 'number')) continue
    out.push({
      score: slice.reduce((s, h) => s + h.score, 0),
      par: slice.reduce((s, h) => s + (typeof h.par === 'number' ? h.par : 0), 0),
    })
  }
  return out
}

// Distinct courses across a set of rounds — presets keyed by courseId, custom
// courses by name (matching how Best Scores groups them).
function distinctCourses(rounds) {
  const keys = new Set()
  for (const r of rounds) {
    const key = r.courseId ? `id:${r.courseId}` : r.courseName ? `name:${r.courseName}` : null
    if (key) keys.add(key)
  }
  return keys.size
}

// A round is a complete 18 when all 18 hole slots carry a numeric score.
function isComplete18(round) {
  const hs = Array.isArray(round.holes) ? round.holes : []
  return hs.length === 18 && hs.every((h) => typeof h.score === 'number')
}

// Month (1–12) of an ISO 'YYYY-MM-DD' date, or null if unparseable.
function monthOf(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null
  const m = Number(dateStr.slice(5, 7))
  return m >= 1 && m <= 12 ? m : null
}

// Meteorological season of an ISO date (northern hemisphere), or null.
function seasonOf(dateStr) {
  const m = monthOf(dateStr)
  if (!m) return null
  if (m === 12 || m <= 2) return 'winter'
  if (m <= 5) return 'spring'
  if (m <= 8) return 'summer'
  return 'fall'
}

// Whole-day number for an ISO date (days since epoch), for windowed counts.
function parseDay(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null
  const t = new Date(`${dateStr}T00:00:00`).getTime()
  return Number.isFinite(t) ? Math.floor(t / 86400000) : null
}

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
  const earned = new Set()

  // Two replays, both chronological so order-dependent checks resolve exactly
  // as they did when rounds were submitted:
  //   1. Performance achievements see only *countable* rounds — complete,
  //      non-scramble, non-par-3 — so incomplete/scramble/par-3 rounds can't
  //      earn a birdie/handicap/etc. or advance "first round".
  //   2. Participation achievements (flagged `countsAllRounds`) see *every*
  //      round — being on the course still counts even if it was a par-3
  //      layout, a scramble, or a partial round.
  replay(
    allRounds.filter(isCountable),
    ACHIEVEMENTS.filter((a) => !a.manual && !a.countsAllRounds),
    earned
  )
  replay(
    allRounds,
    ACHIEVEMENTS.filter((a) => !a.manual && a.countsAllRounds),
    earned
  )

  return earned
}

// Achievements the app can't detect from round data — the user marks these
// done themselves (see Achievements page). They have no `check`.
export const MANUAL_ACHIEVEMENT_IDS = new Set(
  ACHIEVEMENTS.filter((a) => a.manual).map((a) => a.id)
)

// Replay `rounds` chronologically, adding any `achievements` whose check passes
// to the shared `earned` set. `prior` grows as we go so order-dependent checks
// only see rounds that came before.
function replay(rounds, achievements, earned) {
  const prior = []
  for (const round of [...rounds].sort(byChronology)) {
    for (const ach of achievements) {
      if (earned.has(ach.id)) continue
      try {
        if (ach.check(round, prior)) earned.add(ach.id)
      } catch (e) {
        console.warn(`Achievement "${ach.id}" check threw:`, e)
      }
    }
    prior.push(round)
  }
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
