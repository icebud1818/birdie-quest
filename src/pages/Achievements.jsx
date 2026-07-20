import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES, categoryOf, iconForAchievement } from '../data/achievements.js'
import { useData } from '../data/DataContext.jsx'
import AchievementChains, { CHAINED_IDS } from '../components/AchievementChains.jsx'

export default function Achievements() {
  const { earnedIds, setManualAchievement, loading } = useData()

  if (loading) return <div className="container center muted">Loading…</div>

  const earnedSet = new Set(earnedIds)
  const earnedCount = ACHIEVEMENTS.filter((a) => earnedSet.has(a.id)).length

  // Bucket achievements by category, preserving declaration order within each.
  // Chained achievements are shown in their chain, not the category grid.
  const byCategory = new Map(ACHIEVEMENT_CATEGORIES.map((c) => [c.id, []]))
  for (const a of ACHIEVEMENTS) {
    if (CHAINED_IDS.has(a.id)) continue
    const cat = categoryOf(a)
    if (byCategory.has(cat)) byCategory.get(cat).push(a)
  }

  return (
    <div className="container">
      <h1>Achievements</h1>
      <div className="muted" style={{ marginBottom: 20 }}>
        {earnedCount} of {ACHIEVEMENTS.length} earned
      </div>

      <AchievementChains earnedSet={earnedSet} />

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
            <h2 style={{ margin: '0 0 4px' }}>
              {cat.label} <span className="count-tag muted">{done}/{items.length}</span>
            </h2>
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
