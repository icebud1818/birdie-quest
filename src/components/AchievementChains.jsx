import { ACHIEVEMENTS, iconForAchievement } from '../data/achievements.js'
import { isCountable, isScramble, isParThreeCourse } from '../utils/rounds.js'
import { calculateHandicap, formatHandicap } from '../utils/handicap.js'
import CollapsibleSection from './CollapsibleSection.jsx'

// ---- Helpers for the "current stat" shown on the in-progress tier ----
const holesOf = (r) => (Array.isArray(r.holes) ? r.holes : [])
const isFull18 = (r) => holesOf(r).length === 18 && holesOf(r).every((h) => typeof h.score === 'number')
const isParHole = (h) => typeof h.score === 'number' && typeof h.par === 'number' && h.score === h.par
const isBirdieHole = (h) => typeof h.score === 'number' && typeof h.par === 'number' && h.score === h.par - 1

function nineSum(round, start) {
  const hs = holesOf(round)
  if (hs.length < start + 9) return null
  const slice = hs.slice(start, start + 9)
  if (!slice.every((h) => typeof h.score === 'number')) return null
  return slice.reduce((s, h) => s + h.score, 0)
}

function bestNine(rounds) {
  let best = null
  for (const r of rounds.filter(isCountable)) {
    for (const start of [0, 9]) {
      const v = nineSum(r, start)
      if (v != null && (best == null || v < best)) best = v
    }
  }
  return best
}

function maxInRound(rounds, perRound) {
  let best = null
  for (const r of rounds.filter(isCountable)) {
    const v = perRound(r)
    if (v > 0 && (best == null || v > best)) best = v
  }
  return best
}

function distinctCourses(rounds) {
  const keys = new Set()
  for (const r of rounds) {
    const key = r.courseId ? `id:${r.courseId}` : r.courseName ? `name:${r.courseName}` : null
    if (key) keys.add(key)
  }
  return keys.size
}

// Tiered achievements rendered as connected progressions. Each chain's ids are
// ordered easiest → hardest; `stat(rounds)` returns the golfer's current
// standing on that metric, shown on the in-progress tier (null → omitted).
export const CHAINS = [
  {
    key: 'handicap',
    label: 'Handicap',
    ids: [
      'handicap-under-30', 'handicap-under-25', 'handicap-under-20', 'handicap-under-15',
      'single-digit-handicap', 'handicap-under-5', 'scratch-handicap', 'plus-handicap',
    ],
    stat: (rounds) => {
      const h = calculateHandicap(rounds)
      return h == null ? null : `Handicap: ${formatHandicap(h)}`
    },
  },
  {
    key: 'breaking',
    label: 'Breaking Barriers',
    ids: [
      'break-100', 'break-95', 'break-90', 'break-85', 'break-80', 'break-75',
      'even-par-round', 'under-par-round',
    ],
    stat: (rounds) => {
      const scores = rounds.filter((r) => isCountable(r) && isFull18(r)).map((r) => r.totalScore)
      return scores.length ? `Best round: ${Math.min(...scores)}` : null
    },
  },
  {
    key: 'nine',
    label: 'Nine-Hole Scoring',
    ids: ['break-60-nine', 'break-50-nine', 'break-40-nine', 'par-nine', 'break-par-nine'],
    stat: (rounds) => {
      const b = bestNine(rounds)
      return b == null ? null : `Best nine: ${b}`
    },
  },
  {
    key: 'scramble',
    label: 'Scramble',
    ids: [
      'scramble-break-90', 'scramble-break-80', 'scramble-break-par',
      'scramble-break-60', 'scramble-break-50',
    ],
    stat: (rounds) => {
      const scores = rounds.filter((r) => isScramble(r) && isFull18(r)).map((r) => r.totalScore)
      return scores.length ? `Best scramble: ${Math.min(...scores)}` : null
    },
  },
  {
    key: 'rounds',
    label: 'Rounds Logged',
    ids: [
      'rounds-10', 'rounds-25', 'rounds-50', 'rounds-75', 'rounds-100', 'rounds-125',
      'rounds-150', 'rounds-175', 'rounds-200', 'rounds-225', 'rounds-250',
    ],
    stat: (rounds) => `Logged: ${rounds.length}`,
  },
  {
    key: 'courses',
    label: 'Courses Played',
    ids: [
      'courses-3', 'courses-5', 'courses-10', 'courses-15', 'courses-20', 'courses-25',
      'courses-30', 'courses-35', 'courses-40', 'courses-45', 'courses-50',
    ],
    stat: (rounds) => `Played: ${distinctCourses(rounds)}`,
  },
  {
    key: 'gir',
    label: 'Greens in Regulation',
    ids: ['gir-3', 'gir-6', 'gir-9', 'gir-12', 'gir-15', 'all-gir'],
    stat: (rounds) => {
      const b = maxInRound(rounds, (r) => holesOf(r).filter((h) => h.gir === true).length)
      return b == null ? null : `Best: ${b} in a round`
    },
  },
  {
    key: 'putting',
    label: 'Putting',
    ids: ['putts-45', 'putts-42', 'putts-39', 'putts-36', 'putts-33', 'putts-30'],
    stat: (rounds) => {
      let best = null
      for (const r of rounds.filter(isCountable)) {
        const hs = holesOf(r)
        if (hs.length === 18 && hs.every((h) => typeof h.putts === 'number')) {
          const total = hs.reduce((s, h) => s + h.putts, 0)
          if (best == null || total < best) best = total
        }
      }
      return best == null ? null : `Fewest: ${best} putts`
    },
  },
  {
    key: 'pars',
    label: 'Pars',
    ids: ['pars-3', 'pars-6', 'wall-of-pars', 'pars-12', 'pars-15', 'pars-18'],
    stat: (rounds) => {
      const b = maxInRound(rounds, (r) => holesOf(r).filter(isParHole).length)
      return b == null ? null : `Best: ${b} in a round`
    },
  },
  {
    key: 'birdies',
    label: 'Birdies',
    ids: ['birdies-1', 'birdies-2', 'birdie-barrage', 'birdies-4', 'birdies-5', 'birdies-6'],
    stat: (rounds) => {
      const b = maxInRound(rounds, (r) => holesOf(r).filter(isBirdieHole).length)
      return b == null ? null : `Best: ${b} in a round`
    },
  },
]

