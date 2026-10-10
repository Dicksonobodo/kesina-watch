/*
 * Live activity for the admin dashboard, kept in memory:
 * - presence: who is online right now and what they are doing (each tab checks in every 30s)
 * - counters: detections, downloads, sign-ins today
 * - a feed of recent events (detections, errors, new watchers)
 * - one point per minute of "online now" for the last hour
 * Restarting the server resets it; that's fine for live stats.
 */

const ONLINE_MS = 75_000;
const FEED_MAX = 60;
const HISTORY_POINTS = 60;

const presence = new Map(); // uid → state
const feed = [];
const history = [];
let day = todayKey();
let today = freshDay();

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function freshDay() {
  return { detections: 0, failedDetections: 0, users: new Set(), watches: 0, downloads: 0, errors: 0 };
}

function rollDay() {
  if (todayKey() !== day) {
    day = todayKey();
    today = freshDay();
  }
}

export function pushEvent(type, text, extra = {}) {
  feed.unshift({ t: Date.now(), type, text, ...extra });
  if (feed.length > FEED_MAX) feed.length = FEED_MAX;
}

const short = (s, n = 70) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function recordPresence(user, body) {
  rollDay();
  const now = Date.now();
  const prev = presence.get(user.uid);
  const watching = body.watching && typeof body.watching === "object"
    ? { title: short(String(body.watching.title ?? "")), live: Boolean(body.watching.live), site: short(String(body.watching.site ?? ""), 40) }
    : null;

  if (watching && watching.title !== prev?.watching?.title) {
    today.watches++;
    pushEvent("watch", `${displayName(user)} started watching ${watching.title}`, { live: watching.live });
  }
  const downloading = Math.max(0, Math.min(20, Number(body.downloading) || 0));
  if (downloading > (prev?.downloading ?? 0)) today.downloads += downloading - (prev?.downloading ?? 0);

  today.users.add(user.uid);
  presence.set(user.uid, {
    uid: user.uid,
    name: user.name,
    email: user.email,
    premium: Boolean(user.premium),
    device: short(String(body.device ?? ""), 20),
    page: short(String(body.page ?? "/"), 30),
    watching,
    watchingSince: watching ? (watching.title === prev?.watching?.title ? prev.watchingSince : now) : null,
    downloading,
    firstSeen: prev?.firstSeen ?? now,
    lastSeen: now,
  });
}

export function recordDetection({ ok, title, url, ms, user }) {
  rollDay();
  if (ok) today.detections++;
  else today.failedDetections++;
  pushEvent(ok ? "detect" : "detect-fail", ok ? `${displayName(user)} detected ${short(title)}` : `Detection failed: ${short(url, 60)}`, { ms });
}

export function recordClientError(message) {
  rollDay();
  today.errors++;
  pushEvent("error", short(message, 120));
}

function displayName(user) {
  if (!user) return "Someone";
  if (user.name) return user.name.split(" ")[0];
  if (user.email) return user.email.replace(/(.{2}).*(@.*)/, "$1…$2");
  return "Someone";
}

function online() {
  const now = Date.now();
  for (const [uid, p] of presence) if (now - p.lastSeen > ONLINE_MS) presence.delete(uid);
  return [...presence.values()];
}

// One point per minute for the "online" chart.
setInterval(() => {
  history.push({ t: Date.now(), online: online().length });
  if (history.length > HISTORY_POINTS) history.shift();
}, 60_000).unref();

export function snapshot(extra = {}) {
  rollDay();
  const people = online();
  return {
    at: Date.now(),
    online: people.length,
    watching: people.filter((p) => p.watching).length,
    watchingLive: people.filter((p) => p.watching?.live).length,
    downloading: people.reduce((sum, p) => sum + p.downloading, 0),
    premiumOnline: people.filter((p) => p.premium).length,
    people: people
      .sort((a, b) => Number(Boolean(b.watching)) - Number(Boolean(a.watching)) || b.lastSeen - a.lastSeen)
      .slice(0, 100),
    today: {
      detections: today.detections,
      failedDetections: today.failedDetections,
      users: today.users.size,
      watches: today.watches,
      downloads: today.downloads,
      errors: today.errors,
    },
    history: [...history, { t: Date.now(), online: people.length }],
    feed: feed.slice(0, 40),
    ...extra,
  };
}
