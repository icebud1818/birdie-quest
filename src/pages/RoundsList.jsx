import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../data/DataContext.jsx'
import { holesPlayed, isIncomplete, isParThreeCourse } from '../utils/rounds.js'

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

  const Th = ({ column, children }) => (
    <th
      onClick={() => changeSort(column)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
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

      {sorted.length === 0 ? (
        <div className="card center muted">
          No rounds yet. <Link to="/add">Log your first one</Link>.
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <Th column="date">Date</Th>
                <Th column="course">Course</Th>
                <Th column="holes">Holes</Th>
                <Th column="score">Score</Th>
                <Th column="par">Par</Th>
                <Th column="diff">Diff</Th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const diff = r.totalScore - r.totalPar
                const incomplete = isIncomplete(r)
                const total = r.holes?.length ?? 0
                return (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>
                      {r.courseName}
                      {isParThreeCourse(r) && <span className="tag" style={{ marginLeft: 8 }}>Par 3</span>}
                      {incomplete && <span className="tag incomplete" style={{ marginLeft: 8 }}>Incomplete</span>}
                    </td>
                    <td>{incomplete ? `${holesPlayed(r)}/${total}` : total || '—'}</td>
                    <td><strong>{r.totalScore}</strong></td>
                    <td className="muted">{r.totalPar}</td>
                    <td style={{ color: diff <= 0 ? 'var(--accent)' : diff <= 5 ? 'var(--text)' : 'var(--warn)' }}>
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                    <td><Link to={`/rounds/${r.id}`}>View</Link></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
