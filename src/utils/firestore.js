import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase.js'

// Firestore layout:
//   users/{uid}/rounds/{roundId}       — one doc per submitted round (per-user)
//   users/{uid}/achievements/{achId}   — one doc per earned achievement (per-user)
//   courses/{courseId}                 — shared course catalog (all users read;
//                                        any signed-in user may add/update)

function roundsCol(uid) {
  return collection(db, 'users', uid, 'rounds')
}
function achievementsCol(uid) {
  return collection(db, 'users', uid, 'achievements')
}
function coursesCol() {
  return collection(db, 'courses')
}

export async function fetchRounds(uid) {
  const snap = await getDocs(query(roundsCol(uid), orderBy('date', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function saveRound(uid, round) {
  const ref = await addDoc(roundsCol(uid), {
    ...round,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateRound(uid, roundId, round) {
  // merge:true preserves createdAt; arrays (holes) are replaced wholesale,
  // which is what we want when the user re-enters scores.
  await setDoc(
    doc(db, 'users', uid, 'rounds', roundId),
    { ...round, updatedAt: serverTimestamp() },
    { merge: true }
  )
}

export async function deleteRound(uid, roundId) {
  await deleteDoc(doc(db, 'users', uid, 'rounds', roundId))
}

export async function fetchEarnedAchievements(uid) {
  const snap = await getDocs(achievementsCol(uid))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function recordAchievement(uid, achievementId) {
  await setDoc(doc(db, 'users', uid, 'achievements', achievementId), {
    earnedAt: serverTimestamp(),
  })
}

export async function deleteAchievement(uid, achievementId) {
  await deleteDoc(doc(db, 'users', uid, 'achievements', achievementId))
}

// ---- Public profiles (friend lookup / stats sharing) ----
//
// profiles/{uid} = { displayName, email (lowercased), isPublic, updatedAt }.
// The email is stored lowercased so lookups match regardless of how it's typed.

// Upsert the profile's identity fields (display name + email) without touching
// isPublic — so keeping the profile fresh on login never flips a user's
// sharing choice. A brand-new profile has no isPublic field, which the rules
// treat as private (the safe default).
export async function upsertProfile(uid, { displayName, email }) {
  await setDoc(
    doc(db, 'profiles', uid),
    {
      displayName: displayName || '',
      email: (email || '').trim().toLowerCase(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

export async function fetchProfile(uid) {
  const snap = await getDoc(doc(db, 'profiles', uid))
  return snap.exists() ? { uid: snap.id, ...snap.data() } : null
}

export async function setProfilePublic(uid, isPublic) {
  await setDoc(
    doc(db, 'profiles', uid),
    { isPublic: !!isPublic, updatedAt: serverTimestamp() },
    { merge: true }
  )
}

// Find a user by exact (case-insensitive) email. Returns the profile or null.
export async function lookupProfileByEmail(email) {
  const normalized = (email || '').trim().toLowerCase()
  if (!normalized) return null
  const snap = await getDocs(
    query(collection(db, 'profiles'), where('email', '==', normalized))
  )
  const d = snap.docs[0]
  return d ? { uid: d.id, ...d.data() } : null
}

// ---- Shared course catalog ----

// A course doc mirrors the shape the app has always used for courses:
//   { id, name, pars: number[], par3?: boolean, tees: [{id,name,rating,slope}] }
// plus provenance: source ('preset' | 'golfcourseapi'), externalId, location.
export async function fetchCourses() {
  const snap = await getDocs(coursesCol())
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function fetchCourse(courseId) {
  const ref = doc(db, 'courses', courseId)
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

// Write (or overwrite) a course doc under its own id. merge:true so re-saving
// an existing course doesn't clobber fields like createdAt.
export async function saveCourse(course) {
  const { id, ...data } = course
  await setDoc(
    doc(db, 'courses', id),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true }
  )
  return id
}
