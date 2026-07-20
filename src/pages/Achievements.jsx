import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES, categoryOf, iconForAchievement } from '../data/achievements.js'
import { useData } from '../data/DataContext.jsx'

// Tiered achievements rendered as a connected progression instead of a grid.
// Each chain's ids are ordered easiest → hardest.
const CHAINS = [
  {
    key: 'handicap',
    label: 'Handicap',
    catId: 'handicap',
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
    catId: 'scoring',
    ids: ['break-100', 'break-90', 'break-80'],
  },
]

export default function Achievements() {
  const { earnedIds, setManualAchievement, loading } = useData()

  if (loading) return <div className="container center muted">Loading…</div>

  const earnedSet = new Set(earnedIds)
  const earnedCount = ACHIEVEMENTS.filter((a) => earnedSet.has(a.id)).length

  const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))
  const chainedIds = new Set(CHAINS.flatMap((c) => c.ids))

  // Bucket achievements by category, preserving declaration order within each.
  // Chained achievements are shown in their chain, not the category grid.
  const byCategory = new Map(ACHIEVEMENT_CATEGORIES.map((c) => [c.id, []]))
  for (const a of ACHIEVEMENTS) {
    if (chainedIds.has(a.id)) continue
    const cat = categoryOf(a)
    if (byCategory.has(cat)) byCategory.get(cat).push(a)
  }

  return (
    <div className="container">
      <h1>Achievements</h1>
      <div className="muted" style={{ marginBottom: 20 }}>
        {earnedCount} of {ACHIEVEMENTS.length} earned
      </div>

      <div className="grid cols-2" style={{ marginBottom: 28, alignItems: 'start' }}>
        {CHAINS.map((chain) => {
          const nodes = chain.ids.map((id) => byId.get(id)).filter(Boolean)
          if (nodes.length === 0) return null
          return (
            <AchievementChain
              key={chain.key}
              label={chain.label}
              nodes={nodes}
              earnedSet={earnedSet}
            />
          )
        })}
      </div>

      {ACHIEVEMENT_CATEGORIES.map((cat) => {
        const items = byCategory.get(cat.id)
        if (!items || items.length === 0) return null

        // Earned first, then locked; declaration order within each group.
        const sorted = [
          ...items.filter((a) => earnedSet.has(a.id)),
          ...items.filter((a) => !earnedSet.has(a.id)),
        ]
        const done = items.filter((a) => earnedSet.has(a.id)).length
        const isManual = cat.id === 'manual'

        return (
          <section key={cat.id} style={{ marginBottom: 28 }}>
            <div className="row" style={{ alignItems: 'baseline' }}>
              <h2 style={{ margin: '0 0 4px' }}>{cat.label}</h2>
              <div className="spacer" />
              <div className="muted">{done} / {items.length}</div>
            </div>
            {isManual && (
              <p className="muted" style={{ marginTop: 0 }}>
                Feats we can't spot from your scores — check them off as you pull them off.
              </p>
            )}
            <div className="grid cols-2">
              {sorted.map((a) => {
                const earned = earnedSet.has(a.id)
                if (isManual) {
                  return (
                    <label
                      className={`achievement ${earned ? 'earned' : 'locked'}`}
                      key={a.id}
                      style={{ cursor: 'pointer' }}
                    >
                      <div
                        className="badge"
                        style={earned ? {
                          background: `rgba(${cat.color},0.16)`,
                          border: `1px solid rgba(${cat.color},0.4)`,
                        } : undefined}
                      >
                        {iconForAchievement(a)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="title">{a.name}</div>
                        <div className="desc">{a.description}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={earned}
                        onChange={(e) => setManualAchievement(a.id, e.target.checked)}
                        style={{ width: 'auto', marginTop: 4 }}
                      />
                    </label>
                  )
                }
                return (
                  <div className={`achievement ${earned ? 'earned' : 'locked'}`} key={a.id}>
                    <div
                      className="badge"
                      style={earned ? {
                        background: `rgba(${cat.color},0.16)`,
                        border: `1px solid rgba(${cat.color},0.4)`,
                      } : undefined}
                    >
                      {iconForAchievement(a)}
                    </div>
                    <div>
                      <div className="title">{a.name}</div>
                      <div className="desc">{a.description}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

// A tiered achievement progression: earned tiers, the one you're working toward,
// then locked tiers, connected as a vertical chain.
function AchievementChain({ label, nodes, earnedSet }) {
  const currentIdx = nodes.findIndex((a) => !earnedSet.has(a.id))
  const done = nodes.filter((a) => earnedSet.has(a.id)).length

  return (
    <section>
      <div className="row" style={{ alignItems: 'baseline' }}>
        <h2 style={{ margin: '0 0 10px' }}>{label}</h2>
        <div className="spacer" />
        <div className="muted">{done} / {nodes.length}</div>
      </div>
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
                  {state === 'done' ? '✓ Earned' : state === 'current' ? 'Working toward' : 'Locked'}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
