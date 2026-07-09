# Course data: setup & deploy

Courses now live in a **shared Firestore `courses` collection** instead of
`src/data/courses.js`. You add courses two ways:

1. **Search & import** from [golfcourseapi.com](https://golfcourseapi.com) (30k+
   courses, with real pars + tee ratings/slopes), proxied through a free
   Cloudflare Worker so the API key never ships to the browser.
2. **Custom course** — type pars/ratings by hand (unchanged fallback, always
   available even if the Worker isn't set up).

`src/data/courses.js` is kept only as the **seed** for your original 10 courses.

---

## 1. Get a golfcourseapi key (free)

Sign up at <https://golfcourseapi.com> (email only). Copy your API key.
The free tier is **50 requests/day** — plenty, because a course is fetched from
the API **once**, then cached in Firestore forever (imports reuse the cached
copy; playing/viewing rounds never calls the API).

## 2. Deploy the Cloudflare Worker (the key proxy)

```bash
cd worker
npm install -g wrangler      # once
wrangler login               # opens browser, free Cloudflare account
```

Edit `worker/wrangler.toml` → set `ALLOWED_ORIGIN` to your app origins
(comma-separated), e.g.:

```toml
ALLOWED_ORIGIN = "http://localhost:5173,https://your-app.web.app"
```

Then store the key as a secret and deploy:

```bash
wrangler secret put GOLF_API_KEY     # paste your golfcourseapi key
wrangler deploy
```

Wrangler prints a URL like `https://scorepulse-golf-proxy.<you>.workers.dev`.

> **Auth scheme:** the Worker sends `Authorization: Key <your-key>` by default
> (golfcourseapi's documented format). If your account page shows a *bearer*
> token instead, set `AUTH_SCHEME = "Bearer"` in `wrangler.toml` and redeploy.

## 3. Point the app at the Worker

In `.env.local`:

```
VITE_COURSE_API_URL=https://scorepulse-golf-proxy.<you>.workers.dev
```

Rebuild/redeploy the app. (Leave this blank to hide search/import and use manual
entry only — everything else still works.)

## 4. Deploy the Firestore security rules

`firestore.rules` locks per-user data to its owner and makes `courses`
readable + add/update-able by any signed-in user (no client deletes). Deploy via
the Firebase console (Firestore → Rules → paste → Publish) or the CLI:

```bash
firebase deploy --only firestore:rules
```

## 5. Seed your existing courses (one time)

Open the app → **Courses** tab. If the catalog is empty you'll see
**"Import preset courses"** — click it to write the 10 courses from
`courses.js` into Firestore. (Idempotent; safe to re-run.)

---

## How it fits together

```
Add Round → "Find a course" → search text
   │
   ├─ Worker /search ──▶ golfcourseapi ──▶ result list
   │
Pick a result
   ├─ already in Firestore?  ── yes ─▶ use it            (0 API calls)
   └─ no ─▶ Worker /course ─▶ transform ─▶ save to Firestore ─▶ use it   (1 API call)

Everything after (rounds, handicap, stats, Best-per-hole) reads Firestore only.
```

- **Dedup:** courses are keyed `gca-<externalId>`; once anyone imports a course,
  everyone reuses it.
- **par-3 detection:** auto-set when every hole is par 3.
- **`par3` on rounds:** snapshotted when a round is saved, and back-filled from
  the catalog for older rounds on load — so handicap/achievements never need the
  live catalog.
