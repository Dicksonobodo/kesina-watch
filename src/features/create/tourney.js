/*
 * Tournament maths for the tournament creator (all in the browser; the server only stores it).
 *
 * Formats:
 *   league    everyone plays everyone (once, or home and away); the table decides it
 *   ucl       groups (home and away), top two go through to two-legged knockouts, one-off final
 *   worldcup  groups of one game each, top two go through, one-off knockouts with a third-place match
 *   cup       straight knockout (byes if the number of teams isn't a power of two)
 *
 * Only the fixtures and the scores are stored. Who plays in each knockout tie is worked out from
 * the results every time, so editing an old score moves everything after it along correctly.
 */

export const FORMATS = {
  league: { title: "League", blurb: "Everyone plays everyone. Top of the table wins." },
  ucl: { title: "Champions League style", blurb: "Groups home and away, then two-legged knockouts and a final." },
  worldcup: { title: "World Cup style", blurb: "Groups, then one-off knockouts, a third-place match and a final." },
  cup: { title: "Knockout cup", blurb: "Lose and you're out. Byes are added if needed." },
};

const uid = () => Math.random().toString(36).slice(2, 9);
const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const nextPow2 = (n) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));
export const roundName = (teamsInRound) => (teamsInRound === 2 ? "Final" : teamsInRound === 4 ? "Semi-finals" : teamsInRound === 8 ? "Quarter-finals" : `Round of ${teamsInRound}`);
export const groupLetter = (i) => String.fromCharCode(65 + i);

/** Round robin by the circle method; a bye is added for an odd number of teams. */
export function roundRobin(ids, legs = 1) {
  const list = ids.length % 2 ? [...ids, null] : [...ids];
  const n = list.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a && b) pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()); // keep the first team fixed, rotate the rest
  }
  if (legs === 2) return [...rounds, ...rounds.map((pairs) => pairs.map(([a, b]) => [b, a]))];
  return rounds;
}

/** Which group counts work for this many teams (two from each group go through, so 2, 4 or 8 groups). */
export function groupOptions(teamCount) {
  return [2, 4, 8].filter((g) => teamCount >= g * 2 && teamCount <= g * 6);
}

/**
 * Builds a new tournament.
 * opts: { name, format, teams: [names], legs (league 1|2), groups (count), cupLegs (1|2), shuffle: bool }
 */
export function createTournament({ name, format, teams, legs = 1, groups = 2, cupLegs = 1, draw = true }) {
  const list = teams.map((n) => ({ id: uid(), name: n.trim() })).filter((t) => t.name);
  const ids = (draw ? shuffle(list) : list).map((t) => t.id);
  const t = { v: 1, name: name.trim(), format, teams: list, legs, scores: {}, fixtures: [], groups: null, ko: null, createdAt: Date.now() };

  if (format === "league") {
    roundRobin(ids, legs).forEach((pairs, r) => pairs.forEach(([home, away], i) => t.fixtures.push({ id: `L${r + 1}-${i + 1}`, stage: "league", round: r + 1, home, away })));
    return t;
  }

  if (format === "cup") {
    const size = nextPow2(ids.length);
    const byes = size - ids.length;
    // the first `byes` ties get a bye, spread across the draw
    const slots = [];
    let k = 0;
    for (let i = 0; i < size / 2; i++) {
      const a = ids[k++];
      const b = i < byes ? null : ids[k++];
      slots.push([a, b]);
    }
    const first = slots.map(([a, b], i) => ({ id: `K1-${i + 1}`, a: { type: "team", id: a }, b: b ? { type: "team", id: b } : { type: "bye" }, legs: size === 2 ? 1 : cupLegs }));
    t.ko = buildRounds(first, size, cupLegs, false);
    return t;
  }

  // ucl / worldcup: groups first
  const g = groups;
  const groupLists = Array.from({ length: g }, () => []);
  ids.forEach((id, i) => groupLists[i % g].push(id)); // one by one into each group, like a draw
  t.groups = groupLists;
  const groupLegs = format === "ucl" ? 2 : 1;
  groupLists.forEach((members, gi) => {
    roundRobin(members, groupLegs).forEach((pairs, r) => pairs.forEach(([home, away], i) => t.fixtures.push({ id: `G${gi + 1}-${r + 1}-${i + 1}`, stage: "group", group: gi, round: r + 1, home, away })));
  });
  // Group winners meet runners-up from the paired group, and the two halves of the draw keep them apart.
  const top = [];
  const bottom = [];
  for (let i = 0; i < g; i += 2) {
    top.push([{ type: "group", group: i, pos: 1 }, { type: "group", group: i + 1, pos: 2 }]);
    bottom.push([{ type: "group", group: i + 1, pos: 1 }, { type: "group", group: i, pos: 2 }]);
  }
  const koLegs = format === "ucl" ? 2 : 1;
  const first = [...top, ...bottom].map(([a, b], i) => ({ id: `K1-${i + 1}`, a, b, legs: g * 2 === 2 ? 1 : koLegs }));
  t.ko = buildRounds(first, g * 2, koLegs, format === "worldcup");
  return t;
}

