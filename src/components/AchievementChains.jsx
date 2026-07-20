import { ACHIEVEMENTS, iconForAchievement } from '../data/achievements.js'

// Tiered achievements rendered as connected progressions instead of grids.
// Each chain's ids are ordered easiest → hardest. Shared by the Achievements
// page and a friend's stats page.
export const CHAINS = [
  {
    key: 'handicap',
    label: 'Handicap',
    ids: [
      'handicap-under-30',
      'handicap-under-25',
      'handicap-under-20',
      'handicap-under-15',
      'single-digit-handicap',
      'handicap-under-5',
      'scratch-handicap',
      'plus-handicap',
    ],
  },
  {
    key: 'breaking',
    label: 'Breaking Barriers',
    ids: [
      'break-100', 'break-95', 'break-90', 'break-85', 'break-80', 'break-75',
      'even-par-round', 'under-par-round',
    ],
  },
  {
    key: 'nine',
    label: 'Nine-Hole Scoring',
    ids: ['break-60-nine', 'break-50-nine', 'break-40-nine', 'par-nine', 'break-par-nine'],
  },
  {
    key: 'scramble',
    label: 'Scramble',
    ids: [
      'scramble-break-90',
      'scramble-break-80',
      'scramble-break-par',
      'scramble-break-60',
      'scramble-break-50',
    ],
  },
  {
    key: 'rounds',
    label: 'Rounds Logged',
    ids: [
      'rounds-10', 'rounds-25', 'rounds-50', 'rounds-75', 'rounds-100', 'rounds-125',
      'rounds-150', 'rounds-175', 'rounds-200', 'rounds-225', 'rounds-250',
    ],
  },
  {
    key: 'courses',
    label: 'Courses Played',
    ids: [
      'courses-3', 'courses-5', 'courses-10', 'courses-15', 'courses-20', 'courses-25',
      'courses-30', 'courses-35', 'courses-40', 'courses-45', 'courses-50',
    ],
  },
]

// Ids shown in a chain — excluded from the normal category grids.
export const CHAINED_IDS = new Set(CHAINS.flatMap((c) => c.ids))

const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))

// Renders every chain in a 2-column grid. `earnedSet` is a Set of earned ids
// (works for the signed-in user or a friend — it's read-only either way).
export default function AchievementChains({ earnedSet }) {
  return (
    <div className="grid cols-2" style={{ margin: '8px 0 40px', gap: '40px 20px', alignItems: 'start' }}>
      {CHAINS.map((chain) => {
        const nodes = chain.ids.map((id) => byId.get(id)).filter(Boolean)
        if (nodes.length === 0) return null
        return <Chain key={chain.key} label={chain.label} nodes={nodes} earnedSet={earnedSet} />
      })}
    </div>
  )
}

// A tiered progression: earned tiers, the one in progress, then locked tiers.
function Chain({ label, nodes, earnedSet }) {
  const currentIdx = nodes.findIndex((a) => !earnedSet.has(a.id))
  const done = nodes.filter((a) => earnedSet.has(a.id)).length

  return (
    <section>
      <h2 style={{ margin: '0 0 10px' }}>
        {label} <span className="count-tag muted">{done}/{nodes.length}</span>
      </h2>
      <div className="chain">
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
                  {state === 'done' ? '✓ Earned' : state === 'current' ? 'In Progress' : 'Locked'}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
