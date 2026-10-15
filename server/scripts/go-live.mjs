/*
 * Puts the Live server on the internet from this laptop: `npm run live` (in server/).
 *
 *   1. starts the server (src/index.js) on PORT
 *   2. opens a free Cloudflare tunnel to it (bin/cloudflared.exe, no account needed), which gives
 *      a public https address like https://word-word-word.trycloudflare.com
 *   3. saves that address in Firestore (config/server), where the website reads it, so the site
 *      finds this server without being rebuilt; it's refreshed every minute while running
 *   4. on Ctrl+C (or if the tunnel can't be kept up) the address is cleared, so the site says
 *      the server is offline instead of trying a dead address
 *
 * The tunnel's address changes each time it starts; that's fine, the site always reads the
 * latest one. The laptop must stay on and awake (and online) for Live to work.
 */

import { spawn } from "node:child_process";
import { get as httpGet } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_DIR = join(SERVER_DIR, "..");
const SITE_ORIGINS = ["https://dixon-watch.vercel.app", "https://dixon-watch-*.vercel.app"];
const HEARTBEAT_MS = 60_000;

/* ---------- settings ---------- */

function readEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
const serverEnv = readEnv(join(SERVER_DIR, ".env"));
const rootEnv = readEnv(join(ROOT_DIR, ".env"));
const PORT = Number(serverEnv.PORT || 8787);
const origins = [...new Set([...(serverEnv.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean), ...SITE_ORIGINS])];

const log = (...a) => console.log(new Date().toLocaleTimeString(), "·", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Another copy running (another window) is the usual reason the port is taken: say so and stop,
// before connecting to anything.
// (Plain http, not fetch: exiting right after a fetch trips a Node bug on Windows.)
const alreadyRunning = await new Promise((resolve) => {
  const req = httpGet({ host: "127.0.0.1", port: PORT, path: "/health", agent: false, timeout: 1500 }, (res) => {
    res.resume();
    resolve(res.statusCode === 200);
  });
  req.on("timeout", () => req.destroy());
  req.on("error", () => resolve(false));
});
if (alreadyRunning) {
  console.error(`\n  ⚠ A Live server is already running on this laptop (port ${PORT}), probably in another window.\n    Close that window first (or press Ctrl+C in it), then start this again.\n`);
  process.exit(1);
}

/* ---------- where the address is published ---------- */

let db = null;
try {
  const sa = JSON.parse(serverEnv.FIREBASE_SERVICE_ACCOUNT || rootEnv.FIREBASE_SERVICE_ACCOUNT || "null");
  if (sa) db = getFirestore(initializeApp({ credential: cert(sa) }, "go-live"));
} catch (err) {
  console.error("Couldn't read FIREBASE_SERVICE_ACCOUNT from .env:", err.message);
}
if (!db) {
  console.error("\nNo Firebase service account found (FIREBASE_SERVICE_ACCOUNT in .env). The tunnel will run, but the website can't find it.\n");
}

let publicUrl = null;
const startedAt = Date.now();
async function publish(url) {
  if (!db) return;
  try {
    await db.doc("config/server").set({ url: url ?? null, at: Date.now(), startedAt, host: hostname() });
  } catch (err) {
    log("Couldn't save the address to Firestore:", err.message);
  }
}

/* ---------- the server ---------- */

const children = new Set();
function run(cmd, args, opts) {
  const child = spawn(cmd, args, { cwd: SERVER_DIR, windowsHide: true, ...opts });
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}

function startServer() {
  const child = run(process.execPath, ["--env-file-if-exists=.env", "src/index.js"], {
    env: { ...process.env, PORT: String(PORT), ALLOWED_ORIGINS: origins.join(","), TRUST_PROXY: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
  const started = Date.now();
  child.on("exit", (code) => {
    if (stopping) return;
    quickExits = Date.now() - started < 15_000 ? quickExits + 1 : 0;
    if (quickExits >= 3) {
      log(`The server keeps stopping as soon as it starts (code ${code}). Read the [server] messages above; if they say the port is in use, another copy is running: close it and start again.`);
      stop();
      return;
    }
    log(`The server stopped (code ${code}). Restarting in 3 seconds…`);
    setTimeout(startServer, 3000);
  });
}
let quickExits = 0;

async function waitFor(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  return false;
}

/* ---------- the tunnel ---------- */

function cloudflaredPath() {
  const local = join(SERVER_DIR, "bin", "cloudflared.exe");
  if (existsSync(local)) return local;
  return "cloudflared"; // installed and on PATH
}

function startTunnel() {
  return new Promise((resolve) => {
    const child = run(cloudflaredPath(), ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`], { stdio: ["ignore", "pipe", "pipe"] });
    let found = false;
    const scan = (d) => {
      const text = String(d);
      // Show Cloudflare's problems; the rest of its chatter isn't useful here.
      for (const line of text.split(/\r?\n/)) if (/\bERR\b|failed|error/i.test(line)) console.error(`[tunnel] ${line.replace(/^\S+Z\s+/, "")}`);
      // The address is the one in the "Your quick Tunnel has been created!" box: word-word-word.trycloudflare.com.
      const m = text.match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com/);
      if (m && !found) {
        found = true;
        resolve({ child, url: m[0] });
      }
    };
    child.stdout.on("data", scan);
    child.stderr.on("data", scan);
    child.on("error", (err) => {
      log("Couldn't start cloudflared:", err.message);
      if (!found) resolve({ child: null, url: null });
    });
    child.on("exit", () => {
      if (!found) resolve({ child: null, url: null });
    });
  });
}

let stopping = false;
async function keepTunnelUp() {
  let failures = 0;
  while (!stopping) {
    log("Opening the tunnel…");
    const { child, url } = await startTunnel();
    if (!url) {
      failures += 1;
      await publish(null);
      log(`The tunnel didn't start (${failures}). Trying again in ${Math.min(60, 5 * failures)} seconds…`);
      await sleep(Math.min(60, 5 * failures) * 1000);
      continue;
    }
    // The new address can take a few seconds to work everywhere.
    const ok = await waitFor(`${url}/health`, 45_000);
    if (!ok) log("The tunnel opened but isn't answering yet; publishing it anyway.");
    failures = 0;
    publicUrl = url;
    await publish(url);
    console.log(`\n  ✅ Live server is on the internet at ${url}\n     dixon-watch.vercel.app will use it straight away. Leave this window open.\n     Press Ctrl+C to stop.\n`);
    await new Promise((r) => child.on("exit", r));
    if (stopping) return;
    publicUrl = null;
    await publish(null);
    log("The tunnel closed. Opening a new one…");
    await sleep(2000);
  }
}

/* ---------- go ---------- */

async function stop() {
  if (stopping) return;
  stopping = true;
  console.log("\nStopping: telling the website the server is offline…");
  await publish(null);
  for (const c of children) c.kill();
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

log(`Starting the Live server on port ${PORT} (allowed sites: ${origins.join(", ")})`);
startServer();
if (!(await waitFor(`http://localhost:${PORT}/health`, 60_000))) {
  log("The server didn't start. See the [server] messages above.");
  await stop();
} else {
  // Tell the website we're still here every minute (it treats an old address as offline).
  setInterval(() => publicUrl && !stopping && publish(publicUrl), HEARTBEAT_MS);
  await keepTunnelUp();
}