function buildRounds(firstTies, size, legs, thirdPlace) {
  const rounds = [{ name: roundName(size), ties: firstTies }];
  let teamsIn = size / 2;
  let prev = firstTies;
  let r = 2;
  while (teamsIn >= 2) {
    const ties = [];
    for (let i = 0; i < prev.length; i += 2) {
      const final = teamsIn === 2;
      ties.push({ id: `K${r}-${i / 2 + 1}`, a: { type: "winner", tie: prev[i].id }, b: { type: "winner", tie: prev[i + 1].id }, legs: final ? 1 : legs });
    }
    rounds.push({ name: roundName(teamsIn), ties });
    prev = ties;
    teamsIn /= 2;
    r++;
  }
  let third = null;
  if (thirdPlace && rounds.length >= 2) {
    const semis = rounds[rounds.length - 2].ties;
    if (semis.length === 2) third = { id: "K3P", a: { type: "loser", tie: semis[0].id }, b: { type: "loser", tie: semis[1].id }, legs: 1 };
  }
  return { rounds, third };
}

/* ---------- results ---------- */

export const played = (s) => s && Number.isFinite(s.h) && Number.isFinite(s.a);

/** A league table for some teams over some fixtures. */
export function table(t, teamIds, fixtures) {
  const rows = new Map(teamIds.map((id) => [id, { id, name: teamName(t, id), p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [] }]));
  for (const f of fixtures) {
    const s = t.scores[f.id];
    if (!played(s)) continue;
    const h = rows.get(f.home);
    const a = rows.get(f.away);
    if (!h || !a) continue;
    h.p++;
    a.p++;
    h.gf += s.h;
    h.ga += s.a;
    a.gf += s.a;
    a.ga += s.h;
    if (s.h > s.a) (h.w++, a.l++, (h.pts += 3), h.form.push("W"), a.form.push("L"));
    else if (s.h < s.a) (a.w++, h.l++, (a.pts += 3), a.form.push("W"), h.form.push("L"));
    else (h.d++, a.d++, h.pts++, a.pts++, h.form.push("D"), a.form.push("D"));
  }
  const list = [...rows.values()].map((r) => ({ ...r, gd: r.gf - r.ga, form: r.form.slice(-5) }));
  // Points, then goal difference, then goals scored, then the head-to-head points, then name.
  const h2h = (x, y) => {
    let px = 0;
    let py = 0;
    for (const f of fixtures) {
      const s = t.scores[f.id];
      if (!played(s)) continue;
      const pair = (f.home === x && f.away === y) || (f.home === y && f.away === x);
      if (!pair) continue;
      const xs = f.home === x ? s.h : s.a;
      const ys = f.home === x ? s.a : s.h;
      if (xs > ys) px += 3;
      else if (xs < ys) py += 3;
      else (px++, py++);
    }
    return py - px;
  };
  return list.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || h2h(x.id, y.id) || x.name.localeCompare(y.name));
}

export const teamName = (t, id) => t.teams.find((x) => x.id === id)?.name ?? "?";
export const groupFixtures = (t, gi) => t.fixtures.filter((f) => f.stage === "group" && f.group === gi);
export const groupTable = (t, gi) => table(t, t.groups[gi], groupFixtures(t, gi));
export const groupsDone = (t) => t.fixtures.filter((f) => f.stage === "group").every((f) => played(t.scores[f.id]));
export const groupDone = (t, gi) => groupFixtures(t, gi).every((f) => played(t.scores[f.id]));

/**
 * Who goes through from a group: the organiser's own pick if they made one (for a tie on points,
 * or a group that can't be finished), otherwise the top two of the table once the group is over.
 * Returns { ids: [first, second], manual } or null while it isn't decided yet.
 */
export function qualifiers(t, gi) {
  const pick = t.qualifiers?.[gi];
  if (Array.isArray(pick) && pick.length === 2 && pick[0] && pick[1]) return { ids: pick, manual: true };
  if (!groupDone(t, gi)) return null;
  const rows = groupTable(t, gi);
  return rows.length >= 2 ? { ids: [rows[0].id, rows[1].id], manual: false } : null;
}

/** Where the tournament is: "Group stage", "Quarter-finals", "Final", "Finished"… */
export function stage(t) {
  if (champion(t).final) return "Finished";
  if (t.format === "league") return "League";
  if (t.groups && !t.groups.every((_, gi) => qualifiers(t, gi))) return "Group stage";
  const memo = new Map();
  for (const round of t.ko?.rounds ?? []) if (round.ties.some((tie) => !resolveTie(t, tie, memo).done)) return round.name;
  return "Final";
}

/** The legs (matches) of a tie, home team first. */
export const tieLegs = (tie) => (tie.legs === 2 ? [`${tie.id}-1`, `${tie.id}-2`] : [`${tie.id}-1`]);

