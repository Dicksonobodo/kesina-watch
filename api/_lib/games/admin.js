import { cert, getApps, initializeApp } from "firebase-admin/app";

/*
 * One Firebase admin app for everything on the server (checking sign-ins and reading/writing
 * Firestore). It is created once, with the service-account credentials when they exist, so that
 * whichever part runs first can't leave the other without credentials.
 */

export const projectIdFromEnv = () => process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "";

export function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return { present: false };
  try {
    const json = JSON.parse(raw);
    return { present: true, valid: Boolean(json.private_key && json.client_email), json, projectId: json.project_id };
  } catch (err) {
    return { present: true, valid: false, error: String(err.message).slice(0, 80) };
  }
}

export function adminApp() {
  const existing = getApps()[0];
  if (existing) return existing;
  const sa = parseServiceAccount();
  const projectId = projectIdFromEnv() || sa.projectId;
  if (!projectId) throw new Error("No Firebase project id: set FIREBASE_PROJECT_ID (or VITE_FIREBASE_PROJECT_ID).");
  if (sa.valid) return initializeApp({ credential: cert(sa.json), projectId });
  return initializeApp({ projectId });
}
