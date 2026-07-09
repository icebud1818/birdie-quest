// scorePulse course-lookup proxy (Cloudflare Worker).
//
// Keeps the golfcourseapi.com API key server-side. The browser never sees it —
// it only talks to this Worker, which is locked (via CORS) to your app origin.
//
// Endpoints:
//   GET /search?q=<text>   → [{ externalId, name, location }]
//   GET /course?id=<id>    → a course in scorePulse's own shape (ready to store)
//
// Secrets / vars (see worker/wrangler.toml):
//   GOLF_API_KEY   (secret)  your golfcourseapi.com key   — `wrangler secret put GOLF_API_KEY`
//   ALLOWED_ORIGIN (var)     comma-separated app origins allowed to call this
//   AUTH_SCHEME    (var)     Authorization prefix for the upstream key (default "Key")

const API_BASE = 'https://api.golfcourseapi.com/v1'

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
        return json({ results: await search(q, env) }, 200, cors)
      }
      if (url.pathname === '/course') {
        const id = (url.searchParams.get('id') || '').trim()
        if (!id) return json({ error: 'Missing id' }, 400, cors)
        const course = await getCourse(id, env)
        if (!course) return json({ error: 'Course not found' }, 404, cors)
        return json({ course }, 200, cors)
      }
      return json({ error: 'Not found' }, 404, cors)
    } catch (err) {
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

function authHeader(env) {
  const scheme = env.AUTH_SCHEME || 'Key'
  return `${scheme} ${env.GOLF_API_KEY}`
}

async function search(query, env) {
  const res = await fetch(`${API_BASE}/search?search_query=${encodeURIComponent(query)}`, {
    headers: { Authorization: authHeader(env) },
  })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = await res.json()
  const courses = data.courses || data.results || []
  return courses.map((c) => ({
    externalId: c.id,
    name: courseName(c),
    location: formatLocation(c.location),
  }))
}

async function getCourse(id, env) {
  const res = await fetch(`${API_BASE}/courses/${encodeURIComponent(id)}`, {
    headers: { Authorization: authHeader(env) },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`)
  const data = await res.json()
  // Some deployments wrap the course under `course`.
  return transformCourse(data.course || data)
}

// ---- API response → scorePulse course shape ----

function transformCourse(api) {
  const tees = buildTees(api)
  const pars = buildPars(api)
  const par3 = pars.length > 0 && pars.every((p) => p === 3)
  return {
    id: `gca-${api.id}`,
    name: courseName(api),
    pars,
    par3,
    tees,
    source: 'golfcourseapi',
    externalId: api.id,
    location: formatLocation(api.location),
  }
}

// Per-hole pars from the first tee that lists holes (par doesn't vary by tee).
function buildPars(api) {
  const groups = [...(api.tees?.male || []), ...(api.tees?.female || [])]
  const withHoles = groups.find((t) => Array.isArray(t.holes) && t.holes.length > 0)
  if (!withHoles) return []
  return withHoles.holes.map((h) => (typeof h.par === 'number' ? h.par : null)).filter((p) => p != null)
}

// Merge male + female tees into one list with unique ids. If a tee name appears
// in both, the female one is suffixed "(W)" so they stay distinguishable.
function buildTees(api) {
  const male = api.tees?.male || []
  const female = api.tees?.female || []
  const maleNames = new Set(male.map((t) => (t.tee_name || '').toLowerCase()))
  const out = []
  const seen = new Set()
  const add = (t, isFemale) => {
    if (t.course_rating == null || t.slope_rating == null) return
    let name = t.tee_name || 'Tee'
    if (isFemale && maleNames.has(name.toLowerCase())) name = `${name} (W)`
    let id = slugify(name) || 'tee'
    let n = 2
    while (seen.has(id)) id = `${slugify(name) || 'tee'}-${n++}`
    seen.add(id)
    out.push({ id, name, rating: t.course_rating, slope: t.slope_rating })
  }
  male.forEach((t) => add(t, false))
  female.forEach((t) => add(t, true))
  return out
}

// Combine club + course name, avoiding the common "X — X" duplication when the
// API repeats the same value in both fields.
function courseName(c) {
  const club = (c.club_name || '').trim()
  const course = (c.course_name || '').trim()
  if (!club) return course || 'Unnamed course'
  if (!course || course.toLowerCase() === club.toLowerCase()) return club
  return `${club} — ${course}`
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function formatLocation(loc) {
  if (!loc) return ''
  return [loc.city, loc.state, loc.country].filter(Boolean).join(', ')
}