/** Who is in a tie and who went through. */
export function resolveTie(t, tie, memo = new Map()) {
  if (memo.has(tie.id)) return memo.get(tie.id);
  const side = (src) => resolveSource(t, src, memo);
  const A = side(tie.a);
  const B = side(tie.b);
  const out = { tie, a: A, b: B, legs: [], winner: null, loser: null, aggA: 0, aggB: 0, needsPens: false, done: false };
  if (A.bye || B.bye) {
    out.winner = A.bye ? B.id : A.id;
    out.done = Boolean(out.winner);
    out.bye = true;
    memo.set(tie.id, out);
    return out;
  }
  const ids = tieLegs(tie);
  ids.forEach((legId, i) => {
    const home = i === 0 ? A : B; // second leg at the other team's ground
    const away = i === 0 ? B : A;
    const s = t.scores[legId];
    out.legs.push({ id: legId, home, away, score: s ?? null, n: i + 1 });
    if (played(s)) {
      if (i === 0) (out.aggA += s.h, (out.aggB += s.a));
      else (out.aggB += s.h, (out.aggA += s.a));
    }
  });
  const allPlayed = A.id && B.id && ids.every((id) => played(t.scores[id]));
  if (allPlayed) {
    if (out.aggA !== out.aggB) out.winner = out.aggA > out.aggB ? A.id : B.id;
    else {
      out.needsPens = true;
      const last = t.scores[ids.at(-1)];
      const lastHomeIsA = ids.length === 1;
      if (Number.isFinite(last?.ph) && Number.isFinite(last?.pa) && last.ph !== last.pa) {
        const homeWon = last.ph > last.pa;
        out.winner = (homeWon === lastHomeIsA) ? A.id : B.id;
      }
    }
    if (out.winner) out.loser = out.winner === A.id ? B.id : A.id;
    out.done = Boolean(out.winner);
  }
  memo.set(tie.id, out);
  return out;
}

/** A place in the draw: a team, a bye, "Group A winner", "Winner of QF1"… → { id, label, bye } */
export function resolveSource(t, src, memo) {
  if (!src) return { id: null, label: "TBD" };
  if (src.type === "bye") return { id: null, label: "Bye", bye: true };
  if (src.type === "team") return { id: src.id, label: teamName(t, src.id) };
  if (src.type === "group") {
    const label = `${src.pos === 1 ? "Winner" : "Runner-up"} Group ${groupLetter(src.group)}`;
    const q = qualifiers(t, src.group);
    const id = q?.ids[src.pos - 1];
    return id ? { id, label: teamName(t, id), from: label } : { id: null, label };
  }
  const tie = findTie(t, src.tie);
  const r = tie ? resolveTie(t, tie, memo) : null;
  const label = `${src.type === "winner" ? "Winner" : "Loser"} ${tieTitle(t, src.tie)}`;
  const id = r ? (src.type === "winner" ? r.winner : r.loser) : null;
  return id ? { id, label: teamName(t, id), from: label } : { id: null, label };
}

export function findTie(t, id) {
  if (!t.ko) return null;
  if (t.ko.third?.id === id) return t.ko.third;
  for (const round of t.ko.rounds) for (const tie of round.ties) if (tie.id === id) return tie;
  return null;
}

export function tieTitle(t, id) {
  if (t.ko?.third?.id === id) return "Third-place match";
  for (const round of t.ko?.rounds ?? []) {
    const i = round.ties.findIndex((x) => x.id === id);
    if (i >= 0) return round.ties.length === 1 ? round.name : `${short(round.name)} ${i + 1}`;
  }
  return id;
}
const short = (name) => ({ "Quarter-finals": "Quarter-final", "Semi-finals": "Semi-final", Final: "Final" })[name] ?? name;

/** Who won it (or who leads a league that isn't finished). */
export function champion(t) {
  if (t.format === "league") {
    const all = t.ended || t.fixtures.every((f) => played(t.scores[f.id]));
    const top = table(t, t.teams.map((x) => x.id), t.fixtures)[0];
    return { id: top?.id ?? null, name: top?.name ?? null, final: all };
  }
  const final = t.ko?.rounds.at(-1)?.ties[0];
  if (!final) return { id: null, final: false };
  const r = resolveTie(t, final);
  return { id: r.winner, name: r.winner ? teamName(t, r.winner) : null, final: Boolean(r.winner) };
}

/** Short progress line for lists: "12 of 30 matches played". */
export function progress(t) {
  const groupOrLeague = t.fixtures.length;
  const doneGL = t.fixtures.filter((f) => played(t.scores[f.id])).length;
  let ko = 0;
  let koDone = 0;
  const memo = new Map();
  const ties = [...(t.ko?.rounds ?? []).flatMap((r) => r.ties), ...(t.ko?.third ? [t.ko.third] : [])];
  for (const tie of ties) {
    if (resolveTie(t, tie, memo).bye) continue; // a bye isn't a match
    for (const id of tieLegs(tie)) (ko++, played(t.scores[id]) && koDone++);
  }
  return { played: doneGL + koDone, total: groupOrLeague + ko };
}
