import { AuthError, identify } from "./_lib/games/auth.js";
import { buy, equip, getProfile, markSeen, peekProfile, setName, viewProfile } from "./_lib/games/profile.js";
import { boardNames, getBoard } from "./_lib/games/leaderboard.js";
import { answerQuestion, currentQuestion, dailyStatus, KINDS, startSession } from "./_lib/games/sessions.js";
import { guessAnswer, guessGiveUp, guessReveal, startGuess } from "./_lib/games/guess.js";
import { answerHilo, startHilo } from "./_lib/games/hilo.js";
import { footlePlayers, giveUpFootle, guessFootle, startFootle } from "./_lib/games/footle.js";
import { careerNames, getGrid, guessGrid } from "./_lib/games/clubgames.js";
import { blockPerson, editMessage, openChat, reactTo, reportPerson, searchPeople, sendMessage, syncChat, syncDirectory, unsendMessage } from "./_lib/games/chat.js";
import { createGame, getGame, moveGame, rematch as rematchGame } from "./_lib/games/cgames.js";
import { behindPlayers } from "./_lib/games/cg/behind.js";
import { deleteCreation, getCreation, listCreations, saveCreation } from "./_lib/games/creations.js";
import { addFeatured, listFeatured, removeFeatured } from "./_lib/games/featured.js";
import { finishKeepy, startKeepy } from "./_lib/games/keepy.js";
import { answerRoom, cancelRoom, createRoom, friendsRanking, getRoom, joinRoom, quickMatch, rematch, tickRoom } from "./_lib/games/battle.js";
import { COMPETITIONS, createLeague, fixtures, joinLeague, leaveLeague, myLeagues, myPredictions, place, settle } from "./_lib/games/predictor.js";
import { decideQuestion, pendingQuestions, reportQuestion, submitQuestion } from "./_lib/games/questions.js";
import { getStore, usesFirestore } from "./_lib/games/store.js";
import { adminStats } from "./_lib/games/adminstats.js";
import { parseServiceAccount, projectIdFromEnv } from "./_lib/games/admin.js";
import { GameError, msToWeekEnd, rateLimit } from "./_lib/games/util.js";

/*
 * One function for every game action (Vercel's free plan allows only 12 functions, so the games
 * share this one). POST /api/games { action: "quiz.start", ... } with the player's Firebase
 * ID token in the Authorization header.
 */

// Calls that don't count as "playing today" for the admin numbers.
const NOT_ACTIVITY = new Set(["me", "admin.stats", "home.summary", "lb.get", "q.pending", "career.names", "footle.players", "grid.get", "chat.sync", "chat.search", "chat.open", "cg.get", "live.featured", "create.list", "create.get", "behind.players"]);

