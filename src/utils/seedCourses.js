// One-time migration: copy the built-in preset courses (src/data/courses.js)
// into the shared Firestore `courses` collection. Idempotent — re-running it
// just overwrites the same docs (merge), so it's safe to click twice.
import { COURSES } from '../data/courses.js'
import { saveCourse } from './firestore.js'

export async function seedPresetCourses() {
  await Promise.all(
    COURSES.map((c) =>
      saveCourse({
        id: c.id,
        name: c.name,
        pars: c.pars,
        par3: c.par3 === true,
        tees: c.tees || [],
        source: 'preset',
      })
    )
  )
  return COURSES.length
}
