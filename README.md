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
- **Leaders** (football): top scorers, assists, goals + assists, best attack and best defence, with "show top 50". ESPN's own season tables can run a day behind, so goals and assists (the leaders and a player's page) are counted from the matches themselves: each finished match is read once and saved in the games database (`tally/<league>`), and live matches are read fresh, so a goal shows up while the game is on. The first count of a big league takes a few seconds.
- **More player stats:** the player page shows this season's numbers (ESPN, always current) and, for NBA / NFL / MLB / NHL, ESPN's full season tables. For deeper football stats (xG, passing, defending…) it links out to FBref, Sofascore, Transfermarkt and Understat in a new tab, so Dixon Watch stays open.
- **Compare players:** pick two players of the same sport for a side-by-side of this season's numbers, plus links to a full comparison on other sites.
- **Teams and players:** fixtures, results, squad, season stats, and **player photos**. NBA/NFL/MLB/NHL photos come from ESPN; football photos come from TheSportsDB (a name must match closely, and the club must agree when known, otherwise the initials badge stays).
- **Search:** one box for competitions, teams, players and today's matches.
- Data: ESPN's public feeds, TheSportsDB, BBC / Sky / ESPN RSS. All cached in the functions and at Vercel's edge.

### Home (`/`)

A photo hero, what is live right now (or the next matches today), the three things the site does (each with a photo), your game progress and daily challenge, your pinned channels, and the latest football news. Links shared into the app (`/?u=<page>`, the bookmarklet and Android Share) still go straight to Live.

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
- **Higher or Lower:** two players or clubs, one number from this season (goals, assists, points…). One wrong answer ends the run; pairs get closer the longer you last. Best streaks have weekly and all-time boards.
- **Footle:** guess the footballer in 8 tries. Each guess shows green/yellow/grey for country, position, league, club, age and shirt number (with arrows). A daily player for everyone (saved in `footle_day/<date>`) plus unlimited practice, and a shareable emoji result.
- **Club Grid:** a daily 3x3 grid; name a player who played for both the row's and the column's club (from `bothclubs.json`). Rarer players score more; 12 guesses; daily board.
- **Career Path:** a famous player's whole career, club by club with the year he joined (a Wikidata snapshot in `api/_lib/games/careers.json`, about 600 players). Wrong guesses unlock hints: country, position, birth year, then letters.
- **Keepie-Uppie:** a skill game with no questions (a canvas game in the browser). The server times the run and only accepts scores that were possible in that time.
- **Daily chest:** the first game each day also opens a chest with random bonus coins and XP (a jackpot now and then).

### Create: tournaments and line-ups for real-life games

- **Tournament creator** (`/games/tournaments`): League (once or home and away), Champions League style (groups home and away, two-legged knockouts, one-off final), World Cup style (one-off groups and knockouts, third-place match) or Knockout cup (byes added when needed). Register the team names (one by one or paste a list); groups and fixtures are drawn at random. The organiser taps any match to add or change its result (+/− buttons; a level knockout asks for the penalty shoot-out). Tables (points, goal difference, goals, head-to-head) update at once; each group's top two go through as soon as that group is finished, and the organiser can pick who goes through by hand (a tie they settled themselves, or a group that can't finish). Knockout winners move on by themselves; a stage tracker shows where the tournament is, and a league can be stopped early to crown the leader. Share the link: friends can follow, only the owner can enter scores.
- **Line-up creator** (`/games/lineups`): 14 formations, names and shirt numbers on the pitch, drag anyone anywhere for a custom shape, subs, kit colours, save, share the link, or download a PNG.
- The maths runs in the browser (`src/features/create/tourney.js`); the server stores each item in `creations/<id>` and only lets the owner change or delete it (`create.*` actions in `/api/games`).

### Chat (Game Zone only)

A message button (bottom right on every Game Zone page) opens an iMessage-style chat. On a phone it is a bottom sheet over about 60% of the screen, so you can chat while a football game is still visible behind it; on desktop it floats in the corner.