export const CHAINED_IDS = new Set(CHAINS.flatMap((c) => c.ids))

const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))

// `stacked` renders one full-width chain per row, each collapsible and scaled up
// on desktop (the Achievements page). Left off, chains keep the compact two-up
// grid with plain headings, which is what Friend Stats uses.
export default function AchievementChains({ earnedSet, rounds = [], stacked = false }) {
  return (
    <div
      className={stacked ? 'chains-stacked' : 'grid cols-2'}
      style={
        stacked
          ? { margin: '8px 0 0' }
          : { margin: '8px 0 40px', gap: '40px 20px', alignItems: 'start' }
      }
    >
      {CHAINS.map((chain) => {
        const nodes = chain.ids.map((id) => byId.get(id)).filter(Boolean)
        if (nodes.length === 0) return null
        return (
          <Chain
            key={chain.key}
            label={chain.label}
            nodes={nodes}
            earnedSet={earnedSet}
            stat={chain.stat}
            rounds={rounds}
            collapsible={stacked}
          />
        )
      })}
    </div>
  )
}

function Chain({ label, nodes, earnedSet, stat, rounds, collapsible }) {
  const currentIdx = nodes.findIndex((a) => !earnedSet.has(a.id))
  const done = nodes.filter((a) => earnedSet.has(a.id)).length
  const statText = currentIdx !== -1 && stat ? stat(rounds) : null

  const body = (
    <div className="chain" style={{ marginTop: collapsible ? 10 : 0 }}>
        {nodes.map((a, i) => {
          const earned = earnedSet.has(a.id)
          const state = earned ? 'done' : i === currentIdx ? 'current' : 'locked'
          return (
            <div className={`chain-node ${state}`} key={a.id}>
              <div className="chain-marker">
                <div className="chain-badge">{state === 'locked' ? '🔒' : iconForAchievement(a)}</div>
              </div>
              <div className="chain-body">
                <div className="title">{a.name}</div>
                <div className="desc">{a.description}</div>
                <div className="chain-status">
                  {state === 'done'
                    ? '✓ Earned'
                    : state === 'current'
                      ? statText
                        ? `In Progress · ${statText}`
                        : 'In Progress'
                      : 'Locked'}
                </div>
              </div>
            </div>
          )
        })}
    </div>
  )

  if (!collapsible) {
    return (
      <section>
        <h2 style={{ margin: '0 0 10px' }}>
          {label} <span className="count-tag muted">{done}/{nodes.length}</span>
        </h2>
        {body}
      </section>
    )
  }
  return (
    <CollapsibleSection title={label} count={`${done}/${nodes.length}`}>
      {body}
    </CollapsibleSection>
  )
}
