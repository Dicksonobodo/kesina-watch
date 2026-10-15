import { readFileSync } from "node:fs";
import { cached, leagueById, leagueDay, yyyymmdd } from "../sports.js";
import { getLeaders } from "../football.js";
import { getPlayer } from "../football.js";
import { getMatch } from "../match.js";
import { TROPHY_QUESTIONS } from "./curated.js";
import { GameError, plain, sample, shuffle } from "./util.js";

/*
 * Question builders that need data beyond the text bank:
 *  - Who played for both clubs?  (Wikidata snapshot in bothclubs.json)
 *  - Guess the shirt number      (current players from the league leaders, number from ESPN)
 *  - Complete the Starting XI    (a recent real match's line-up)
 *  - Name the trophy             (curated)
 */

/* ---------- who played for both clubs ---------- */

let clubData;
function loadClubs() {
  clubData ??= JSON.parse(readFileSync(new URL("./bothclubs.json", import.meta.url), "utf8"));
  return clubData;
}

const clubDifficulty = (sl) => (sl >= 80 ? "easy" : sl >= 50 ? "medium" : "hard");

export function bothClubsQuestions(count, rng = Math.random) {
  const { clubs, players } = loadClubs();
  const byPair = new Map();
  for (const p of players) {
    for (let i = 0; i < p.clubs.length; i++) {
      for (let j = i + 1; j < p.clubs.length; j++) {
        const key = `${p.clubs[i]}|${p.clubs[j]}`;
        byPair.set(key, [...(byPair.get(key) ?? []), p]);
      }
    }
  }
  const pairs = [...byPair.entries()].filter(([, list]) => list.some((p) => p.sl >= 40));
  const out = [];
  const usedPlayers = new Set();
  for (const [key, list] of shuffle(pairs, rng)) {
    if (out.length >= count) break;
    const [a, b] = key.split("|");
    const known = list.filter((p) => p.sl >= 40 && !usedPlayers.has(p.name));
    if (!known.length) continue;
    // Better-known players are more likely to be the answer.
    const answer = known.sort((x, y) => y.sl - x.sl).slice(0, 4)[Math.floor(rng() * Math.min(4, known.length))];
    // Wrong answers played for one of the two clubs but not both.
    const wrongPool = players.filter((p) => p.sl >= 40 && p.name !== answer.name && p.clubs.filter((c) => c === a || c === b).length === 1 && !p.clubs.includes(a) !== !p.clubs.includes(b));
    const wrong = sample(wrongPool, 3, rng);
    if (wrong.length < 3) continue;
    usedPlayers.add(answer.name);
    out.push({
      id: `b${plain(answer.name).replace(/ /g, "")}${a}${b}`,
      text: `Which of these players played for both ${clubs[a]} and ${clubs[b]}?`,
      options: [answer.name, ...wrong.map((w) => w.name)],
      answer: 0,
      category: "both-clubs",
      difficulty: clubDifficulty(answer.sl),
      source: "wikidata",
    });
  }
  return out;
}

/* ---------- guess the shirt number ---------- */

const POOL_LEAGUES = ["eng.1", "esp.1", "ita.1", "ger.1", "fra.1"];

/** Current players (top scorers and assisters of the big five leagues). */
export const playerPool = () =>
  cached("games:playerpool", 12 * 3600_000, async () => {
    const seen = new Set();
    const pool = [];
    for (const league of POOL_LEAGUES) {
      const leaders = await getLeaders(league).catch(() => null);
      for (const p of [...(leaders?.scorers ?? []), ...(leaders?.assists ?? []), ...(leaders?.contributions ?? [])]) {
        if (!p.id || seen.has(p.id)) continue;
        seen.add(p.id);
        pool.push({ id: String(p.id), league, name: p.name, team: p.team });
      }
    }
    // The player data comes from ESPN; if it can't be reached, say so plainly (not "something went wrong").
    if (pool.length < 10) throw new GameError("Player data isn't available right now. Try again in a minute.", 503);
    return { value: pool };
  });