- **Find people** by the start of their name (or `name#1234` using the 4-digit tag shown next to every name). Players appear in the directory when they open the Game Zone.
- **Messages:** text, "Delivered / Read", a typing indicator, tapbacks (tap a bubble), unsend, block and report. Reports are saved in `chat_reports` (there is no screen for them yet; read them in Firestore).
- **Battle invites:** the **+** button sends a join code for any head-to-head football game, or use **Send in chat** in a battle's waiting room. The card has a Join button.
- **Games inside the chat** (full screen, turn-based, work even when the other person is offline; the result lands in the conversation):
  - **Word Swipe:** a 4x4 board, swipe letters into words for 80 seconds, both players get the same board. Words are checked on the server against the public-domain ENABLE word list (`api/_lib/games/words.txt`).
  - **Naija Whot:** the 54-card game for two (1 hold on, 2 pick two, 5 pick three, 8 suspension, 14 general market, 20 Whot). Hands and the market stay on the server.
  - **Who's Behind You?:** two players each secretly pick a real footballer (today's players plus ~300 famous names, photos from TheSportsDB) for the other. You see the one you picked, never your own. On your turn answer their yes/no question, then ask one or guess; first to guess their own player wins the round. Three rounds, the first picker alternates; 15 questions each per round, a wrong guess costs one. The picks stay on the server until the round ends.
  - **Darts:** 301, three darts a turn. You aim; the server decides where the dart lands and scores it.
