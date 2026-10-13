# Dixon Watch

Live streams with no ads, and live scores for football and other sports.

- **Website:** Vite + React (JavaScript) + Tailwind CSS v4 + Firebase (Auth + Firestore)
- **Sports API:** Vercel functions in `api/sports/*` (no server to run)
- **Detection server** (`server/`, only for Live): Node + Express + headless Chrome (Puppeteer) + Ghostery ad-blocker

## Run it locally

```bash
npm install
npm run dev            # http://localhost:5173 (also serves the Sports API)

# Live also needs the detection server, in a second terminal:
npm run server:install # first time only
npm run server         # http://localhost:8787
```

The server uses the Chrome or Edge already installed on your PC (set `CHROME_PATH` in `server/.env` if it can't find one).
Visiting <http://localhost:8787/health> shows whether it found a browser. Put the server's address in `VITE_API_URL` in `.env`.

## Connect Firebase (free plan)

1. Go to <https://console.firebase.google.com> and open your project.
2. **Build → Authentication → Get started**, then enable **Email/Password** and **Google**.
3. **Build → Firestore Database → Create database** (production mode), then paste the contents of `firestore.rules` into the **Rules** tab and publish.
4. **Project settings → Your apps → Web (`</>`)** → copy the config values into `.env` (see `.env.example`).
5. Restart `npm run dev`.

When you deploy, add your domain under **Authentication → Settings → Authorized domains**.
Without Firebase keys, local dev signs you in as a **preview user** so you can explore the UI.

## What's in it

### Sports (`/sports`)

- **Five sports:** football, basketball, NFL, baseball and ice hockey, with 35+ football competitions (Premier League, Champions League, LaLiga, Serie A, Bundesliga, Ligue 1, Nigerian league, AFCON, MLS and more).
- **Matches:** live scores (refresh every 30s while games are live), fixtures and results by day, official broadcasters, calendar reminders (.ics).
- **Tables:** league tables per competition (conferences / groups for US sports), with qualification and relegation colours.
- **Match centre:** timeline, line-ups on a pitch, team stats, top performers, form, head-to-head, **highlight clips** and news. Other sports show team stats, performers, highlights and scoring plays.
- **Leaders** (football): top scorers, assists, goals + assists, best attack and best defence, with "show top 50".
- **More player stats:** the player page shows this season's numbers (ESPN, always current) and, for NBA / NFL / MLB / NHL, ESPN's full season tables. For deeper football stats (xG, passing, defending…) it links out to FBref, Sofascore, Transfermarkt and Understat in a new tab, so Dixon Watch stays open.
- **Compare players:** pick two players of the same sport for a side-by-side of this season's numbers, plus links to a full comparison on other sites.
- **Teams and players:** fixtures, results, squad, season stats, and **player photos**. NBA/NFL/MLB/NHL photos come from ESPN; football photos come from TheSportsDB (a name must match closely, and the club must agree when known, otherwise the initials badge stays).
- **Search:** one box for competitions, teams, players and today's matches.
- Data: ESPN's public feeds, TheSportsDB, BBC / Sky / ESPN RSS. All cached in the functions and at Vercel's edge.

### Live (`/live`)

Paste a concert, programme or channel page, an event page with several feeds, or a direct `.m3u8` / IPTV `.m3u` link.

- **Several streams on one page** are all found and listed **with their titles**. Tap one to watch it; close the player (or use the streams menu inside it) to watch another. Only one plays at a time.
- **Where titles come from:** the text of the channel button the stream came from, a name next to the address in the page's script (`{"name":"Arise News","url":"…m3u8"}`), the player's iframe/frame title, `#EXTINF` names in channel lists, then a readable name from the stream's address.
- **Channel buttons and tabs** are clicked through (up to 8, 14 seconds) so every stream the page can show gets requested. Buttons that would leave the page are skipped.
- **Channel lists** (IPTV `.m3u`): up to 16 working channels are probed and listed.
- A single live stream starts playing straight away; a page with several waits for you to pick.
- The player is full screen, ad-free, with live-edge button, quality menu, subtitles, picture-in-picture and keyboard shortcuts. If a source blocks playback from other sites, the stream goes through the server's relay.
- Pinned live pages sit below the box and under **Pinned** (`/sites`).

### Games (`/games`)

Quizzes, predictions and head-to-head battles with XP, levels, daily streaks, coins, achievements and weekly leaderboards.

- **Match Predictor:** pick home / draw / away (and optionally the exact score) before kickoff. 3 points for the result, 3 more for the exact score; Champions League nights count ×2, World Cup and Euros ×3. Kickoff times and results come from the server's own fixtures. Finished matches are scored when you open the page. Friends leagues use a 6-letter code (up to 30 players) with a weekly and total table.
- **Football IQ Quiz:** 10 questions, 15 seconds each, 4 difficulty levels; faster answers score more.
- **Daily challenge:** a daily quiz plus a mystery player, the same for everyone, one try each, with a daily board.
- **Guess the Player:** clues are revealed one at a time by the server (100 points with one clue, down to 10).
- **Guess the Shirt Number, Who Played for Both?, Name the Trophy, Complete the XI:** the same engine with different question builders.
- **Head-to-Head:** two players, the same 10 questions. Invite a friend with a room code or link, or "Quick match" pairs players of a similar level. Rematch button and a rivals record.
- **Write a question:** players submit questions, an admin approves them (Games → "Review submitted questions"), and the author earns XP, coins and the Contributor badge. Three player reports hide a question until it is reviewed.
- **Where questions come from:** a hand-checked bank (`api/_lib/games/curated.js`), approved player questions, Open Trivia DB football questions (CC BY-SA, credited in the game), a Wikidata snapshot for "who played for both" (`bothclubs.json`, 16 big clubs), and questions generated from live ESPN data.
- **Fairness:** answers, scoring and the clock live on the server (`api/games.js`, one function because Vercel's free plan allows 12). Questions are sent without answers; a battle room's answers are in a Firestore collection browsers can't read.

**Setting the games up for real users** (they need a database the server can write to):
1. Firebase console → Project settings → **Service accounts → Generate new private key**. Put the whole JSON on one line in a Vercel environment variable named `FIREBASE_SERVICE_ACCOUNT` (and in `.env` if you want to run it locally against real Firestore).
2. Make sure `FIREBASE_PROJECT_ID` (or the existing `VITE_FIREBASE_PROJECT_ID`) is set in Vercel, and set `ADMIN_EMAILS` (comma-separated sign-in emails) so you can approve questions.
3. Publish the updated `firestore.rules` (Firestore → Rules). Browsers may only watch the battle room they're in.

Without `FIREBASE_SERVICE_ACCOUNT` the games run on an in-memory store (fine for trying them locally in preview mode, but nothing is saved between restarts, and it won't work across several Vercel instances).

### Profile (`/profile`)

Account details, the "Send to Dixon Watch" bookmarklet and Premium (Paystack).

## Synced data (Firestore)

Everything lives under `users/{uid}` and only that user can read or write it (`firestore.rules`):

| Path | What |
|---|---|
| `users/{uid}` | profile (name, email, avatar, plan) |
| `users/{uid}/sites/{id}` | pinned live pages (name, url) |
| `users/{uid}/stats/shield` | all-time ads / pop-ups blocked and pages shielded |

Without Firebase keys (preview mode) the same data is kept in `localStorage`.

## Deploy

### Website → Vercel

1. Put the project on GitHub, then in Vercel: **Add New → Project → import the repo**. `vercel.json` already sets the build, page routing, caching and security headers (`.vercelignore` keeps `server/` out).
2. Vercel → **Settings → Environment Variables**: add every `VITE_FIREBASE_*` value from `.env`, plus `VITE_API_URL` (the detection server's https address, only needed for Live) and optionally `VITE_SENTRY_DSN`.
3. Deploy. You get `https://<project>.vercel.app`.
4. Firebase console → **Authentication → Settings → Authorized domains → Add** your Vercel domain.

Sports works as soon as the website is deployed. Live needs the detection server.

### Detection server (Live only; can't run on Vercel: it needs Chrome and long-running streams)

**Free test from your PC:**

```bash
npm run server                                        # terminal 1
npx cloudflared tunnel --url http://localhost:8787    # terminal 2 → prints https://<random>.trycloudflare.com
```

Use that https address as `VITE_API_URL` in Vercel (redeploy after changing it), and allow the site in `server/.env`:
`ALLOWED_ORIGINS=https://<project>.vercel.app,https://<project>-*.vercel.app,http://localhost:5173`.
The tunnel address changes every time it starts, and your PC must stay on.

**For real users (24/7):** a small VPS with [deploy/README.md](deploy/README.md).

### Your own hosting (Apache / cPanel) instead

`npm run build` and upload `dist/`; the included `.htaccess` handles page routing.

## Reliability & monitoring

- **Errors:** crashes in a visitor's browser are sent to the server's `/log` endpoint (shown in its log as `"msg":"client error"`). Add a free Sentry DSN (`VITE_SENTRY_DSN`) for a dashboard.
- **Crash screens:** a crashing page shows a friendly screen while the sidebar keeps working.
- **Load protection (server):** at most `BROWSER_SLOTS` headless pages at once with a bounded queue, identical requests merged, 75s detection timeout, relay streams capped per user and overall.
- **Sports API:** every source is cached, a failing source serves the last good copy, and a first-time failure is retried on the next request.

## Project layout

```
src/
  components/ui       design system (Button, Field, Badge…)
  components/layout   AppShell (sidebar + mobile tab bar), Splash
  features/auth       Firebase auth provider, sign-in page, route guard
  features/sports     scores, match centre, tables, leaders, search, player photos
  features/live       Live page
  features/home       detection progress, result and the streams list
  features/player     the clean player
  features/sites      pinned pages
  features/games      game zone: hub, quiz runner, predictor, battles, boards, shop
  features/profile    account page
api/sports            Vercel functions behind the Sports page
api/games.js          the one games function; logic in api/_lib/games/
server/src
  index.js            Express app: /health, /detect, /relay, billing
  detect/             metadata, ad-blocker, headless browser, media probing, stream grouping (streams.js)
```
