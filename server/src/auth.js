import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { config } from "./config.js";
import { log } from "./log.js";

/*
 * Verifying sign-in tokens only needs the project id. A service account (FIREBASE_SERVICE_ACCOUNT,
 * the JSON key as one line) is only needed for Premium: it lets the server mark paying users.
 */
function createApp() {
  if (!config.firebaseProjectId) return null;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    try {
      return initializeApp({ credential: cert(JSON.parse(raw)), projectId: config.firebaseProjectId });
    } catch (err) {
      log.error("FIREBASE_SERVICE_ACCOUNT is not valid JSON; Premium is disabled", { error: err });
    }
  }
  return initializeApp({ projectId: config.firebaseProjectId });
}

export const firebaseApp = createApp();
export const canManageUsers = Boolean(firebaseApp && process.env.FIREBASE_SERVICE_ACCOUNT);

async function identify(req) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token || !firebaseApp) return null;
  try {
    return await getAuth(firebaseApp).verifyIdToken(token);
  } catch {
    return null;
  }
}

function attach(req, decoded) {
  req.uid = decoded.uid;
  req.email = decoded.email ?? null;
  req.name = decoded.name ?? null;
  req.premium = decoded.plan === "premium" && (!decoded.premiumUntil || decoded.premiumUntil * 1000 > Date.now());
}

export async function requireUser(req, res, next) {
  if (!config.requireAuth) {
    req.uid = "anonymous";
    return next();
  }
  const decoded = await identify(req);
  if (!decoded) return res.status(401).json({ error: "Please sign in to continue." });
  attach(req, decoded);
  next();
}

export const isAdmin = (req) => Boolean(req.email && config.adminEmails.includes(req.email.toLowerCase()));

export async function requireAdmin(req, res, next) {
  const decoded = await identify(req);
  if (decoded) attach(req, decoded);
  if (!decoded || !isAdmin(req)) return res.status(403).json({ error: "Admins only." });
  next();
}
