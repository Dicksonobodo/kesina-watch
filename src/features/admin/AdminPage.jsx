import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { GamesSection } from "@/features/games/GamesAdmin";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  AlertTriangle,
  Crown,
  Download,
  Eye,
  Gauge,
  MonitorSmartphone,
  Radio,
  ScanSearch,
  Server,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useAccount } from "@/features/account/AccountProvider";
import { apiUrl } from "@/lib/api";
import { auth } from "@/lib/firebase";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { LiveDot } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";

// Chart data color: the brand green stepped down to sit inside the dark-mode lightness band.
const CHART_GREEN = "#6a9e0e";

/**
 * Live admin dashboard. Opens a stream to /admin/stream (Server-Sent Events over fetch, so the
 * sign-in token stays in a header) and re-renders on every update (~3s). Reconnects on drops.
 */
function useAdminStream(enabled) {
  const [snap, setSnap] = useState(null);
  const [status, setStatus] = useState("connecting"); // connecting | live | error
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled || !apiUrl) return;
    let stopped = false;
    let controller;
    let retry;

    const connect = async () => {
      controller = new AbortController();
      setStatus((s) => (s === "live" ? "live" : "connecting"));
      try {
        const token = await auth?.currentUser?.getIdToken();
        const res = await fetch(`${apiUrl}/admin/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        if (res.status === 403) {
          setStatus("error");
          setError("This account isn't an admin on the server. Add your email to ADMIN_EMAILS in server/.env.");
          return;
        }
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop();
          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data: "));
            if (line) {
              setSnap(JSON.parse(line.slice(6)));
              setStatus("live");
            }
          }
        }
        throw new Error("stream ended");
      } catch {
        if (stopped) return;
        setStatus("connecting");
        retry = setTimeout(connect, 3000);
      }
    };

    connect();
    return () => {
      stopped = true;
      controller?.abort();
      clearTimeout(retry);
    };
  }, [enabled]);

  return { snap, status, error };
}

export function AdminPage() {
  const { admin, loaded } = useAccount();
  // The Live server is optional: the games section works without it, and this section fills in when it is connected.
  const { snap, status, error } = useAdminStream(admin && Boolean(apiUrl));
  const [now, setNow] = useState(Date.now());
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const w = setTimeout(() => setWaited(true), 8000);
    return () => {
      clearInterval(t);
      clearTimeout(w);
    };
  }, []);

  if (!loaded) return <Centered><Spinner className="size-6 text-signal" /></Centered>;
  if (!admin)
    return (
      <Centered>
        <ShieldAlert className="mx-auto size-10 text-mist-700" />
        <p className="mt-4 font-display text-xl font-bold">Admins only</p>
        <p className="mt-2 text-sm text-mist-500">Add your sign-in email to ADMIN_EMAILS (on Vercel, and on the Live server if you run one) to open this page.</p>
      </Centered>
    );

  const ago = snap ? Math.max(0, Math.round((now - snap.at) / 1000)) : null;

  return (
    <div>
      <PageHeader eyebrow="Dixon Watch" title="Admin" description="Players, games and questions, plus live activity and server health when the Live server is connected." />

      {/* ---------- Games (always available) ---------- */}
      <SectionTitle title="Games" action={<Link to="/games/moderate" className="text-sm font-semibold text-signal">Review questions →</Link>} />
      <GamesSection />

      {/* ---------- Live server (joins in when it is connected) ---------- */}
      <SectionTitle
        title="Live server"
        action={
          apiUrl && (
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-xs font-medium ring-1",
                status === "live" ? "bg-signal/10 text-signal ring-signal/30" : status === "error" ? "bg-live/10 text-live ring-live/30" : "bg-white/5 text-mist-300 ring-white/10",
              )}
            >
              {status === "live" ? <span className="size-2 animate-pulse rounded-full bg-signal" /> : status === "error" ? <AlertTriangle className="size-3.5" /> : <Spinner className="size-3" />}
              {status === "live" ? `Live · updated ${ago}s ago` : status === "error" ? "Not allowed" : "Connecting…"}
            </span>
          )
        }
      />

      {!snap ? (
        <ServerNotConnected configured={Boolean(apiUrl)} waited={waited} error={error} />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat icon={Users} label="Online now" value={snap.online} accent sub={snap.premiumOnline ? `${snap.premiumOnline} premium` : "signed-in tabs"} />
            <Stat icon={Eye} label="Watching live now" value={snap.watching} sub={`${snap.today.watches} streams started today`} />
            <Stat icon={ScanSearch} label="Detections today" value={snap.today.detections} sub={`${snap.today.failedDetections} found nothing`} />
            <Stat icon={Activity} label="Users today" value={snap.today.users} sub="signed-in visitors" />
            <Stat icon={AlertTriangle} label="Errors today" value={snap.today.errors} status={snap.today.errors > 0 ? "warning" : "good"} sub={snap.today.errors > 0 ? "see activity below" : "all clear"} />
          </section>

          <section className="mt-4 rounded-3xl bg-white/[.025] p-5 ring-1 ring-white/[.06]">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">People online, last hour</h2>
              <span className="font-mono text-[11px] text-mist-500">one point per minute</span>
            </div>
            <OnlineChart points={snap.history} />
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <section className="rounded-3xl bg-white/[.025] p-5 ring-1 ring-white/[.06]">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Eye className="size-4 text-mist-500" /> Watching right now
              </h2>
              <PeopleList people={snap.people} now={now} />
            </section>
            <section className="rounded-3xl bg-white/[.025] p-5 ring-1 ring-white/[.06]">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Activity className="size-4 text-mist-500" /> Activity
              </h2>
              <Feed items={snap.feed} now={now} />
            </section>
          </div>

          <ServerHealth server={snap.server} />
        </>
      )}
    </div>
  );
}

function SectionTitle({ title, action }) {
  return (
    <div className="mt-12 mb-4 flex items-center justify-between gap-3 first-of-type:mt-10">
      <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

function ServerNotConnected({ configured, waited, error }) {
  if (configured && !waited && !error) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-28 rounded-3xl" />
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-4 rounded-3xl border border-dashed border-white/[.1] p-6">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/[.05] ring-1 ring-white/10">
        <Server className="size-5 text-mist-500" />
      </span>
      <div>
        <p className="font-semibold">{configured ? "The Live server isn't reachable right now" : "The Live server isn't connected"}</p>
        <p className="mt-1 text-sm leading-relaxed text-mist-500">
          {error ||
            (configured
              ? "Start it (or its tunnel) and this section fills in by itself."
              : "When it is running and VITE_API_URL points to it, this section shows who is online, who is watching which stream, detections, errors and server health. Everything above works without it.")}
        </p>
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

function Centered({ children }) {
  return <div className="grid min-h-[50vh] place-items-center text-center">{<div>{children}</div>}</div>;
}

function Stat({ icon: Icon, label, value, sub, accent, status }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl p-5 ring-1",
        accent ? "bg-gradient-to-br from-signal/[.1] to-transparent ring-signal/20" : "bg-white/[.025] ring-white/[.06]",
      )}
    >
      <div className="flex items-center gap-2 text-mist-500">
        <Icon className={cn("size-4", status === "warning" && "text-live", accent && "text-signal")} />
        <span className="font-mono text-[11px] tracking-[.14em] uppercase">{label}</span>
      </div>
      <p className="mt-3 font-display text-4xl font-bold tracking-tight">
        <AnimatedNumber value={value} />
      </p>
      <p className={cn("mt-1 text-xs", status === "warning" ? "text-live" : "text-mist-500")}>{sub}</p>
    </div>
  );
}

function OnlineChart({ points }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const W = 640;
  const H = 160;
  const pad = { l: 28, r: 8, t: 10, b: 22 };
  const data = points.length ? points : [{ t: Date.now(), online: 0 }];
  const max = Math.max(4, ...data.map((p) => p.online));
  const t0 = data[0].t;
  const t1 = Math.max(data.at(-1).t, t0 + 60_000);
  const x = (t) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const line = data.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.online).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.at(-1).t).toFixed(1)},${y(0)} L${x(t0).toFixed(1)},${y(0)} Z`;
  const ticks = [0, Math.round(max / 2), max];
  const time = (t) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  function onMove(e) {
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = data[0];
    for (const p of data) if (Math.abs(x(p.t) - px) < Math.abs(x(best.t) - px)) best = p;
    setHover(best);
  }

  return (
    <div className="relative mt-4">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full overflow-visible"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`People online over the last hour, now ${data.at(-1).online}`}
      >
        <defs>
          <linearGradient id="online-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={CHART_GREEN} stopOpacity="0.35" />
            <stop offset="100%" stopColor={CHART_GREEN} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="rgb(255 255 255 / .06)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <text x={pad.l - 8} y={y(v) + 3} textAnchor="end" className="fill-mist-500 font-mono text-[7px]">
              {v}
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 4} className="fill-mist-500 font-mono text-[7px]">
          {time(t0)}
        </text>
        <text x={W - pad.r} y={H - 4} textAnchor="end" className="fill-mist-500 font-mono text-[7px]">
          now
        </text>
        <path d={area} fill="url(#online-fill)" />
        <path d={line} fill="none" stroke={CHART_GREEN} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover && (
          <>
            <line x1={x(hover.t)} x2={x(hover.t)} y1={pad.t} y2={y(0)} stroke="rgb(255 255 255 / .25)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <circle cx={x(hover.t)} cy={y(hover.online)} r="4.5" fill={CHART_GREEN} stroke="var(--color-ink-900)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {hover && (
        <div
          className="glass-strong pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg px-2.5 py-1.5 text-xs"
          style={{ left: `${(x(hover.t) / W) * 100}%` }}
        >
          <span className="font-mono text-mist-500">{time(hover.t)}</span>
          <span className="ml-2 font-semibold text-mist-100">{hover.online} online</span>
        </div>
      )}
      <table className="sr-only">
        <caption>People online per minute</caption>
        <tbody>
          {data.map((p) => (
            <tr key={p.t}>
              <td>{time(p.t)}</td>
              <td>{p.online}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function since(ms, now) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function PeopleList({ people, now }) {
  if (!people.length) return <p className="py-8 text-center text-sm text-mist-500">Nobody's online right now.</p>;
  return (
    <ul className="divide-y divide-white/[.05]">
      <AnimatePresence initial={false}>
        {people.map((p) => (
          <motion.li key={p.uid} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3 py-3">
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                p.watching?.live ? "bg-live/15 text-live" : p.watching ? "bg-signal/15 text-signal" : "bg-white/[.06] text-mist-500",
              )}
            >
              {p.watching?.live ? <Radio className="size-4" /> : p.watching ? <Eye className="size-4" /> : <MonitorSmartphone className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {p.watching ? (
                  <>
                    <span className="font-semibold">{p.watching.title}</span>
                    {p.watching.live && (
                      <span className="ml-2 inline-flex items-center gap-1 align-middle font-mono text-[10px] text-live">
                        <LiveDot /> LIVE
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-mist-300">Browsing {p.page}</span>
                )}
              </p>
              <p className="truncate font-mono text-[11px] text-mist-500">
                {[p.name || p.email, p.device, p.downloading ? `${p.downloading} downloading` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {p.premium && <Crown className="ml-auto size-3.5 text-signal" aria-label="Premium" />}
              <p className="font-mono text-[11px] text-mist-500">{since(p.watchingSince ?? p.firstSeen, now)}</p>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

const FEED_ICON = {
  watch: { icon: Eye, tone: "text-signal" },
  detect: { icon: ScanSearch, tone: "text-mist-300" },
  "detect-fail": { icon: ScanSearch, tone: "text-mist-500" },
  error: { icon: AlertTriangle, tone: "text-live" },
  premium: { icon: Crown, tone: "text-signal" },
};

function Feed({ items, now }) {
  if (!items.length) return <p className="py-8 text-center text-sm text-mist-500">No activity yet.</p>;
  return (
    <ul className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
      <AnimatePresence initial={false}>
        {items.map((e) => {
          const { icon: Icon, tone } = FEED_ICON[e.type] ?? FEED_ICON.detect;
          return (
            <motion.li key={`${e.t}-${e.text}`} layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex gap-3">
              <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} />
              <div className="min-w-0 flex-1">
                <p className={cn("text-[13px] leading-snug break-words", e.type === "error" ? "text-live" : "text-mist-100")}>{e.text}</p>
                <p className="font-mono text-[10.5px] text-mist-700">
                  {since(e.t, now)} ago{e.ms ? ` · ${(e.ms / 1000).toFixed(1)}s` : ""}
                </p>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

function ServerHealth({ server }) {
  if (!server) return null;
  const up = server.uptimeSec;
  const uptime = up < 3600 ? `${Math.floor(up / 60)}m` : up < 86400 ? `${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m` : `${Math.floor(up / 86400)}d`;
  const items = [
    { icon: Server, label: "Uptime", value: uptime },
    { icon: Gauge, label: "Memory", value: `${server.memoryMb} MB` },
    { icon: ScanSearch, label: "Browser pages", value: `${server.detect.browser.active}/${server.detect.browser.max} busy · ${server.detect.browser.waiting} waiting` },
    { icon: Download, label: "Relay streams", value: `${server.relay.open} open · ${server.relay.users} users` },
    { icon: Activity, label: "Detections running", value: server.detect.inFlight },
    { icon: ShieldAlert, label: "Chrome", value: server.chrome ? "found" : "missing", warn: !server.chrome },
  ];
  return (
    <section className="mt-4 rounded-3xl bg-white/[.025] p-5 ring-1 ring-white/[.06]">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Server className="size-4 text-mist-500" /> Server
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {items.map(({ icon: Icon, label, value, warn }) => (
          <div key={label}>
            <p className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-wide text-mist-500 uppercase">
              <Icon className={cn("size-3.5", warn && "text-live")} /> {label}
            </p>
            <p className={cn("mt-1 text-sm font-medium", warn && "text-live")}>{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
