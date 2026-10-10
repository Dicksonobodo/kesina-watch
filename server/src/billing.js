import crypto from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { canManageUsers, firebaseApp } from "./auth.js";
import { config } from "./config.js";
import { HttpError } from "./safety.js";
import { log } from "./log.js";
import { pushEvent } from "./activity.js";

/*
 * Premium via Paystack (cards, bank transfer, USSD in Nigeria).
 * Flow: /billing/checkout → Paystack payment page → back to the site with ?reference=… →
 * /billing/verify confirms with Paystack and marks the user premium (Firebase custom claim).
 * The webhook does the same if the user closes the tab before returning.
 * Needs PAYSTACK_SECRET_KEY and FIREBASE_SERVICE_ACCOUNT; without them billing reports disabled.
 */

const SECRET = process.env.PAYSTACK_SECRET_KEY || "";
const PRICE_KOBO = Number(process.env.PREMIUM_PRICE_KOBO) || 150_000; // ₦1,500
const DAYS = Number(process.env.PREMIUM_DAYS) || 30;
const enabled = Boolean(SECRET && canManageUsers);

export function billingConfig() {
  return { enabled, price: PRICE_KOBO / 100, currency: "NGN", days: DAYS };
}

async function paystack(path, init = {}) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === false) throw new HttpError(502, body.message || "Payment provider error.");
  return body.data;
}

export async function startCheckout(req) {
  if (!enabled) throw new HttpError(503, "Premium isn't available yet.");
  if (!req.email) throw new HttpError(400, "Your account needs an email address to pay.");
  const site = config.allowedOrigins.find((o) => o === req.headers.origin) || req.headers.origin || "";
  const data = await paystack("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: req.email,
      amount: PRICE_KOBO,
      currency: "NGN",
      callback_url: `${site}/profile?billing=return`,
      metadata: { uid: req.uid, plan: "premium", days: DAYS },
    }),
  });
  return { url: data.authorization_url, reference: data.reference };
}

async function grantPremium(uid, reference) {
  const auth = getAuth(firebaseApp);
  const user = await auth.getUser(uid);
  const claims = user.customClaims ?? {};
  if (claims.lastPayment === reference) return claims; // already applied (webhook + verify both ran)
  const base = Math.max(Date.now() / 1000, claims.premiumUntil ?? 0);
  const next = { ...claims, plan: "premium", premiumUntil: Math.round(base + DAYS * 86400), lastPayment: reference };
  await auth.setCustomUserClaims(uid, next);
  log.info("premium granted", { uid, reference, until: new Date(next.premiumUntil * 1000).toISOString() });
  pushEvent("premium", `${user.email || "A user"} upgraded to Premium`);
  return next;
}

async function applyTransaction(tx) {
  if (tx.status !== "success" || tx.currency !== "NGN" || tx.amount < PRICE_KOBO) return null;
  const uid = tx.metadata?.uid;
  if (!uid) return null;
  return grantPremium(uid, tx.reference);
}

/** Called when the user comes back from Paystack. */
export async function verifyCheckout(req) {
  if (!enabled) throw new HttpError(503, "Premium isn't available yet.");
  const reference = String(req.query.reference || "");
  if (!/^[\w-]{6,100}$/.test(reference)) throw new HttpError(400, "Invalid payment reference.");
  const tx = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (tx.metadata?.uid !== req.uid) throw new HttpError(403, "That payment belongs to another account.");
  const claims = await applyTransaction(tx);
  if (!claims) throw new HttpError(402, "The payment hasn't gone through yet.");
  return { premium: true, until: claims.premiumUntil };
}

export function isValidSignature(rawBody, signature, secret = SECRET) {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Paystack → us (server to server). */
export async function webhookHandler(req, res) {
  const raw = req.body instanceof Buffer ? req.body : Buffer.from("");
  if (!isValidSignature(raw, req.headers["x-paystack-signature"])) return res.status(401).end();
  res.status(200).end(); // acknowledge fast; Paystack retries otherwise
  try {
    const event = JSON.parse(raw.toString("utf8"));
    if (event.event === "charge.success") await applyTransaction(event.data);
  } catch (err) {
    log.error("paystack webhook failed", { error: err });
  }
}
