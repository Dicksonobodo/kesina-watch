import { cached, getJson } from "./sports.js";

/*
 * Player photos. ESPN's football feed has none, so they come from TheSportsDB's free API
 * (cut-out portraits). Results are cached for days: a player's picture doesn't change.
 * A wrong match is worse than no picture, so a name only counts when it matches closely
 * (and the club agrees when we know it).
 */

const plain = (s = "") => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const DAY = 24 * 3600_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The free API is rate limited: wait and retry once when it says so.
async function getJsonPatient(url) {
  try {
    return await getJson(url);
  } catch (err) {
    if (!/HTTP 429/.test(err.message)) throw err;
    await sleep(1500);
    return getJson(url);
  }
}

async function lookup(name) {
  const url = (n) => `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(n)}`;
  const first = await getJsonPatient(url(name));
  if (first.player?.length) return first.player;
  const stripped = plain(name);
  return stripped !== name.toLowerCase() ? (await getJsonPatient(url(stripped))).player ?? [] : [];
}

export async function getPhoto(name, team = "") {
  const clean = String(name ?? "").trim().slice(0, 60);
  if (clean.length < 3) return null;
  const key = `photo:${plain(clean)}|${plain(team)}`;
  return cached(key, 7 * DAY, async () => {
    const found = await lookup(clean);
    const want = plain(clean);
    const sameName = found.filter((p) => plain(p.strPlayer) === want);
    const club = plain(team);
    // "João Pedro" is "Joao Pedro Junqueira de Jesus" elsewhere: with the club agreeing, a name that contains ours is the same person.
    const words = want.split(" ");
    const near = club ? found.filter((p) => words.every((w) => plain(p.strPlayer).split(" ").includes(w))) : sameName;
    const sameClub = club ? near.filter((p) => plain(p.strTeam).includes(club) || club.includes(plain(p.strTeam))) : [];
    // Prefer a club match; otherwise accept an unambiguous exact name.
    const pick = sameClub[0] ?? (sameName.length === 1 && !club ? sameName[0] : null) ?? (sameName.length === 1 ? sameName[0] : null);
    const photo = pick?.strCutout || pick?.strThumb || null;
    return { value: photo, ttl: photo ? 7 * DAY : DAY };
  }).catch(() => null);
}

/** Looks up several players, a few at a time (the free API is rate limited). */
export async function getPhotos(entries) {
  const out = {};
  const queue = entries.slice(0, 16);
  const workers = Array.from({ length: 2 }, async () => {
    while (queue.length) {
      const [name, team] = queue.shift();
      out[`${name}|${team}`] = await getPhoto(name, team);
    }
  });
  await Promise.all(workers);
  return out;
}
