import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchCourses,
  fetchEarnedAchievements,
  fetchProfile,
  fetchRounds,
} from '../utils/firestore.js'
import { ACHIEVEMENTS } from '../data/achievements.js'
import { calculateHandicap, formatHandicap } from '../utils/handicap.js'
import { isCountable, tracksStats } from '../utils/rounds.js'
import { PulseIcon, FlagIcon, TrophyIcon, TargetIcon, CircleIcon, WarnIcon } from '../components/Icons.jsx'

// Back-fill the par-3 flag from the shared course catalog, mirroring what
// DataContext does for the signed-in user's own rounds.
function enrichPar3(rounds, courses) {
  const map = new Map(courses.map((c) => [c.id, c]))
  return rounds.map((r) => {
    if (typeof r.par3 === 'boolean') return r
    const course = r.courseId ? map.get(r.courseId) : null
    return { ...r, par3: course?.par3 === true }
  })
}

// Putting / GIR / OOB aggregate over stat-tracked, countable rounds — the same
// rules the Dashboard uses for the signed-in user.
function summarize(rounds) {
  const countable = rounds.filter((r) => isCountable(r) && tracksStats(r))
  let playedHoles = 0
  let girHoles = 0
  let obShots = 0
  let puttRounds = 0
  let puttTotal = 0

  for (const r of countable) {
    const holes = Array.isArray(r.holes) ? r.holes : []
    const played = holes.filter((h) => typeof h.score === 'number')
    playedHoles += played.length
    for (const h of played) {
      if (h.gir === true) girHoles++
      if (typeof h.ob === 'number') obShots += h.ob
    }
    if (played.length > 0 && played.every((h) => typeof h.putts === 'number')) {
      puttRounds++
      puttTotal += played.reduce((s, h) => s + h.putts, 0)
    }
  }

  return {
    puttsPerRound: puttRounds ? puttTotal / puttRounds : null,
    girPct: playedHoles ? (girHoles / playedHoles) * 100 : null,
    obPerRound: countable.length ? obShots / countable.length : null,
    countableRounds: countable.length,
  }
}

export default function FriendStats() {
  const { uid } = useParams()
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const profile = await fetchProfile(uid)
        if (!profile) {
          if (active) setState({ status: 'notfound' })
          return
        }
        if (profile.isPublic !== true) {
          if (active) setState({ status: 'private', profile })
          return
        }
        const [rounds, achs, courses] = await Promise.all([
          fetchRounds(uid),
          fetchEarnedAchievements(uid),
          fetchCourses(),
        ])
        if (active) {
          setState({
            status: 'ok',
            profile,
            rounds: enrichPar3(rounds, courses),
            earnedCount: achs.length,
          })
        }
      } catch {
        // Most likely a permission error because the owner just went private.
        if (active) setState({ status: 'private' })
      }
    })()
    return () => {
      active = false
    }
  }, [uid])

  if (state.status === 'loading') {
    return <div className="container center muted">Loading…</div>
  }

  if (state.status === 'notfound') {
    return (
      <div className="container center">
        <h1>Not found</h1>
        <p className="muted">No golfer matches that link.</p>
        <Link to="/friends">← Back to lookup</Link>
      </div>
    )
  }

  if (state.status === 'private') {
    return (
      <div className="container center">
        <h1>Private</h1>
        <p className="muted">This user keeps their stats private.</p>
        <Link to="/friends">← Back to lookup</Link>
      </div>
    )
  }

  const { profile, rounds, earnedCount } = state
  const name = profile.displayName || profile.email?.split('@')[0] || 'Golfer'
  const handicap = calculateHandicap(rounds)
  const totalRounds = rounds.length
  const eighteen = rounds.filter((r) => r.holes?.length === 18 && isCountable(r))
  const bestRound = eighteen.length
    ? eighteen.reduce((best, r) => (r.totalScore < best.totalScore ? r : best))
    : null
  const stats = summarize(rounds)
  const achPct = ACHIEVEMENTS.length ? Math.round((earnedCount / ACHIEVEMENTS.length) * 100) : 0

  return (
    <div className="container">
      <div className="muted" style={{ marginBottom: 8 }}>
        <Link to="/friends">← Friends</Link>
      </div>
      <h1>{name}'s stats</h1>
      <p className="subtitle">A read-only look at their game.</p>

      <div className="grid cols-3">
        <div className="card featured">
          <div className="stat-head">
            <span className="stat-label">Handicap</span>
            <span className="icon-badge"><PulseIcon /></span>
          </div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{formatHandicap(handicap)}</div>
          <div className="stat-sub">
            {handicap == null ? 'Not enough 18-hole rounds' : 'Best differentials, tee-adjusted'}
          </div>
        </div>
        <div className="card">
          <div className="stat-head">
            <span className="stat-label">Rounds logged</span>
            <span className="icon-badge"><FlagIcon /></span>
          </div>
          <div className="stat-value">{totalRounds}</div>
        </div>
        <div className="card">
          <div className="stat-head">
            <span className="stat-label">Best 18-hole score</span>
            <span className="icon-badge"><TrophyIcon /></span>
          </div>
          <div className="stat-value">{bestRound ? bestRound.totalScore : '—'}</div>
          <div className="stat-sub">
            {bestRound ? `at ${bestRound.courseName}` : 'No 18-hole rounds yet'}
          </div>
        </div>
      </div>

      <h2>Stats</h2>
      <div className="grid cols-3">
        <div className="card">
          <div className="stat-head">
            <span className="stat-label">Putts / round</span>
            <span className="icon-badge"><CircleIcon /></span>
          </div>
          <div className="stat-value">
            {stats.puttsPerRound == null ? '—' : stats.puttsPerRound.toFixed(1)}
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
        </div>
        <div className="card">
          <div className="stat-head">
            <span className="stat-label">Out of bounds / round</span>
            <span className="icon-badge"><WarnIcon /></span>
          </div>
          <div className="stat-value">
            {stats.obPerRound == null ? '—' : stats.obPerRound.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Achievements</h2>
        <div className="stat-value" style={{ fontSize: '1.7rem' }}>
          {earnedCount}
          <span className="muted" style={{ fontSize: '1rem', fontWeight: 400 }}>
            {' '}/ {ACHIEVEMENTS.length} earned
          </span>
        </div>
        <div className="progress"><span style={{ width: `${achPct}%` }} /></div>
        <div className="stat-sub">{achPct}% complete</div>
      </div>
    </div>
  )
}
