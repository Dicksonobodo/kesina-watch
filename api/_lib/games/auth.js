import { usesFirestore } from "./store.js";

/*
 * Who is calling. In production the browser sends its Firebase ID token and we verify it
 * (firebase-admin only needs the project id for that). Locally, without Firebase credentials,
 * a development token "dev:<uid>:<name>" is accepted so the games can be played in preview
 * mode. The development path is refused on Vercel and whenever real credentials exist.
 */

export class AuthError extends Error {
  constructor(message = "Please sign in to play.") {
    super(message);
    this.status = 401;
  }
}

const devAllowed = () => !process.env.VERCEL && !usesFirestore() && process.env.NODE_ENV !== "production";
const adminEmails = () => (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

let verifier;
async function getVerifier() {
  if (!verifier) {
    const { getApps, initializeApp } = await import("firebase-admin/app");
    const { getAuth } = await import("firebase-admin/auth");
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
    if (!projectId) throw new Error("FIREBASE_PROJECT_ID is not set");
    const app = getApps()[0] ?? initializeApp({ projectId });
    verifier = getAuth(app);
  }
  return verifier;
}

/** Returns { uid, name, email, admin } or throws AuthError. */
export async function identify(request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new AuthError();

  if (token.startsWith("dev:")) {
    if (!devAllowed()) throw new AuthError();
    const [, uid, name] = token.split(":");
    if (!uid) throw new AuthError();
    return { uid, name: name || "Preview", email: `${uid}@dev.local`, admin: uid === "admin" || uid === "preview" };
  }

  try {
    const decoded = await (await getVerifier()).verifyIdToken(token);
    const email = decoded.email ?? null;
    return { uid: decoded.uid, name: decoded.name || (email ? email.split("@")[0] : "Player"), email, admin: Boolean(email && adminEmails().includes(email.toLowerCase())) };
  } catch {
    throw new AuthError("Your sign-in expired. Please sign in again.");
  }
}
