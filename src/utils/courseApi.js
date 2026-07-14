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
