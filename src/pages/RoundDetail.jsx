import { Link, useNavigate, useParams } from 'react-router-dom'
import { useData } from '../data/DataContext.jsx'
import { holesPlayed, isIncomplete, isParThreeCourse, scoreColor } from '../utils/rounds.js'

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
      </h1>
      <div className="muted" style={{ marginBottom: 20 }}>
        {round.date}
        {incomplete && ` · ${played} of ${round.holes.length} holes played`}
      </div>

      <div className="grid cols-3">
        <div className="card">
          <div className="muted">Score</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{round.totalScore}</div>
        </div>
        <div className="card">
          <div className="muted">Par</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{round.totalPar}</div>
        </div>
        <div className="card">
          <div className="muted">vs Par</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>
            {diff > 0 ? `+${diff}` : diff}
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
              <th>Score</th>
              <th>vs Par</th>
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
    </div>
  )
}
