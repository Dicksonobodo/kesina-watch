import { AuthError, identify } from "./_lib/games/auth.js";
import { buy, equip, getProfile, setName, viewProfile } from "./_lib/games/profile.js";
import { boardNames, getBoard } from "./_lib/games/leaderboard.js";
import { answerQuestion, currentQuestion, dailyStatus, KINDS, startSession } from "./_lib/games/sessions.js";
import { guessAnswer, guessGiveUp, guessReveal, startGuess } from "./_lib/games/guess.js";
import { answerRoom, cancelRoom, createRoom, friendsRanking, getRoom, joinRoom, quickMatch, rematch, tickRoom } from "./_lib/games/battle.js";
import { COMPETITIONS, createLeague, fixtures, joinLeague, leaveLeague, myLeagues, myPredictions, place, settle } from "./_lib/games/predictor.js";
import { decideQuestion, pendingQuestions, reportQuestion, submitQuestion } from "./_lib/games/questions.js";
import { usesFirestore } from "./_lib/games/store.js";
import { adminStats } from "./_lib/games/adminstats.js";
import { parseServiceAccount, projectIdFromEnv } from "./_lib/games/admin.js";
import { GameError, msToWeekEnd, rateLimit } from "./_lib/games/util.js";

/*
 * One function for every game action (Vercel's free plan allows only 12 functions, so the games
 * share this one). POST /api/games { action: "quiz.start", ... } with the player's Firebase
 * ID token in the Authorization header.
 */

const ACTIONS = {
  /* who am I (no database access: used by the sidebar to show the Admin link) */
  me: async (who) => ({ admin: who.admin }),

  /* profile */
  "profile.get": async (who) => {
    const [profile, daily] = await Promise.all([getProfile(who), dailyStatus(who)]);
    return { profile: viewProfile(profile, who), daily, kinds: KINDS, store: usesFirestore() ? "firestore" : "memory", boards: boardNames, weekEndsInMs: msToWeekEnd() };
  },
  "profile.setName": async (who, b) => ({ profile: viewProfile(await setName(who, b.name), who) }),
  "profile.buy": async (who, b) => ({ profile: viewProfile(await buy(who, b.kind, b.id), who) }),
  "profile.equip": async (who, b) => ({ profile: viewProfile(await equip(who, b.kind, b.id), who) }),

  /* boards */
  "lb.get": async (who, b) => getBoard(b.board, who.uid),

  /* quiz-style games */
  "quiz.start": (who, b) => startSession(who, { kind: b.kind, difficulty: b.difficulty }),
  "quiz.current": (who, b) => currentQuestion(who, b.session),
  "quiz.answer": (who, b) => answerQuestion(who, b.session, { index: b.index, choice: b.choice }),
  "quiz.report": (who, b) => reportQuestion(who, String(b.qid ?? "")),
  "daily.status": (who) => dailyStatus(who),

  /* guess the player */
  "guess.start": (who, b) => startGuess(who, { daily: Boolean(b.daily) }),
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
  "battle.create": (who, b) => createRoom(who, { difficulty: b.difficulty }),
  "battle.join": (who, b) => joinRoom(who, b.code),
  "battle.quick": (who, b) => quickMatch(who, { difficulty: b.difficulty }),
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
  return Response.json({ ok: problems.length === 0, ...checks, problems }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const handler = ACTIONS[body.action];
    if (!handler) throw new GameError("Unknown action.", 404);
    const who = await identify(request);
    rateLimit(`all:${who.uid}`, 240);
    const result = await handler(who, body);
    return Response.json(result ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const status = err instanceof AuthError || err instanceof GameError ? err.status : 500;
    if (status === 500) console.error(JSON.stringify({ level: "error", msg: "games action failed", error: err?.message, stack: err?.stack?.split("\n").slice(0, 4) }));
    return Response.json({ error: status === 500 ? "Something went wrong. Please try again." : err.message, ...(err.code ? { code: err.code } : {}) }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
