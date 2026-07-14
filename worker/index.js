// scorePulse course-lookup proxy (Cloudflare Worker).
//
// Proxies the OpenGC API (https://api.opengc.net) so the browser can reach it
// without hitting CORS — OpenGC returns no Access-Control-Allow-Origin, so a
// direct browser call is blocked. OpenGC needs no API key; this Worker just
// forwards, locks CORS to your app origin, and reshapes the response into
// scorePulse's own course shape (per-hole pars + per-tee rating/slope).
//
// Endpoints (unchanged contract — the client in src/utils/courseApi.js is
// source-agnostic):
//   GET /search?q=<text>   → [{ externalId, name, location }]   (externalId = club id)
//   GET /course?id=<id>    → { courses: [ <scorePulse course>, ... ] } for a club
//        (a club can map to several courses, e.g. a 27-hole facility's pairings)
//
// Vars (see worker/wrangler.toml):
//   ALLOWED_ORIGIN (var)   comma-separated app origins allowed to call this

const API_BASE = 'https://api.opengc.net/api'

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const cors = corsHeaders(origin, env)

    // Preflight.
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, cors)

    const url = new URL(request.url)
    try {
      if (url.pathname === '/search') {
        const q = (url.searchParams.get('q') || '').trim()
        if (!q) return json({ error: 'Missing query' }, 400, cors)
        return json({ results: await search(q) }, 200, cors)
      }
      if (url.pathname === '/course') {
        const id = (url.searchParams.get('id') || '').trim()
        if (!id) return json({ error: 'Missing id' }, 400, cors)
        const courses = await getCourses(id)
        if (courses.length === 0) {
          return json({ error: 'No course data is available for this facility yet.' }, 404, cors)
        }
        return json({ courses }, 200, cors)
      }
      return json({ error: 'Not found' }, 404, cors)
    } catch (err) {
      if (err.status === 429) {
        return json({ error: 'Course lookup is busy right now — try again in a moment.' }, 429, cors)
      }
      return json({ error: err.message || 'Upstream error' }, 502, cors)
    }
  },
}

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean)
  const ok = allowed.includes(origin)
  return {
    'Access-Control-Allow-Origin': ok ? origin : (allowed[0] || ''),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  }
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

// Error that carries the upstream HTTP status so the handler can map rate limits.
function upstreamError(status, label) {
  const err = new Error(`${label} failed (${status})`)
  err.status = status
  return err
}

async function fetchJson(path, label) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw upstreamError(res.status, label)
  return res.json()
}

// ---- Search: clubs by name → [{ externalId, name, location }] ----

async function search(query) {
  const data = await fetchJson(
    `/clubs?page=1&limit=20&search=${encodeURIComponent(query)}`,
    'Search'
  )
  const clubs = Array.isArray(data?.data) ? data.data : []
  return clubs.map((c) => ({
    externalId: c.id,
    name: c.name || 'Unnamed course',
    location: formatLocation(c),
  }))
}

// ---- Detail: club id → every usable scorePulse course for that club ----

async function getCourses(clubId) {
  const data = await fetchJson(`/clubs/${encodeURIComponent(clubId)}`, 'Lookup')
  const club = data?.data
  if (!club) return []

  const usable = (Array.isArray(club.courses) ? club.courses : []).filter(
    (c) => teesOf(c).length > 0
  )
  const multi = usable.length > 1

  const out = []
  for (const course of usable) {
    const tees = buildTees(course)
    const pars = buildPars(course)
    if (pars.length === 0 || tees.length === 0) continue
    out.push({
      id: `ogc-${course.id}`,
      // With multiple courses, the course's own name carries the distinguishing
      // detail (e.g. "…- Grizzly / Kodiak"); for a single course prefer the
      // fuller club-based name.
      name: multi ? course.name || courseName(club, course) : courseName(club, course),
      pars,
      par3: pars.every((p) => p === 3),
      tees,
      source: 'opengc',
      externalId: course.id,
      location: formatLocation(club),
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

// The tees of a course's most recent scorecard version.
function teesOf(course) {
  const versions = course?.scorecardCurrent?.versions
  if (!Array.isArray(versions) || versions.length === 0) return []
  const latest = versions[versions.length - 1]
  return Array.isArray(latest?.tees) ? latest.tees : []
}

// Per-hole pars from the first tee that lists a full set of numeric pars (par
// doesn't vary by tee), ordered by hole number.
function buildPars(course) {
  for (const tee of teesOf(course)) {
    const holes = [...(tee.holes || [])].sort((a, b) => (a.number || 0) - (b.number || 0))
    const pars = holes.map((h) => (typeof h.par === 'number' ? h.par : null))
    if (pars.length > 0 && pars.every((p) => p != null)) return pars
  }
  return []
}

// Map scorecard tees → scorePulse tees, keeping only those with a rating +
// slope (needed for the handicap) and unique ids.
function buildTees(course) {
  const out = []
  const seen = new Set()
  for (const t of teesOf(course)) {
    if (typeof t.rating !== 'number' || typeof t.slope !== 'number') continue
    const name = t.name || 'Tee'
    let id = slugify(t.id || name) || 'tee'
    let n = 2
    while (seen.has(id)) id = `${slugify(t.id || name) || 'tee'}-${n++}`
    seen.add(id)
    out.push({ id, name, rating: t.rating, slope: t.slope })
  }
  return out
}

// Club + course name, avoiding "X — X" when the course just repeats the club.
function courseName(club, course) {
  const clubName = (club.name || '').trim()
  const courseNm = (course.name || '').trim()
  if (!clubName) return courseNm || 'Unnamed course'
  if (!courseNm || courseNm.toLowerCase() === clubName.toLowerCase()) return clubName
  if (clubName.toLowerCase().includes(courseNm.toLowerCase())) return clubName
  return `${clubName} — ${courseNm}`
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function formatLocation(o) {
  if (!o) return ''
  return [o.city, o.state].filter(Boolean).join(', ')
}