- Chat polling is cheap: one small request every 20 seconds while the chat is closed (2 seconds with a conversation open). Everything goes through `/api/games` (the free plan's 12-function limit), storage is Firestore: `dir`, `chats`, `chatmsg_<id>`, `inbox_<uid>`, `chatmeta`, `cgames`. No new indexes are needed, and the browser never reads these collections directly (the Firestore rules keep them closed).
- **Head-to-Head:** two players, the same 10 questions. Invite a friend with a room code or link, or "Quick match" pairs players of a similar level. Rematch button and a rivals record.
- **Write a question:** players submit questions, an admin approves them (Games → "Review submitted questions"), and the author earns XP, coins and the Contributor badge. Three player reports hide a question until it is reviewed.
- **Where questions come from:** a hand-checked bank (`api/_lib/games/curated.js`), approved player questions, Open Trivia DB football questions (CC BY-SA, credited in the game), a Wikidata snapshot for "who played for both" (`bothclubs.json`, 16 big clubs), and questions generated from live ESPN data.
- **Fairness:** answers, scoring and the clock live on the server (`api/games.js`, one function because Vercel's free plan allows 12). Questions are sent without answers; a battle room's answers are in a Firestore collection browsers can't read.

**Setting the games up for real users** (they need a database the server can write to):
1. Firebase console → Project settings → **Service accounts → Generate new private key**. Put the whole JSON on one line in a Vercel environment variable named `FIREBASE_SERVICE_ACCOUNT` (and in `.env` if you want to run it locally against real Firestore).
2. Make sure `FIREBASE_PROJECT_ID` (or the existing `VITE_FIREBASE_PROJECT_ID`) is set in Vercel, and set `ADMIN_EMAILS` (comma-separated sign-in emails) so you can approve questions.
3. Publish the updated `firestore.rules` (Firestore → Rules). Browsers may only watch the battle room they're in.

Without `FIREBASE_SERVICE_ACCOUNT` the games run on an in-memory store. Locally (`npm run dev`) it is saved to `.dev-data/games.json` (git-ignored) so it survives restarts; on Vercel it would not work across instances, so always set the variable there. For localhost with real Firestore, put the same `FIREBASE_SERVICE_ACCOUNT` line in your local `.env` (Vercel's variables are not visible to your computer).

### Admin (`/admin`, admins only)

One page for everything. The **Games** section always works (players, activity today, predictions, battles, the question review queue), because it reads what the games store in Firestore. The **Live server** section (who is online, who is watching which stream, detections, errors, server health) joins in by itself when the Live detection server is running and `VITE_API_URL` points to it. Who counts as an admin: `ADMIN_EMAILS` on Vercel (for the games) and in `server/.env` (for the Live server).

### Profile (`/profile`)

Account details, the "Send to Dixon Watch" bookmarklet and Premium (Paystack).

## Photo credits

The pictures on the home screen, the game cards and the sign-in page are real photos from [Unsplash](https://unsplash.com/?utm_source=dixon_watch&utm_medium=referral), used under the Unsplash License (free to use, credit optional). They are saved in `public/games/` and `public/home/` (resized, about 100 KB each), so the site never calls Unsplash while running. If a photo ever fails to load, the card shows drawn artwork instead (`src/features/games/art.jsx`). The credits also appear at the bottom of the Games page (`src/features/games/photoCredits.js`).

| Game | File | Photo |
|---|---|---|
| Match Predictor | `public/games/predictor.webp` | [Alex Simpson](https://unsplash.com/photos/a-soccer-match-in-a-stadium-at-night-DOicNPBVSHs) |
| Higher or Lower | `public/games/hilo.webp` | [Homer Lopez](https://unsplash.com/photos/man-wearing-black-polo-shirt-holding-led-signage---7zuwOPAFQ) |
| Footle | `public/games/footle.webp` | [Bertrand Gabioud](https://unsplash.com/photos/grayscale-photo-of-person-wearing-hamsik-17-jersey-WHSXpNZj_8w) |
| Club Grid | `public/games/grid.webp` | [Victor](https://unsplash.com/photos/empty-football-field-in-aerial-photgraphy-raesgfwU7iM) |
| Career Path | `public/games/career.webp` | [David Jones](https://unsplash.com/photos/a-person-in-a-yellow-jacket-standing-in-a-tunnel-tyT6J-ifCmQ) |
| Keepie-Uppie | `public/games/keepy.webp` | [Ruben Leija](https://unsplash.com/photos/man-juggling-ball-on-grass-field-jY_knL-TVvA) |
| Tournament creator | `public/games/tourney.webp` | [sammy swae](https://unsplash.com/photos/soccer-team-celebrating-championship-victory-cneBYhGBUtM) |
| Line-up creator | `public/games/lineup.webp` | [Manuel Navarro](https://unsplash.com/photos/soccer-player-during-daytime-V4G9k-ev8q0) |
| Football IQ Quiz | `public/games/quiz.webp` | [Emily Morter](https://unsplash.com/photos/question-mark-light-in-graffiti-tunnel-8xAA0f9yQnE) |
| Head-to-Head | `public/games/battle.webp` | [Tobias Flyckt](https://unsplash.com/photos/woman-in-black-and-white-soccer-jersey-kicking-soccer-ball-on-green-field-during-daytime-5yNJx9NO3Yc) |
| Guess the Player | `public/games/guess.webp` | [Keyur Tandel](https://unsplash.com/photos/a-man-playing-soccer-on-the-beach-at-sunset-NBgX8uetgWs) |
| Guess the Shirt Number | `public/games/shirt.webp` | [Colin + Meg](https://unsplash.com/photos/a-display-case-with-three-red-soccer-jerseys-H7yPF5oZuYE) |
| Who Played for Both? | `public/games/clubs.webp` | [Iker Merodio](https://unsplash.com/photos/fan-holds-up-euskadi-scarf-in-stadium-crowd-lI9eifZXDwY) |
| Name the Trophy | `public/games/trophy.webp` | [My Profit Tutor](https://unsplash.com/photos/a-golden-soccer-trophy-sitting-on-top-of-a-field-bdJ8Kxaz-mQ) |
| Complete the XI | `public/games/xi.webp` | [Nguyen Thu Hoai](https://unsplash.com/photos/man-in-blue-crew-neck-t-shirt-standing-on-track-field-during-daytime-v0H-vn0BixI) |
| Write a Question | `public/games/submit.webp` | [atelierbyvineeth ...](https://unsplash.com/photos/a-fountain-pen-and-inkwell-on-a-notebook-bBV9kt-rC4c) |
| Daily challenge | `public/games/daily.webp` | [Blessing Ri](https://unsplash.com/photos/white-braille-paper-on-brown-wooden-table-mBRtqyC_Iq0) |

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
