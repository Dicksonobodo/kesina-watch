const list = (value) =>
  (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const num = (value, fallback) => (Number.isFinite(Number(value)) && value !== "" && value != null ? Number(value) : fallback);

export const config = {
  port: num(process.env.PORT, 8787),
  // Exact origins, or patterns with * (e.g. https://dixon-watch-*.vercel.app for preview deployments).
  allowedOrigins: list(process.env.ALLOWED_ORIGINS || "http://localhost:5173"),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "",
  requireAuth: process.env.REQUIRE_AUTH !== "false",
  chromePath: process.env.CHROME_PATH || "",
  rateLimit: num(process.env.RATE_LIMIT, 30),
  // Public address of this server (https://…). Used in rewritten playlists; falls back to the request's host.
  publicUrl: (process.env.PUBLIC_URL || "").replace(/\/$/, ""),
  // Set when running behind a proxy / tunnel (Render, Cloudflare, nginx) so https and client IPs are seen correctly.
  trustProxy: process.env.TRUST_PROXY !== "false",
  browserSlots: num(process.env.BROWSER_SLOTS, 2),
  relayPerUser: num(process.env.RELAY_PER_USER, 8),
  relayTotal: num(process.env.RELAY_TOTAL, 200),
  // Emails that can open the admin dashboard.
  adminEmails: list(process.env.ADMIN_EMAILS).map((e) => e.toLowerCase()),
};

export function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin, curl, <video>/<a download> navigations
  return config.allowedOrigins.some((allowed) => {
    if (!allowed.includes("*")) return allowed === origin;
    const pattern = new RegExp(`^${allowed.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\/]/g, "\\$&")).join("[a-z0-9-]+")}$`, "i");
    return pattern.test(origin);
  });
}

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