const ACTIONS = {
  /* who am I (no database access: used by the sidebar to show the Admin link) */
  me: async (who) => ({ admin: who.admin }),

  /* home screen: a player's summary if they have one (does not create a profile) */
  "home.summary": async (who) => {
    const p = await peekProfile(who);
    if (!p) return { profile: null };
    return { profile: viewProfile(p, who), daily: await dailyStatus(who) };
  },

  /* profile */
  "profile.get": async (who) => {
    const [profile, daily] = await Promise.all([getProfile(who), dailyStatus(who)]);
    syncDirectory(who, profile).catch(() => {}); // lets friends find this player in chat
    return { profile: viewProfile(profile, who), daily, kinds: KINDS, store: usesFirestore() ? "firestore" : "memory", boards: boardNames, weekEndsInMs: msToWeekEnd() };
  },
  "profile.setName": async (who, b) => {
    const p = await setName(who, b.name);
    syncDirectory(who, p).catch(() => {});
    return { profile: viewProfile(p, who) };
  },
  "profile.buy": async (who, b) => ({ profile: viewProfile(await buy(who, b.kind, b.id), who) }),
  "profile.equip": async (who, b) => {
    const p = await equip(who, b.kind, b.id);
    syncDirectory(who, p).catch(() => {});
    return { profile: viewProfile(p, who) };
  },

  /* boards */
  "lb.get": async (who, b) => getBoard(b.board, who.uid),

  /* quiz-style games */
  "quiz.start": (who, b) => startSession(who, { kind: b.kind, difficulty: b.difficulty }),
  "quiz.current": (who, b) => currentQuestion(who, b.session),
  "quiz.answer": (who, b) => answerQuestion(who, b.session, { index: b.index, choice: b.choice }),
  "quiz.report": (who, b) => reportQuestion(who, String(b.qid ?? "")),
  "daily.status": (who) => dailyStatus(who),

  /* guess the player */
  "guess.start": (who, b) => startGuess(who, { daily: Boolean(b.daily), mode: b.mode }),
  "career.names": async () => ({ names: careerNames() }),

  /* higher or lower */
  "hilo.start": (who) => startHilo(who),
  "hilo.answer": (who, b) => answerHilo(who, String(b.session ?? ""), b.choice),

  /* footle: guess the footballer from how close each guess is */
  "footle.players": async () => ({ players: await footlePlayers() }),
  "footle.start": (who, b) => startFootle(who, { daily: Boolean(b.daily) }),
  "footle.guess": (who, b) => guessFootle(who, String(b.session ?? ""), b.player),
  "footle.giveup": (who, b) => giveUpFootle(who, String(b.session ?? "")),

  /* daily club grid */
  "grid.get": (who) => getGrid(who),
  "grid.guess": (who, b) => guessGrid(who, String(b.cell ?? ""), b.name),

  /* chat */
  "chat.search": (who, b) => searchPeople(who, b.q),
  "chat.open": (who, b) => openChat(who, String(b.peer ?? "")),
  "chat.sync": (who, b) => syncChat(who, { v: Number(b.v ?? -1), chat: b.chat ? String(b.chat) : null, since: Number(b.since ?? 0), typing: Boolean(b.typing) }),
  "chat.send": (who, b) => sendMessage(who, b),
  "chat.react": (who, b) => reactTo(who, String(b.chat ?? ""), String(b.msg ?? ""), b.emoji),
  "chat.unsend": (who, b) => unsendMessage(who, String(b.chat ?? ""), String(b.msg ?? "")),
  "chat.edit": (who, b) => editMessage(who, String(b.chat ?? ""), String(b.msg ?? ""), b.text),
  "chat.block": (who, b) => blockPerson(who, String(b.uid ?? ""), Boolean(b.blocked)),
  "chat.report": (who, b) => reportPerson(who, String(b.chat ?? ""), b.reason),

  /* games played inside a chat */
  "cg.create": (who, b) => createGame(who, { peer: String(b.peer ?? ""), type: String(b.type ?? "") }),
  "cg.get": (who, b) => getGame(who, String(b.id ?? ""), Number(b.v ?? -1)),
  "cg.move": (who, b) => moveGame(who, String(b.id ?? ""), b),
  "cg.rematch": (who, b) => rematchGame(who, String(b.id ?? "")),
  "behind.players": async () => ({ players: await behindPlayers() }),

  /* lives an admin pinned for everyone (Live page) */
  "live.featured": () => listFeatured(),
  "live.feature.add": (who, b) => addFeatured(who, b),
  "live.feature.remove": (who, b) => removeFeatured(who, b.id),

  /* tournaments and line-ups people make for their own games */
  "create.list": (who, b) => listCreations(who, String(b.kind ?? "")),
  "create.get": (who, b) => getCreation(who, b.id),
  "create.save": (who, b) => saveCreation(who, b),
  "create.delete": (who, b) => deleteCreation(who, b.id),

  /* keepie-uppie */
  "keepy.start": (who) => startKeepy(who),
  "keepy.finish": (who, b) => finishKeepy(who, String(b.session ?? ""), b.score),
  "guess.answer": (who, b) => guessAnswer(who, b.session, b.name),
  "guess.reveal": (who, b) => guessReveal(who, b.session),
  "guess.giveup": (who, b) => guessGiveUp(who, b.session),

  /* predictor */
  "pred.fixtures": async () => ({ fixtures: await fixtures(), competitions: COMPETITIONS }),
  "pred.place": (who, b) => place(who, b),
  "pred.mine": async (who) => {
    const settled = await settle(who);
    return { ...(await myPredictions(who)), justSettled: settled };
  },
  "pred.leagues": async (who) => ({ leagues: await myLeagues(who) }),
  "pred.createLeague": (who, b) => createLeague(who, b.name),
  "pred.joinLeague": (who, b) => joinLeague(who, b.code),
  "pred.leaveLeague": (who, b) => leaveLeague(who, b.code),

  /* head-to-head battles */
  "battle.create": (who, b) => createRoom(who, { difficulty: b.difficulty, kind: b.kind }),
  "battle.join": (who, b) => joinRoom(who, b.code),
  "battle.quick": (who, b) => quickMatch(who, { difficulty: b.difficulty, kind: b.kind }),
  "battle.cancel": (who, b) => cancelRoom(who, b.code),
  "battle.room": async (who, b) => ({ room: await getRoom(who, b.code), now: Date.now() }),
  "battle.answer": async (who, b) => ({ room: await answerRoom(who, b.code, { index: b.index, choice: b.choice }), now: Date.now() }),
  "battle.tick": async (who, b) => ({ room: await tickRoom(who, b.code), now: Date.now() }),
  "battle.rematch": (who, b) => rematch(who, b.code),
  "battle.friends": async (who) => ({ friends: await friendsRanking(who) }),

  /* questions from players */
  "q.submit": (who, b) => submitQuestion(who, b),
  "q.pending": async (who) => {
    if (!who.admin) throw new GameError("Admins only.", 403);
    return { questions: await pendingQuestions() };
  },
  "admin.stats": async (who) => {
    if (!who.admin) throw new GameError("Admins only.", 403);
    return { ...(await adminStats()), store: usesFirestore() ? "firestore" : "memory" };
  },
  "q.decide": async (who, b) => {
    if (!who.admin) throw new GameError("Admins only.", 403);
    return decideQuestion(String(b.id), Boolean(b.approve));
  },
};

