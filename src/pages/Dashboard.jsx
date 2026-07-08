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

  const achPct = ACHIEVEMENTS.length
    ? Math.round((earnedIds.length / ACHIEVEMENTS.length) * 100)
    : 0
  const name = user?.email?.split('@')[0]

  return (
    <div className="container">
      <h1>Welcome back{name ? `, ${name}` : ''}</h1>
      <p className="subtitle">Here's where your game stands right now.</p>

      <div className="grid cols-3">
        <div className="card featured">
          <div className="stat-head">
            <span className="stat-label">Handicap</span>
            <span className="icon-badge"><PulseIcon /></span>
          </div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>
            {handicap == null ? '—' : handicap > 0 ? `+${handicap}` : handicap}
          </div>
          <div className="stat-sub">
            {handicap == null ? 'Need 3+ 18-hole rounds' : 'Best differentials, tee-adjusted'}
          </div>
        </div>
        <div className="card">
          <div className="stat-head">
            <span className="stat-label">Rounds logged</span>
            <span className="icon-badge"><FlagIcon /></span>
          </div>
          <div className="stat-value">{totalRounds}</div>
          <div className="stat-sub">
            {totalRounds ? 'Keep them coming' : 'Log your first round'}
          </div>
        </div>
        <div className="card">
          <div className="stat-head">
            <span className="stat-label">Best 18-hole score</span>
            <span className="icon-badge"><TrophyIcon /></span>
          </div>
          <div className="stat-value">{bestScore ?? '—'}</div>
          <div className="stat-sub">
            {bestRound ? `at ${bestRound.courseName}` : 'No 18-hole rounds yet'}
          </div>
        </div>
      </div>

      <h2>Your stats</h2>
      <div className="grid cols-3">
        <div className="card">
          <div className="stat-head">
            <span className="stat-label">Putts / round</span>
            <span className="icon-badge"><CircleIcon /></span>
          </div>
          <div className="stat-value">
            {stats.puttsPerRound == null ? '—' : stats.puttsPerRound.toFixed(1)}
          </div>
          <div className="stat-sub">
            {stats.puttsPerHole != null && (
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                {stats.puttsPerHole.toFixed(2)} per hole ·{' '}
              </span>
            )}
            {stats.puttRounds
              ? `${stats.puttRounds} tracked round${stats.puttRounds === 1 ? '' : 's'}`
              : 'Log putts to see this'}
          </div>
        </div>
        <div className="card">
          <div className="stat-head">
            <span className="stat-label">Greens in regulation</span>
            <span className="icon-badge"><TargetIcon /></span>
          </div>
          <div className="stat-value">
            {stats.girPct == null ? '—' : `${Math.round(stats.girPct)}%`}
          </div>
          <div className="stat-sub">
            {stats.playedHoles
              ? `${stats.girHoles} of ${stats.playedHoles} holes`
              : 'No holes logged yet'}
          </div>
        </div>
        <div className="card">
          <div className="stat-head">
            <span className="stat-label">Out of bounds / round</span>
            <span className="icon-badge"><WarnIcon /></span>
          </div>
          <div className="stat-value">
            {stats.obPerRound == null ? '—' : stats.obPerRound.toFixed(1)}
          </div>
          <div className="stat-sub">
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
            <RecentRound round={lastRound} />
          ) : (
            <div className="muted">
              No rounds yet. <Link to="/add">Log your first round</Link>.
            </div>
          )}
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Achievements</h2>
          <div className="stat-value" style={{ fontSize: '1.7rem' }}>
            {earnedIds.length}
            <span className="muted" style={{ fontSize: '1rem', fontWeight: 400 }}>
              {' '}/ {ACHIEVEMENTS.length} earned
            </span>
          </div>
          <div className="progress"><span style={{ width: `${achPct}%` }} /></div>
          <div className="stat-sub">{achPct}% complete</div>
          <div style={{ marginTop: 16 }}>
            <Link to="/achievements">See all →</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function RecentRound({ round }) {
  const diff = round.totalScore - round.totalPar
  const diffColor = diff <= 0 ? 'var(--accent)' : diff <= 5 ? 'var(--text)' : 'var(--warn)'
  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>
        <strong style={{ fontSize: '1.05rem' }}>{round.courseName}</strong>
        {isIncomplete(round) && <span className="tag incomplete">Incomplete</span>}
        {isScramble(round) && <span className="tag scramble">Scramble</span>}
      </div>
      <div className="muted" style={{ marginBottom: 14 }}>
        {round.date}
        {round.tee?.name ? ` · ${round.tee.name} tees` : ''}
      </div>
      <div className="score-pill">
        <span className="score-num">{round.totalScore}</span>
        <span className="muted">par {round.totalPar}</span>
        <span style={{ color: diffColor, fontWeight: 700 }}>
          {diff > 0 ? `+${diff}` : diff === 0 ? 'E' : diff}
        </span>
      </div>
      <div style={{ marginTop: 16 }}>
        <Link to={`/rounds/${round.id}`}>View details →</Link>
      </div>
    </div>
  )
}

// Inline stroke icons (no dependencies) — match the landing page's icon set.
function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h4l3 8 4-16 3 8h6" />
    </svg>
  )
}
function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22V4" />
      <path d="M4 4h11l-1.5 3L15 10H4" />
    </svg>
  )
}
function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h12v4a6 6 0 0 1-12 0V4Z" />
      <path d="M6 6H3v1a3 3 0 0 0 3 3M18 6h3v1a3 3 0 0 1-3 3" />
      <path d="M9 20h6M12 14v6" />
    </svg>
  )
}
function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  )
}
function CircleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
    </svg>
  )
}
function WarnIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  )
}
