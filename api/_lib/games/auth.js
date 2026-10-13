import { createRemoteJWKSet, jwtVerify } from "jose";
import { parseServiceAccount, projectIdFromEnv } from "./admin.js";
import { usesFirestore } from "./store.js";

/*
 * Who is calling. In production the browser sends its Firebase ID token and we verify it
 * (firebase-admin only needs the project id for that). Locally, without Firebase credentials,
 * a development token "dev:<uid>:<name>" is accepted so the games can be played in preview
 * mode. The development path is refused on Vercel and whenever real credentials exist.
 */

export class AuthError extends Error {
  constructor(message = "Please sign in to play.", code) {
    super(message);
    this.status = 401;
    this.code = code;
  }
}

const devAllowed = () => !process.env.VERCEL && !usesFirestore() && process.env.NODE_ENV !== "production";
const adminEmails = () => (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/*
 * Firebase ID tokens are ordinary signed JWTs, so they are verified here with `jose` against
 * Google's public keys. (firebase-admin's own verifier loads a library that fails to start on
 * some Node versions, which is why it isn't used for this.)
 */
const GOOGLE_KEYS = new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
let remoteKeys;

export async function verifyFirebaseToken(token, keys) {
  const projectId = projectIdFromEnv() || parseServiceAccount().projectId;
  if (!projectId) throw Object.assign(new Error("No Firebase project id is configured."), { code: "config/no-project-id" });
  const { payload } = await jwtVerify(token, keys ?? (remoteKeys ??= createRemoteJWKSet(GOOGLE_KEYS)), {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ["RS256"],
  });
  if (!payload.sub) throw Object.assign(new Error("Token has no user."), { code: "auth/no-subject" });
  return payload;
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
    const decoded = await verifyFirebaseToken(token);
    const email = decoded.email ?? null;
    return { uid: decoded.sub, name: decoded.name || (email ? email.split("@")[0] : "Player"), email, admin: Boolean(email && adminEmails().includes(email.toLowerCase())) };
  } catch (err) {
    // Say why in the server log (never the token), and give the browser a short code.
    const code = err?.code || err?.errorInfo?.code || "auth/unknown";
    console.error(JSON.stringify({ level: "warn", msg: "sign-in check failed", code, error: String(err?.message).slice(0, 200) }));
    throw new AuthError("Your sign-in couldn't be verified. Sign out and in again; if it keeps happening the server setup needs attention.", code);
  }
}
