import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import {
  fetchCourses,
  fetchEarnedAchievements,
  fetchRounds,
  recordAchievement,
  saveCourse,
  upsertProfile,
  saveRound,
  updateRound as updateRoundFs,
  deleteRound as deleteRoundFs,
  deleteAchievement as deleteAchievementFs,
} from '../utils/firestore.js'
import { ACHIEVEMENTS, MANUAL_ACHIEVEMENT_IDS, computeEarnedAchievements } from './achievements.js'

const DataContext = createContext(null)

// Auto-reconciliation only ever adds/removes *auto* achievements (ones with a
// check). Manual achievements the user toggles themselves are never in this
// set, so the recompute can't wipe them — and a definition deleted from the
// code never nukes a stored doc either.
const AUTO_IDS = new Set(
  ACHIEVEMENTS.filter((a) => !MANUAL_ACHIEVEMENT_IDS.has(a.id)).map((a) => a.id)
)

// Ensure a round carries a boolean `par3` flag. New rounds snapshot it from the
// form; older rounds predate the flag, so we derive it from the shared catalog
// (a round with no courseId — i.e. a custom course — is never par-3).
function withPar3(round, courseMap) {
  if (typeof round.par3 === 'boolean') return round
  const course = round.courseId ? courseMap.get(round.courseId) : null
  return { ...round, par3: course?.par3 === true }
}

export function DataProvider({ children }) {
  const { user } = useAuth()
  const [rounds, setRounds] = useState([])
  const [courses, setCourses] = useState([])
  const [earnedIds, setEarnedIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastEarned, setLastEarned] = useState([])

  const getCourse = useCallback((id) => courses.find((c) => c.id === id) || null, [courses])

  // Recompute earned achievements from the full set of rounds and reconcile
  // Firestore + local state: award anything newly qualifying, revoke anything
  // that no longer fits. Only writes to Firestore when the set actually
  // changes. Returns the achievements newly earned (for the toast).
  const syncAchievements = useCallback(
    async (nextRounds, priorEarnedIds) => {
      const computed = computeEarnedAchievements(nextRounds)
      const prior = new Set(priorEarnedIds)
      const toAdd = [...computed].filter((id) => !prior.has(id))
      const toRemove = [...prior].filter((id) => AUTO_IDS.has(id) && !computed.has(id))

      await Promise.all([
        ...toAdd.map((id) => recordAchievement(user.uid, id)),
        ...toRemove.map((id) => deleteAchievementFs(user.uid, id)),
      ])

      const nextEarnedIds = [...prior]
        .filter((id) => !toRemove.includes(id))
        .concat(toAdd)
      setEarnedIds(nextEarnedIds)

      const newlyEarned = ACHIEVEMENTS.filter((a) => toAdd.includes(a.id))
      return { newlyEarned }
    },
    [user]
  )

  const reload = useCallback(async () => {
    if (!user) {
      setRounds([])
      setCourses([])
      setEarnedIds([])
      setLoading(false)
      return
    }
    setLoading(true)
    // Keep the public profile's name/email current so friends can look this
    // user up by email. Fire-and-forget — a profile write must never block or
    // fail the data load, and it never touches the isPublic sharing flag.
    upsertProfile(user.uid, { displayName: user.displayName, email: user.email }).catch(() => {})
    try {
      const [rs, achs, cs] = await Promise.all([
        fetchRounds(user.uid),
        fetchEarnedAchievements(user.uid),
        fetchCourses(),
      ])
      setCourses(cs)
      const courseMap = new Map(cs.map((c) => [c.id, c]))
      const enriched = rs.map((r) => withPar3(r, courseMap))
      setRounds(enriched)
      // Self-heal on load: reconcile stored achievements against what the
      // rounds actually earn now. This revokes achievements that no longer
      // qualify (e.g. one earned on a course since flagged par-3) without
      // waiting for the next add/edit/delete.
      await syncAchievements(enriched, achs.map((a) => a.id))
    } finally {
      setLoading(false)
    }
  }, [user, syncAchievements])

  // Add (or update) a course in the shared catalog and reflect it locally.
  const addCourse = useCallback(async (course) => {
    await saveCourse(course)
    setCourses((prev) => {
      const rest = prev.filter((c) => c.id !== course.id)
      return [...rest, course]
    })
    return course
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const addRound = useCallback(
    async (round) => {
      if (!user) throw new Error('Not authenticated')
      const id = await saveRound(user.uid, round)
      const newRound = { id, ...round }
      const nextRounds = [newRound, ...rounds]
      setRounds(nextRounds)
      const { newlyEarned } = await syncAchievements(nextRounds, earnedIds)
      setLastEarned(newlyEarned)
      return { id, newlyEarned }
    },
    [user, rounds, earnedIds, syncAchievements]
  )

  const editRound = useCallback(
    async (roundId, round) => {
      if (!user) throw new Error('Not authenticated')
      await updateRoundFs(user.uid, roundId, round)
      const nextRounds = rounds.map((r) =>
        r.id === roundId ? { ...r, ...round } : r
      )
      setRounds(nextRounds)
      const { newlyEarned } = await syncAchievements(nextRounds, earnedIds)
      setLastEarned(newlyEarned)
      return { id: roundId, newlyEarned }
    },
    [user, rounds, earnedIds, syncAchievements]
  )

  const removeRound = useCallback(
    async (roundId) => {
      if (!user) return
      await deleteRoundFs(user.uid, roundId)
      const nextRounds = rounds.filter((r) => r.id !== roundId)
      setRounds(nextRounds)
      await syncAchievements(nextRounds, earnedIds)
    },
    [user, rounds, earnedIds, syncAchievements]
  )

  const clearLastEarned = useCallback(() => setLastEarned([]), [])

  // Toggle a manually-tracked achievement (e.g. "Chip-In"). Writes/removes the
  // Firestore doc directly and updates local state; the auto-reconciliation
  // leaves these alone, so they persist.
  const setManualAchievement = useCallback(
    async (id, earned) => {
      if (!user) return
      // Optimistic local update, then persist.
      setEarnedIds((prev) => {
        if (earned) return prev.includes(id) ? prev : [...prev, id]
        return prev.filter((x) => x !== id)
      })
      if (earned) await recordAchievement(user.uid, id)
      else await deleteAchievementFs(user.uid, id)
    },
    [user]
  )

  return (
    <DataContext.Provider
      value={{
        rounds,
        courses,
        getCourse,
        addCourse,
        earnedIds,
        loading,
        addRound,
        editRound,
        removeRound,
        setManualAchievement,
        lastEarned,
        clearLastEarned,
        reload,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside <DataProvider>')
  return ctx
}