/** Open /api/games in a browser to see whether the server setup is complete (no secrets are shown). */
// Where the database is and how long one read takes from this server (it is why actions feel slow or fast).
async function databaseSpeed(projectId) {
  try {
    const store = await getStore();
    await store.get("gp/healthcheck-readonly"); // first call includes connecting
    const times = [];
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      await store.get(`gp/healthcheck-readonly-${i}`);
      times.push(Math.round(performance.now() - t));
    }
    let location = null;
    try {
      const { adminApp } = await import("./_lib/games/admin.js");
      const token = await adminApp().options.credential.getAccessToken();
      const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(4000) });
      location = (await res.json()).locationId ?? null;
    } catch {
      /* location is a nicety */
    }
    return { readMs: Math.min(...times), databaseLocation: location, functionRegion: process.env.VERCEL_REGION ?? "local" };
  } catch (err) {
    return { error: String(err.message).slice(0, 120) };
  }
}

export async function GET() {
  const sa = parseServiceAccount();
  const projectId = projectIdFromEnv();
  const checks = {
    projectId: projectId || null,
    serviceAccount: !sa.present ? "missing" : sa.valid ? "ok" : `invalid (${sa.error ?? "missing private_key or client_email"})`,
    serviceAccountMatchesProject: sa.valid && projectId ? sa.projectId === projectId : null,
    store: usesFirestore() ? "firestore" : "memory",
    adminEmails: (process.env.ADMIN_EMAILS || "").split(",").filter((e) => e.trim()).length,
  };
  const problems = [];
  if (!projectId) problems.push("Set VITE_FIREBASE_PROJECT_ID (or FIREBASE_PROJECT_ID).");
  if (!sa.present) problems.push("Set FIREBASE_SERVICE_ACCOUNT to the full service-account JSON.");
  else if (!sa.valid) problems.push("FIREBASE_SERVICE_ACCOUNT isn't valid JSON. Paste the whole file again, as one line.");
  if (sa.valid && projectId && sa.projectId !== projectId) problems.push(`The service account is for project "${sa.projectId}" but the website uses "${projectId}". They must be the same Firebase project.`);
  if (!checks.adminEmails) problems.push("Set ADMIN_EMAILS to your sign-in email to review questions.");
  const speed = usesFirestore() && sa.valid ? await databaseSpeed(projectId) : null;
  return Response.json({ ok: problems.length === 0, ...checks, ...(speed ? { speed } : {}), problems }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const handler = ACTIONS[body.action];
    if (!handler) throw new GameError("Unknown action.", 404);
    const who = await identify(request);
    rateLimit(`all:${who.uid}`, 240);
    // Recording "seen today" runs alongside the real work instead of in front of it.
    const seen = NOT_ACTIVITY.has(body.action) ? null : markSeen(who).catch(() => {});
    const result = await handler(who, body);
    await seen;
    return Response.json(result ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const status = err instanceof AuthError || err instanceof GameError ? err.status : 500;
    if (status === 500) console.error(JSON.stringify({ level: "error", msg: "games action failed", error: err?.message, stack: err?.stack?.split("\n").slice(0, 4) }));
    return Response.json({ error: status === 500 ? "Something went wrong. Please try again." : err.message, ...(err.code ? { code: err.code } : {}) }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
