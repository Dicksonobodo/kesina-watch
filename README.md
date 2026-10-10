# Dixon Watch

Paste a movie link, get the movie — no ads, no pop-ups, no fake buttons.

- **Website:** Vite + React (JavaScript) + Tailwind CSS v4 + Firebase (Auth + Firestore)
- **Detection server** (`server/`): Node + Express + headless Chrome (Puppeteer) + Ghostery ad-blocker

## Run it locally

Two terminals:

```bash
# 1. the website
npm install
npm run dev            # http://localhost:5173

# 2. the detection server
npm run server:install # first time only
npm run server         # http://localhost:8787
```

The server uses the Chrome or Edge already installed on your PC (set `CHROME_PATH` in `server/.env` if it can't find one).
Visiting <http://localhost:8787/health> shows whether it found a browser.

If `VITE_API_URL` is empty in `.env`, the website shows simulated demo results instead of calling the server.

## Connect Firebase (free plan)

1. Go to <https://console.firebase.google.com> and open your project.
2. **Build → Authentication → Get started**, then enable **Email/Password** and **Google**.
3. **Build → Firestore Database → Create database** (production mode), then paste the contents of `firestore.rules` into the **Rules** tab and publish.
4. **Project settings → Your apps → Web (`</>`)** → copy the config values into `.env` (see `.env.example`).
5. Restart `npm run dev`.

When you deploy, add your domain under **Authentication → Settings → Authorized domains**.

Without Firebase keys, local dev signs you in as a **preview user** so you can explore the UI.

## How detection works

```
POST /detect { url }   (requires a signed-in Firebase user)
 1. Light pass   – download the page HTML, read title / poster / year, look for video links  (~1s)
 2. Browser pass – if none found: open the page in headless Chrome with ads + pop-ups blocked,
                   press play, and capture video requests from the network               (5–40s)
 3. Probe        – for each video: MP4 size, HLS qualities + estimated size, live, DRM
```

Known ad videos, tiny preview clips and mirror duplicates are filtered out. Results are cached for 10 minutes.
Private/internal addresses are refused so the server can't be used to reach your own network.

`dixon.watch/?u=<movie page link>` opens the site and detects straight away.

## How downloads work

Downloads run **in the user's browser** (`src/features/downloads/engine/`):

| Source | What happens |
|---|---|
| MP4 file | Fetched in 8 MB ranges (pause / resume / retry per range) |
| HLS stream | Pieces fetched 5 at a time, AES-128 decrypted with WebCrypto, converted to MP4 with mux.js and written in order. If conversion isn't possible, the original `.ts` is saved (plays in VLC) |
| Live / DRM / separate-audio streams | Not downloadable (watch only) |

- **Where bytes go:** Chrome/Edge on desktop write straight to a file the user picks (no size limit). Other browsers collect the file in memory; MP4s over 700 MB are handed to the browser's own download manager instead.
- **Direct first, relay second:** the browser fetches from the source directly when the source allows it (costs us nothing). If it refuses (no CORS, needs its own Referer), the job switches to `GET /relay` on the server, which streams the bytes through with the right headers. Relay links are signed per user, expire after 6 hours, refuse private addresses and refuse web pages.
- Keep the tab open while downloading: the site warns before closing it.

## The clean player

**Watch** opens a full-screen player (`src/features/player/`) that shows only the video:

- MP4 plays in a plain `<video>`; HLS plays with hls.js (Safari/iPhone use their built-in HLS). Multi-quality streams play from the master playlist with adaptive quality, and separate-audio streams play fine.
- If the source blocks playback from other sites, the player switches to `/relay?rw=1`, which rewrites the playlist so every piece also goes through the relay.
- Live streams: LIVE / Go live button, no seek bar.
- Controls: seek bar with buffered range and hover time, ±10s, volume, speed, quality, picture-in-picture, full screen.
- Keys: `space`/`k` play, `←`/`→` (`j`/`l`) 10s, `↑`/`↓` volume, `m` mute, `f` full screen, `p` PiP, `Esc` close. On touch screens: tap toggles controls, double-tap the sides to skip 10s.

## Live, Sports, Admin & Premium

- **Live** (`/live`): paste a concert / programme / channel page or a direct `.m3u8` link; the stream starts playing automatically. Pinned live channels sit below it.
- **Sports** (`/sports`): fixtures, live scores (refresh every 30s while matches are live), results, official broadcasters, calendar reminders (.ics) and football news. Server endpoints `/sports/matches` and `/sports/news`, cached server-side; data from ESPN's public scoreboard feed and BBC / Sky / ESPN RSS.
- **Admin** (`/admin`): live dashboard (updates every ~3s) with people online, who is watching what (live or movie), downloads, detections, errors, a one-hour online chart, an activity feed and server health. Only emails in `ADMIN_EMAILS` (server/.env) can open it. Each signed-in tab reports to `POST /presence` every 30s.
- **Continue watching:** the player saves your position every 10s (`users/{uid}/progress`); Home shows a row and reopening resumes where you stopped.
- **Subtitles:** subtitle tracks inside streams and `.vtt` / `.srt` files found on the page appear in the player's CC menu (SRT converted automatically).
- **Send to Dixon Watch:** a drag-to-bookmarks button (Profile page) and Android **Share → Dixon Watch** once installed (manifest `share_target` → `/share`).
- **Notifications** when a download finishes or fails while the tab is in the background.
- **Premium** (Paystack, ₦1,500 / 30 days by default): 3× detections, 2× parallel streams. Switched on by setting `PAYSTACK_SECRET_KEY` and `FIREBASE_SERVICE_ACCOUNT` in `server/.env`, and pointing Paystack's webhook to `https://<server>/billing/paystack/webhook`.

## Synced data (Firestore)

Everything lives under `users/{uid}` and only that user can read or write it (`firestore.rules`):

| Path | What |
|---|---|
| `users/{uid}` | profile (name, email, avatar, plan) |
| `users/{uid}/library/{id}` | `kind: "download"`: one per download (status, quality, size, device, progress) · `kind: "saved"`: titles saved for later |
| `users/{uid}/sites/{id}` | pinned pages (name, url, `kind: "live" \| "movies"`) |
| `users/{uid}/stats/shield` | all-time ads / pop-ups blocked and pages shielded |

- Downloads are written on status changes, every 10% and once a minute while running, which keeps usage well inside the free tier. Other devices show them as "Downloading on Windows · 40%". A download whose tab closed shows as interrupted, with Retry or Detect again.
- Without Firebase keys (preview mode) the same data is kept in `localStorage`.
- If Firestore refuses access (rules not published), a **Sync off** banner explains how to fix it.

## Deploy

### Website → Vercel (works without buying a domain)

1. Put the project on GitHub, then in Vercel: **Add New → Project → import the repo**. `vercel.json` already sets the build, page routing, caching and security headers (`.vercelignore` keeps `server/` out).
2. Vercel → **Settings → Environment Variables**: add every `VITE_FIREBASE_*` value from `.env`, plus `VITE_API_URL` (the detection server's https address, below) and optionally `VITE_SENTRY_DSN`.
3. Deploy. You get `https://<project>.vercel.app`.
4. Firebase console → **Authentication → Settings → Authorized domains → Add** `<project>.vercel.app` (later your real domain too). Without this, sign-in fails on the live site.

### Detection server (can't run on Vercel: it needs Chrome and long-running streams)

**Free test from your PC:**

```bash
npm run server                                        # terminal 1
npx cloudflared tunnel --url http://localhost:8787    # terminal 2 → prints https://<random>.trycloudflare.com
```

Use that https address as `VITE_API_URL` in Vercel (redeploy after changing it), and allow the site in `server/.env`:
`ALLOWED_ORIGINS=https://<project>.vercel.app,https://<project>-*.vercel.app,http://localhost:5173`.
The tunnel address changes every time it starts, and your PC must stay on.

**For real users:** `server/Dockerfile` runs on any Docker host (Oracle Always Free VM, Render, Koyeb…). Set `PUBLIC_URL`, `ALLOWED_ORIGINS`, `FIREBASE_PROJECT_ID` and a fixed `RELAY_SECRET`.

### Website → your own hosting (Apache / cPanel) instead

`npm run build` and upload `dist/` to the web root; the included `.htaccess` handles page routing.

## Reliability & monitoring

- **Errors:** any crash or unexpected error in a visitor's browser is sent to the server's `/log` endpoint and shows up in the server log as `"msg":"client error"` (page, browser, user id, stack). Add a free Sentry DSN (`VITE_SENTRY_DSN`) for a dashboard.
- **Crash screens:** a crashing page shows a friendly screen while the sidebar keeps working; old tabs reload themselves after a new deploy.
- **Server logs:** one JSON line per event. Failed requests carry a short `ref` id that the user also sees, so a user's screenshot can be matched to the log line.
- **Load protection:** at most `BROWSER_SLOTS` headless pages at once with a bounded queue ("busy, try again" instead of hanging), identical requests merged, 75s detection timeout, relay streams capped per user and overall, rate-limit memory cleaned up.
- **`/health`:** uptime, memory, queue and stream counts.

## Project layout

```
src/
  components/ui       design system (Button, Field, Poster, Badge…)
  components/layout   AppShell (sidebar + mobile tab bar), Splash
  features/auth       Firebase auth provider, sign-in page, route guard
  features/home       paste-a-link, detection progress + result
  features/library    library (Phase 4 wires it to Firestore)
  features/sites      pinned sites (Phase 4)
  features/profile    account + Shield stats
  lib/                firebase, api (detection), helpers
server/src/
  index.js            Express app: /health, /detect
  auth.js limits.js   Firebase token check, rate limit, browser concurrency
  safety.js           blocks private/internal addresses
  detect/             metadata, ad-blocker, headless browser, media probing
```

## Roadmap

- [x] **Phase 0** — foundation, design system, Google + email auth, app shell
- [x] **Phase 1** — detection server (title, poster, qualities, size, live, DRM, ad counts)
- [x] **Phase 2** — downloads (MP4 + HLS → MP4, AES-128, pause/resume, relay fallback, downloads tray)
- [x] **Phase 3** — clean player (movies + live streams, relay fallback, PiP, keyboard + touch controls)
- [x] **Phase 4** — library (downloads + saved), pinned sites and Shield stats synced with Firestore
- [ ] **Phase 5** — deploy (your hosting + free server)
