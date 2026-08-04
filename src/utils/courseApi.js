// Client wrapper around the course-lookup Worker (see worker/index.js).
// The Worker's base URL comes from VITE_COURSE_API_URL. When it's unset, the
// search/import feature is simply hidden and the manual "custom course" path
// still works.

const BASE = import.meta.env.VITE_COURSE_API_URL || ''

export const courseLookupEnabled = Boolean(BASE)

async function call(path) {
  const res = await fetch(`${BASE}${path}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

// Nudge the Worker so its upstream is booting while the user is still filling in
// the form. OpenGC runs on Fly with scale-to-zero and takes ~20s to wake, so the
// first search of a visit is slow unless that wait starts early. Fire-and-forget:
// the response is irrelevant, and a failure just means the search pays the boot.
export function warmCourseApi() {
  if (!BASE) return
  fetch(`${BASE}/warm`).catch(() => {})
}

// Search courses by name. Returns [{ externalId, name, location }].
export async function searchCourses(query) {
  const { results } = await call(`/search?q=${encodeURIComponent(query)}`)
  return results || []
}

// Fetch every course for a club id, each already transformed into the app's
// course shape (id `ogc-<courseId>`, pars, tees, par3, …). A club can map to
// several courses (e.g. a 27-hole facility's 9-hole pairings).
export async function importClubCourses(clubId) {
  const { courses } = await call(`/course?id=${encodeURIComponent(clubId)}`)
  return courses || []
}
