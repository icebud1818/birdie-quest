// scorePulse course-lookup proxy (Cloudflare Worker).
//
// Combines two sources so the browser can reach them without CORS:
//   • OpenGC (api.opengc.net)  — per-hole pars + the tee list (clean JSON).
//   • USGA NCRDB (ncrdb.usga.org) — authoritative course rating + slope per tee.
//
// The result is one course in scorePulse's shape: OpenGC pars, with each tee's
// rating/slope overlaid from USGA when a confident match is found (otherwise the
// OpenGC rating/slope is kept). USGA enrichment is best-effort — any failure
// falls back to OpenGC so import always works.
//
// OpenGC's data has duplicates: one physical course can appear twice with
// conflicting hole data. Rather than guess, /course returns each distinct layout
// (best-ranked first, `ambiguous: true` when two claim to be the same course) and
// the user picks the one matching their scorecard.
//
// Endpoints (src/utils/courseApi.js is source-agnostic):
//   GET /search?q=<text>   → [{ externalId, name, location }]   (externalId = club id)
//   GET /course?id=<id>    → { courses: [ <scorePulse course>, ... ] } for a club
//
// Vars (see worker/wrangler.toml):
//   ALLOWED_ORIGIN (var)   comma-separated app origins allowed to call this

const OPENGC_BASE = 'https://api.opengc.net/api'
const USGA_BASE = 'https://ncrdb.usga.org'
// USGA's WAF oddly 403s browser-like and unknown User-Agents but allows common
// tool UAs, so we present a curl-style one.
const UA = 'curl/8.5.0'

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const cors = corsHeaders(origin, env)

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

function upstreamError(status, label) {
  const err = new Error(`${label} failed (${status})`)
  err.status = status
  return err
}

// ==== OpenGC: search + per-hole pars + base tees ====

