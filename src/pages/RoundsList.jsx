import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useData } from '../data/DataContext.jsx'
import { holesPlayed, isIncomplete, isParThreeCourse, isScramble } from '../utils/rounds.js'

// Sort accessors keyed by column. Each returns a comparable value for a round.
const SORT_ACCESSORS = {
  date: (r) => r.date || '',
  course: (r) => (r.courseName || '').toLowerCase(),
  holes: (r) => r.holes?.length ?? 0,
  score: (r) => r.totalScore ?? 0,
  par: (r) => r.totalPar ?? 0,
  diff: (r) => (r.totalScore ?? 0) - (r.totalPar ?? 0),
}

// Default direction per column: newest date / worst diff feel natural descending,
// while course name reads best A→Z.
const DEFAULT_DESC = {
  date: true,
  course: false,
  holes: true,
  score: false,
  par: false,
  diff: false,
}

export default function RoundsList() {
  const { rounds, loading } = useData()
  const nav = useNavigate()
  const [sortKey, setSortKey] = useState('date')
  const [desc, setDesc] = useState(true)

  const sorted = useMemo(() => {
    const accessor = SORT_ACCESSORS[sortKey] || SORT_ACCESSORS.date
    const dir = desc ? -1 : 1
    return [...rounds].sort((a, b) => {
      const av = accessor(a)
      const bv = accessor(b)
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
  }, [rounds, sortKey, desc])

  const changeSort = (key) => {
    if (key === sortKey) {
      setDesc((d) => !d)
    } else {
      setSortKey(key)
      setDesc(DEFAULT_DESC[key])
    }
  }

  if (loading) return <div className="container center muted">Loading…</div>

  const Th = ({ column, children, style }) => (
    <th
      onClick={() => changeSort(column)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }}
    >
      {children}
      {sortKey === column && <span style={{ marginLeft: 4 }}>{desc ? '▼' : '▲'}</span>}
    </th>
  )

  return (
    <div className="container">
      <div className="row">
        <h1 style={{ margin: 0 }}>Rounds</h1>
        <div className="spacer" />
        <Link to="/add"><button className="primary">+ Add round</button></Link>
      </div>
      <p className="subtitle" style={{ margin: '10px 0 20px' }}>
        {sorted.length
          ? `${sorted.length} round${sorted.length === 1 ? '' : 's'} logged`
          : 'Your logged rounds will appear here'}
      </p>

      {sorted.length === 0 ? (
        <div className="card center muted">
          No rounds yet. <Link to="/add">Log your first one</Link>.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="rounds-table">
              <thead>
                <tr>
                  <Th column="date">Date</Th>
                  <Th column="course">Course</Th>
                  <Th column="holes" style={{ textAlign: 'center' }}>Holes</Th>
                  <Th column="score" style={{ textAlign: 'center' }}>Strokes</Th>
                  <Th column="par" style={{ textAlign: 'center' }}>Par</Th>
                  <Th column="diff" style={{ textAlign: 'center' }}>Score</Th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const diff = r.totalScore - r.totalPar
                  const incomplete = isIncomplete(r)
                  const total = r.holes?.length ?? 0
                  const chip = diffClass(diff)
                  return (
                    <tr
                      key={r.id}
                      onClick={() => nav(`/rounds/${r.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          <span style={{ fontWeight: 600 }}>{r.courseName}</span>
                          {isParThreeCourse(r) && <span className="tag">Par 3</span>}
                          {incomplete && <span className="tag incomplete">Incomplete</span>}
                          {isScramble(r) && <span className="tag scramble">Scramble</span>}
                        </div>
                        {r.tee?.name && (
                          <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
                            {r.tee.name} tees
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {incomplete ? `${holesPlayed(r)}/${total}` : total || '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <strong>{r.totalScore}</strong>
                      </td>
                      <td className="muted" style={{ textAlign: 'center' }}>{r.totalPar}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`diff-chip ${chip}`}>
                          {diff > 0 ? `+${diff}` : diff === 0 ? 'E' : diff}
                        </span>
                      </td>
                      <td className="muted" style={{ textAlign: 'right', paddingRight: 16 }}>›</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function diffClass(diff) {
  if (diff <= 0) return 'under'
  if (diff <= 5) return 'even'
  return 'over'
}
