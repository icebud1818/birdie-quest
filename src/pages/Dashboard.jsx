import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { useData } from '../data/DataContext.jsx'
import { ACHIEVEMENTS } from '../data/achievements.js'
import { calculateHandicap } from '../utils/handicap.js'
import { isCountable, isIncomplete, isScramble, tracksStats } from '../utils/rounds.js'

export default function Dashboard() {
  const { user } = useAuth()
  const { rounds, earnedIds, loading } = useData()

  // Putting / GIR / OOB aggregates. Only over rounds that count (excludes
  // par-3 and incomplete) AND that the user marked as stat-tracked — so
  // rounds where these weren't recorded don't drag the averages down.
  const stats = useMemo(() => {
    const countable = rounds.filter((r) => isCountable(r) && tracksStats(r))
    let playedHoles = 0
    let girHoles = 0
    let obShots = 0
    let puttRounds = 0
    let puttTotal = 0
    let puttHoles = 0

    for (const r of countable) {
      const holes = Array.isArray(r.holes) ? r.holes : []
      const played = holes.filter((h) => typeof h.score === 'number')
      playedHoles += played.length
      for (const h of played) {
        if (h.gir === true) girHoles++
        if (typeof h.ob === 'number') obShots += h.ob
      }
      // Only rounds with putts logged on every played hole feed the per-round
      // putting average, so partial data can't skew it low.
      if (played.length > 0 && played.every((h) => typeof h.putts === 'number')) {
        puttRounds++
        puttTotal += played.reduce((s, h) => s + h.putts, 0)
        puttHoles += played.length
      }
    }

    return {
      puttsPerRound: puttRounds ? puttTotal / puttRounds : null,
      puttsPerHole: puttHoles ? puttTotal / puttHoles : null,
      puttRounds,
      girPct: playedHoles ? (girHoles / playedHoles) * 100 : null,
      girHoles,
      playedHoles,
      obPerRound: countable.length ? obShots / countable.length : null,
      obShots,
      countableRounds: countable.length,
    }
  }, [rounds])

  if (loading) return <div className="container center muted">Loading…</div>

  const handicap = calculateHandicap(rounds)
  const totalRounds = rounds.length
  const eighteenHoleRounds = rounds.filter(
    (r) => r.holes?.length === 18 && isCountable(r)
  )
  const bestRound = eighteenHoleRounds.length
    ? eighteenHoleRounds.reduce((best, r) => (r.totalScore < best.totalScore ? r : best))
    : null
  const bestScore = bestRound ? bestRound.totalScore : null
  // Most-recently-*played* round (latest date), not the last one entered.
  const lastRound = rounds.length
    ? [...rounds].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
    : null

  return (
    <div className="container">
      <h1>Welcome back, {user?.email?.split('@')[0]}</h1>

      <div className="grid cols-3">
        <div className="card">
          <div className="muted">Handicap</div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>
            {handicap == null ? '—' : handicap > 0 ? `+${handicap}` : handicap}
          </div>
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            {handicap == null ? 'Need 3+ 18-hole rounds' : 'Simplified (score − par)'}
          </div>
        </div>
        <div className="card">
          <div className="muted">Rounds logged</div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{totalRounds}</div>
        </div>
        <div className="card">
          <div className="muted">Best 18-hole score</div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{bestScore ?? '—'}</div>
          {bestRound && (
            <div className="muted" style={{ fontSize: '0.85rem' }}>
              at {bestRound.courseName}
            </div>
          )}
        </div>
      </div>

      <h2>Your stats</h2>
      <div className="grid cols-3">
        <div className="card">
          <div className="muted">Putts / round</div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>
            {stats.puttsPerRound == null ? '—' : stats.puttsPerRound.toFixed(1)}
          </div>
          {stats.puttsPerHole != null && (
            <div style={{ fontWeight: 600 }}>
              {stats.puttsPerHole.toFixed(2)} <span className="muted" style={{ fontWeight: 400 }}>per hole</span>
            </div>
          )}
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            {stats.puttRounds
              ? `over ${stats.puttRounds} fully-tracked round${stats.puttRounds === 1 ? '' : 's'}`
              : 'Log putts on a round to see this'}
          </div>
        </div>
        <div className="card">
          <div className="muted">Greens in regulation</div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>
            {stats.girPct == null ? '—' : `${Math.round(stats.girPct)}%`}
          </div>
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            {stats.playedHoles
              ? `${stats.girHoles} of ${stats.playedHoles} holes`
              : 'No holes logged yet'}
          </div>
        </div>
        <div className="card">
          <div className="muted">Out of bounds / round</div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>
            {stats.obPerRound == null ? '—' : stats.obPerRound.toFixed(1)}
          </div>
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            {stats.countableRounds
              ? `${stats.obShots} total over ${stats.countableRounds} round${stats.countableRounds === 1 ? '' : 's'}`
              : 'No rounds logged yet'}
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Recent round</h2>
          {lastRound ? (
            <div>
              <div>
                <strong>{lastRound.courseName}</strong>
                {isIncomplete(lastRound) && (
                  <span className="tag incomplete" style={{ marginLeft: 8 }}>Incomplete</span>
                )}
                {isScramble(lastRound) && (
                  <span className="tag scramble" style={{ marginLeft: 8 }}>Scramble</span>
                )}
              </div>
              <div className="muted">{lastRound.date}</div>
              <div style={{ marginTop: 8 }}>
                Score: <strong>{lastRound.totalScore}</strong> (par {lastRound.totalPar})
              </div>
              <div style={{ marginTop: 12 }}>
                <Link to={`/rounds/${lastRound.id}`}>View details →</Link>
              </div>
            </div>
          ) : (
            <div className="muted">
              No rounds yet. <Link to="/add">Log your first round</Link>.
            </div>
          )}
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Achievements</h2>
          <div>
            <strong>{earnedIds.length}</strong> of {ACHIEVEMENTS.length} earned
          </div>
          <div style={{ marginTop: 12 }}>
            <Link to="/achievements">See all →</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