export async function shirtQuestions(count, rng = Math.random) {
  const pool = await playerPool();
  const picks = sample(pool, count * 2, rng);
  const details = await Promise.all(picks.map((p) => getPlayer(p.league, p.id).catch(() => null)));
  const out = [];
  for (const d of details) {
    if (!d?.jersey || out.length >= count) continue;
    const number = Number(d.jersey);
    if (!Number.isInteger(number) || number < 1 || number > 99) continue;
    const common = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 17, 19, 20, 21, 22, 23, 24, 25, 27, 30, 77];
    const wrong = sample(common.filter((n) => n !== number), 3, rng);
    out.push({
      id: `s${d.id}`,
      text: `What shirt number does ${d.name} wear at ${d.team}?`,
      options: [String(number), ...wrong.map(String)],
      answer: 0,
      category: "shirt-number",
      difficulty: number <= 11 ? "easy" : number <= 30 ? "medium" : "hard",
      source: "espn",
      meta: { kind: "player", name: d.name, team: d.team },
    });
  }
  return out;
}

/* ---------- name the trophy ---------- */

export const trophyQuestions = (count, rng = Math.random) => sample(TROPHY_QUESTIONS, count, rng);

/* ---------- complete the starting XI ---------- */

const XI_LEAGUES = ["eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "uefa.champions"];

/** A finished match from the last few days that has full line-ups. */
async function recentLineupMatch(rng) {
  const days = [1, 2, 3, 4, 5, 6];
  const candidates = [];
  for (const back of days) {
    const key = yyyymmdd(new Date(Date.now() - back * 86_400_000));
    for (const id of XI_LEAGUES) {
      const league = leagueById(id);
      const matches = await leagueDay(league, key).catch(() => []);
      for (const m of matches) if (m.state === "post") candidates.push({ league: id, id: m.id });
    }
    if (candidates.length >= 12) break;
  }
  for (const c of shuffle(candidates, rng)) {
    const match = await getMatch({ league: c.league, id: c.id }).catch(() => null);
    if (match?.lineups?.home?.starters?.length >= 11 && match.lineups.away?.starters?.length >= 11) return match;
  }
  return null;
}

export const xiMatch = (seed, rng) => cached(`games:xi:${seed}`, 6 * 3600_000, async () => ({ value: await recentLineupMatch(rng) }));

export async function xiQuestions(seed, rng = Math.random) {
  const match = await xiMatch(seed, rng);
  if (!match) return [];
  const side = rng() < 0.5 ? "home" : "away";
  const team = match[side];
  const lineup = match.lineups[side];
  const other = match.lineups[side === "home" ? "away" : "home"];
  const starters = lineup.starters;
  // Hide three outfield players from different lines when possible.
  const outfield = shuffle(starters.filter((p) => !/^(G|GK)/i.test(p.position)), rng);
  const hidden = [];
  const rows = new Set();
  for (const p of outfield) {
    if (hidden.length >= 3) break;
    if (!rows.has(p.row) || outfield.length - hidden.length <= 3 - hidden.length) {
      hidden.push(p);
      rows.add(p.row);
    }
  }
  const xi = {
    team: team.name,
    opponent: match[side === "home" ? "away" : "home"].name,
    formation: lineup.formation,
    date: match.kickoff,
    // Layout rows from goalkeeper to forwards; hidden players have no name.
    players: starters
      .slice()
      .sort((a, b) => a.row - b.row || a.lane - b.lane)
      .map((p) => ({ position: p.position, number: p.number, name: hidden.includes(p) ? null : p.short || p.name, slot: hidden.indexOf(p), row: p.row, lane: p.lane })),
  };
  const names = [...starters, ...lineup.bench, ...other.starters].map((p) => p.short || p.name);
  return hidden.map((p, i) => {
    const correct = p.short || p.name;
    const wrongPool = [...new Set(names.filter((n) => n !== correct && !hidden.some((h) => (h.short || h.name) === n)))];
    return {
      id: `x${match.id}-${p.number}`,
      text: `Who played ${positionName(p.position)} for ${team.name} against ${xi.opponent}?`,
      options: [correct, ...sample(wrongPool, 3, rng)],
      answer: 0,
      category: "starting-xi",
      difficulty: "medium",
      source: "espn",
      meta: { kind: "xi", xi, slot: i, shirt: p.number, position: p.position },
    };
  });
}

function positionName(abbr = "") {
  const a = abbr.toUpperCase();
  if (/^(CB|CD)/.test(a)) return "centre-back";
  if (/^(RB|RWB)/.test(a)) return "right-back";
  if (/^(LB|LWB)/.test(a)) return "left-back";
  if (/^DM/.test(a)) return "defensive midfield";
  if (/^AM/.test(a)) return "attacking midfield";
  if (/^(CM|M)/.test(a)) return "central midfield";
  if (/^RM|^RW/.test(a)) return "on the right";
  if (/^LM|^LW/.test(a)) return "on the left";
  if (/^(F|CF|ST|S)/.test(a)) return "up front";
  return "in midfield";
}
