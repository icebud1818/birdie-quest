import { Link, useNavigate, useParams } from 'react-router-dom'
import { useData } from '../data/DataContext.jsx'
import { holesPlayed, isIncomplete, isParThreeCourse, isScramble, scoreColor } from '../utils/rounds.js'

export default function RoundDetail() {
  const { id } = useParams()
  const { rounds, removeRound, loading } = useData()
  const nav = useNavigate()

  if (loading) return <div className="container center muted">Loading…</div>

  const round = rounds.find((r) => r.id === id)
  if (!round) {
    return (
      <div className="container">
        <p className="muted">Round not found.</p>
        <Link to="/rounds">← Back to rounds</Link>
      </div>
    )
  }

  const onDelete = async () => {
    if (!confirm('Delete this round? This cannot be undone.')) return
    await removeRound(round.id)
    nav('/rounds')
  }

  const diff = round.totalScore - round.totalPar
  const incomplete = isIncomplete(round)
  const played = holesPlayed(round)
  const breakdown = scoreBreakdown(round)
  const maxCount = Math.max(1, ...breakdown.map((c) => c.count))

  return (
    <div className="container">
      <div className="row">
        <Link to="/rounds">← All rounds</Link>
        <div className="spacer" />
        <Link to={`/rounds/${round.id}/edit`}><button>Edit</button></Link>
        <button className="danger" onClick={onDelete}>Delete</button>
      </div>

      <h1>
        {round.courseName}
        {isParThreeCourse(round) && <span className="tag" style={{ marginLeft: 10 }}>Par 3</span>}
        {incomplete && <span className="tag incomplete" style={{ marginLeft: 10 }}>Incomplete</span>}
        {isScramble(round) && <span className="tag scramble" style={{ marginLeft: 10 }}>Scramble</span>}
      </h1>
      <div className="muted" style={{ marginBottom: 20 }}>
        {round.date}
        {round.tee?.name && ` · ${round.tee.name} tees`}
        {round.tee?.rating != null && round.tee?.slope != null &&
          ` (${round.tee.rating} / ${round.tee.slope})`}
        {incomplete && ` · ${played} of ${round.holes.length} holes played`}
      </div>

      <div className="grid cols-3">
        <div className="card">
          <div className="muted">Strokes</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{round.totalScore}</div>
        </div>
        <div className="card">
          <div className="muted">Par</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{round.totalPar}</div>
        </div>
        <div className="card">
          <div className="muted">Score</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>
            {diff > 0 ? `+${diff}` : diff === 0 ? 'E' : diff}
          </div>
        </div>
      </div>

      {round.notes && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="muted" style={{ marginBottom: 6 }}>Notes</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{round.notes}</div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <table className="holes-table">
          <thead>
            <tr>
              <th>Hole</th>
              <th>Par</th>
              <th>Strokes</th>
              <th>Score</th>
              <th>Putts</th>
              <th>OB</th>
              <th>GIR</th>
            </tr>
          </thead>
          <tbody>
            {round.holes.map((h, i) => {
              const scored = typeof h.score === 'number' && typeof h.par === 'number'
              const d = scored ? h.score - h.par : null
              return (
                <tr key={i} style={scored ? undefined : { opacity: 0.5 }}>
                  <td>{i + 1}</td>
                  <td>{h.par ?? '—'}</td>
                  <td><strong>{h.score ?? '—'}</strong></td>
                  <td style={scored ? { color: scoreColor(d), fontWeight: 600 } : undefined} className={scored ? undefined : 'muted'}>
                    {scored ? (d > 0 ? `+${d}` : d) : '—'}
                  </td>
                  <td>{h.putts ?? '—'}</td>
                  <td>{h.ob ?? '—'}</td>
                  <td>{h.gir ? <span style={{ color: '#22c55e', fontWeight: 600 }}>✓</span> : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {breakdown.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Score breakdown</h3>
          <div className="score-breakdown">
            {breakdown.map((c) => (
              <div className="sb-col" key={c.key}>
                <div className="sb-count">{c.count}</div>
                <div className="sb-bar-track">
                  <div
                    className="sb-bar"
                    style={{ height: `${(c.count / maxCount) * 100}%`, background: c.color }}
                  />
                </div>
                <div className="sb-label">{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Score categories, best → worst. Triple bogey and anything worse fold into the
// final bucket. Each bar is colored with the same scale as the per-hole table.
const SCORE_CATEGORIES = [
  { key: 'albatross', label: 'Albatross+', match: (d) => d <= -3, color: scoreColor(-3) },
  { key: 'eagle', label: 'Eagle', match: (d) => d === -2, color: scoreColor(-2) },
  { key: 'birdie', label: 'Birdie', match: (d) => d === -1, color: scoreColor(-1) },
  { key: 'par', label: 'Par', match: (d) => d === 0, color: scoreColor(0) },
  { key: 'bogey', label: 'Bogey', match: (d) => d === 1, color: scoreColor(1) },
  { key: 'double', label: 'Double', match: (d) => d === 2, color: scoreColor(2) },
  { key: 'triple', label: 'Triple+', match: (d) => d >= 3, color: scoreColor(3) },
]

// Count each score category across played holes, then trim empty categories
// from both ends so the chart spans only from the best score made to the worst
// (interior gaps, e.g. a birdie and a bogey but no par, are kept).
function scoreBreakdown(round) {
  const diffs = (Array.isArray(round.holes) ? round.holes : [])
    .filter((h) => typeof h.score === 'number' && typeof h.par === 'number')
    .map((h) => h.score - h.par)
  const counts = SCORE_CATEGORIES.map((c) => ({ ...c, count: diffs.filter(c.match).length }))
  let start = 0
  let end = counts.length - 1
  while (start <= end && counts[start].count === 0) start++
  while (end >= start && counts[end].count === 0) end--
  return start > end ? [] : counts.slice(start, end + 1)
}