async function openGcJson(path, label) {
  const res = await fetch(`${OPENGC_BASE}${path}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw upstreamError(res.status, label)
  return res.json()
}

async function search(query) {
  const data = await openGcJson(`/clubs?page=1&limit=20&search=${encodeURIComponent(query)}`, 'Search')
  const clubs = Array.isArray(data?.data) ? data.data : []
  return clubs.map((c) => ({
    externalId: c.id,
    name: c.name || 'Unnamed course',
    location: formatLocation(c),
  }))
}

async function getCourses(clubId) {
  const data = await openGcJson(`/clubs/${encodeURIComponent(clubId)}`, 'Lookup')
  const club = data?.data
  if (!club) return []

  // Most-complete records first, so a kept course beats its duplicate.
  const usable = (Array.isArray(club.courses) ? club.courses : [])
    .filter((c) => teesOf(c).length > 0)
    .sort((a, b) => (b.completenessScore || 0) - (a.completenessScore || 0))

  // Look the facility up once in USGA (best-effort).
  let usgaCourses = []
  try {
    usgaCourses = await usgaSearchFacility(club)
  } catch {
    usgaCourses = []
  }

  // Match each OpenGC course to a USGA course, then dedup. Identity is the USGA
  // course *and* the hole layout: OpenGC sometimes lists one physical course
  // twice with different hole data (e.g. the nines swapped, or plain wrong pars),
  // and those must stay separately selectable so the user can pick the layout
  // matching their scorecard. Byte-identical layouts still collapse, as do
  // genuinely different courses staying distinct (a 27-hole facility's pairings).
  const picked = []
  const seen = new Set()
  for (const course of usable) {
    const pars = buildPars(course)
    if (pars.length === 0) continue
    const usgaMatch = bestUsgaMatch(course.name || courseName(club, course), usgaCourses)
    const group = usgaMatch ? `usga:${usgaMatch.courseID}` : `pars:${pars.join('-')}`
    const key = `${group}|pars:${pars.join('-')}`
    if (seen.has(key)) continue
    seen.add(key)
    picked.push({ course, pars, si: buildStrokeIndexes(course), usgaMatch, group })
  }

  // Resolve tees up front (cached per USGA course) so ranking can compare each
  // candidate's par total against USGA's authoritative par for the course.
  const teeCache = new Map()
  const entries = []
  for (const p of picked) {
    let tees = []
    let teeSource = 'opengc'
    let usgaPar = null
    if (p.usgaMatch) {
      try {
        let usgaTees = teeCache.get(p.usgaMatch.courseID)
        if (!usgaTees) {
          usgaTees = await usgaTeesFor(p.usgaMatch.courseID)
          teeCache.set(p.usgaMatch.courseID, usgaTees)
        }
        usgaPar = usgaTees.find((t) => Number.isFinite(t.par))?.par ?? null
        const built = teesFromUsga(usgaTees)
        if (built.length) {
          tees = built
          teeSource = 'usga'
        }
      } catch {
        // fall through to the OpenGC fallback below
      }
    }
    if (tees.length === 0) tees = buildTees(p.course) // OpenGC fallback
    if (tees.length === 0) continue
    entries.push({ ...p, tees, teeSource, rank: rankCandidate(p, club, usgaPar) })
  }

  // Candidates sharing a USGA course are duplicates of one physical course with
  // conflicting hole data — flag them so the UI can say so, and list the
  // best-ranked first.
  const groupCounts = new Map()
  for (const e of entries) groupCounts.set(e.group, (groupCounts.get(e.group) || 0) + 1)

  // Most-trustworthy first (the picker's default reading order), then by name.
  entries.sort((a, b) => b.rank - a.rank || (a.course.name || '').localeCompare(b.course.name || ''))

  const multi = entries.length > 1
  return entries.map((e) => ({
    id: `ogc-${e.course.id}`,
    name: multi ? e.course.name || courseName(club, e.course) : courseName(club, e.course),
    pars: e.pars,
    strokeIndexes: e.si,
    par3: e.pars.every((p) => p === 3),
    tees: e.tees,
    source: e.teeSource === 'usga' ? 'opengc+usga' : 'opengc',
    externalId: e.course.id,
    location: formatLocation(club),
    // True when another candidate claims to be this same course with different
    // hole data — the user has to pick which layout is right.
    ambiguous: groupCounts.get(e.group) > 1,
  }))
}

// Confidence that an OpenGC record is the maintained/correct one for a course,
// used to order duplicates. Signals, most to least authoritative:
//   • par total agrees with USGA's par for the course (authoritative when known)
//   • the record's name matches the club / USGA facility name — the truncated
//     duplicate ("Frog Hollow" vs "Frog Hollow Golf Club") is usually the stale one
//   • OpenGC's own completeness score
//   • a full, valid stroke index is present
// Heuristic by nature: it only decides list order, and the user can always pick
// the other one.
function rankCandidate({ course, pars, si, usgaMatch }, club, usgaPar) {
  const parTotal = pars.reduce((s, p) => s + p, 0)
  const parAgrees = usgaPar != null && parTotal === usgaPar ? 1 : 0
  const nameScore = Math.max(
    fullNameScore(course.name, club.name),
    fullNameScore(course.name, usgaMatch?.fullName)
  )
  const completeness = Math.min(course.completenessScore || 0, 100) / 100
  const hasSi = si.length > 0 ? 1 : 0
  return parAgrees * 1000 + nameScore * 100 + completeness * 10 + hasSi
}

// Name similarity that *keeps* golf stopwords, so "Frog Hollow Golf Club" scores
// above the truncated "Frog Hollow" when compared with the club's own name.
// (tokenSet() strips them, which makes those two names identical.)
function fullNameScore(a, b) {
  if (!a || !b) return 0
  return jaccard(new Set(tokenList(a)), new Set(tokenList(b)))
}

function teesOf(course) {
  const versions = course?.scorecardCurrent?.versions
  if (!Array.isArray(versions) || versions.length === 0) return []
  const latest = versions[versions.length - 1]
  return Array.isArray(latest?.tees) ? latest.tees : []
}

function buildPars(course) {
  for (const tee of teesOf(course)) {
    const holes = [...(tee.holes || [])].sort((a, b) => (a.number || 0) - (b.number || 0))
    const pars = holes.map((h) => (typeof h.par === 'number' ? h.par : null))
    if (pars.length > 0 && pars.every((p) => p != null)) return pars
  }
  return []
}

// Per-hole stroke index (hole handicap) from the first tee that lists a full,
// valid set — i.e. a permutation of 1..N. Returns [] if none is trustworthy, so
// the handicap calc can fall back to gross scoring.
function buildStrokeIndexes(course) {
  for (const tee of teesOf(course)) {
    const holes = [...(tee.holes || [])].sort((a, b) => (a.number || 0) - (b.number || 0))
    const si = holes.map((h) => (typeof h.handicapIndex === 'number' ? h.handicapIndex : null))
    if (si.length > 0 && si.every((x) => x != null) && isValidStrokeIndex(si)) return si
  }
  return []
}

// A valid stroke index is exactly the numbers 1..N, each used once.
function isValidStrokeIndex(si) {
  const seen = new Set(si)
  if (seen.size !== si.length) return false
  for (let i = 1; i <= si.length; i++) if (!seen.has(i)) return false
  return true
}

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
    out.push({ id, name, rating: t.rating, slope: t.slope, ratingSource: 'opengc' })
  }
  return out
}

// ==== USGA NCRDB: authoritative rating + slope (best-effort) ====

// Fetch the listing page to obtain the antiforgery token + its paired cookies.
async function usgaToken() {
  const res = await fetch(`${USGA_BASE}/NCRListing`, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw upstreamError(res.status, 'USGA token')
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : []
  const cookie = setCookies.map((c) => c.split(';')[0]).join('; ')
  const html = await res.text()
  const m = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/)
  return { token: m ? m[1] : null, cookie }
}

// One facility search POST. Returns [] on any failure.
async function usgaQuery(name, stateCode, token, cookie) {
  const body = new URLSearchParams({
    clubName: name,
    clubCity: '',
    clubState: stateCode,
    clubCountry: 'USA',
  })
  const res = await fetch(`${USGA_BASE}/NCRListing?handler=LoadCourses`, {
    method: 'POST',
    headers: {
      'RequestVerificationToken': token,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie,
      'User-Agent': UA,
    },
    body: body.toString(),
  })
  if (!res.ok) return []
  const list = await res.json().catch(() => [])
  return Array.isArray(list) ? list : []
}

// Search USGA for the facility (by cleaned name + state) → [{courseID, fullName, city}].
async function usgaSearchFacility(club) {
  if ((club.country || '').toLowerCase().indexOf('united states') === -1 && club.country) return []
  const name = cleanName(baseFacilityName(club.name))
  if (!name) return []

  const { token, cookie } = await usgaToken()
  if (!token || !cookie) return []

  // Preferred: narrow the search to the state OpenGC reports.
  const stateCode = usState(club.state)
  if (stateCode) {
    const list = await usgaQuery(name, stateCode, token, cookie)
    if (list.length > 0) return list
  }

  // OpenGC's location data is sometimes wrong or unmappable — Odessa National is
  // actually in Townsend DE but filed under Elkton MD — so the state-filtered
  // search finds nothing. Retry nationwide, but only trust an unmistakable hit:
  // USGA matches on substring and carries no location signal downstream, so a
  // loose rule here would silently import another state's club as this course's
  // ratings ("pine valley" returns 13 hits nationwide, including "Alpine Valley
  // Resort"). One result, strongly name-matched, or we keep the OpenGC tees.
  const wide = await usgaQuery(name, '', token, cookie)
  if (
    wide.length === 1 &&
    jaccard(tokenSet(name), tokenSet(wide[0].fullName || wide[0].courseName || '')) >= 0.6
  ) {
    return wide
  }
  return []
}

async function usgaTeesFor(courseID) {
  const res = await fetch(`${USGA_BASE}/courseTeeInfo?CourseID=${encodeURIComponent(courseID)}`, {
    headers: { 'User-Agent': UA },
  })
  if (!res.ok) return []
  return usgaParseTees(await res.text())
}

// Scrape the gvTee table → [{name, gender, par, rating, slope}].
function usgaParseTees(html) {
  const table = html.match(/id="gvTee"[\s\S]*?<\/table>/)
  if (!table) return []
  const rows = table[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []
  const out = []
  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => stripTags(m[1]))
    if (cells.length < 6) continue
    const rating = parseFloat(cells[3])
    const slope = parseInt(cells[5], 10)
    if (!isFinite(rating) || !isFinite(slope)) continue // skips the header row too
    out.push({ name: cells[0], gender: cells[1], par: parseInt(cells[2], 10), rating, slope })
  }
  return out
}

// ==== Merge ====

// Pick the USGA course whose name best overlaps the display name (token Jaccard).
function bestUsgaMatch(displayName, usgaCourses) {
  const want = tokenSet(displayName)
  let best = null
  let bestScore = 0
  for (const c of usgaCourses) {
    const score = jaccard(want, tokenSet(c.fullName || c.courseName || ''))
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return bestScore >= 0.3 ? best : null
}

// Build the tee list straight from USGA: men's tees first, then women's — a
// women's tee whose name collides with a men's one is suffixed "(W)" so both
// stay selectable. Unique ids.
function teesFromUsga(usgaTees) {
  const isWomen = (t) => (t.gender || '').toUpperCase() === 'F'
  const men = usgaTees.filter((t) => !isWomen(t))
  const women = usgaTees.filter(isWomen)
  const menNames = new Set(men.map((t) => normTee(t.name)))
  const out = []
  const seen = new Set()
  const add = (t, women) => {
    let name = t.name || 'Tee'
    if (women && menNames.has(normTee(name))) name = `${name} (W)`
    let id = slugify(name) || 'tee'
    let n = 2
    while (seen.has(id)) id = `${slugify(name) || 'tee'}-${n++}`
    seen.add(id)
    out.push({ id, name, rating: t.rating, slope: t.slope, ratingSource: 'usga' })
  }
  men.forEach((t) => add(t, false))
  women.forEach((t) => add(t, true))
  return out
}

// ==== Naming / text helpers ====

function courseName(club, course) {
  const clubName = (club.name || '').trim()
  const courseNm = (course.name || '').trim()
  if (!clubName) return courseNm || 'Unnamed course'
  if (!courseNm || courseNm.toLowerCase() === clubName.toLowerCase()) return clubName
  if (clubName.toLowerCase().includes(courseNm.toLowerCase())) return clubName
  return `${clubName} — ${courseNm}`
}

// The facility part of a club name, dropping any " - <pairing>" suffix.
function baseFacilityName(name) {
  return String(name || '').split(' - ')[0].trim()
}

// Lowercased name with common golf stopwords removed, for USGA searching.
const STOPWORDS = new Set(['golf', 'club', 'country', 'the', 'at', 'course', 'links', 'g', 'c', 'gc', 'cc'])
function cleanName(name) {
  return tokenList(name).filter((w) => !STOPWORDS.has(w)).join(' ')
}

function tokenList(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
}

function tokenSet(s) {
  return new Set(tokenList(s).filter((w) => !STOPWORDS.has(w)))
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

function normTee(name) {
  return String(name || '').toLowerCase().replace(/\(w\)/g, '').replace(/[^a-z0-9]+/g, '').trim()
}

function stripTags(s) {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#?\w+;/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function formatLocation(o) {
  if (!o) return ''
  return [o.city, o.state].filter(Boolean).join(', ')
}

// Full US state / territory name → 2-letter code (USGA uses "US-XX").
const US_STATES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'puerto rico': 'PR',
}
function usState(state) {
  const s = String(state || '').trim()
  if (/^[A-Za-z]{2}$/.test(s)) return `US-${s.toUpperCase()}`
  const code = US_STATES[s.toLowerCase()]
  return code ? `US-${code}` : null
}
