import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Megaphone, Music2, Plus, Radio, Trash2, Trophy, X } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { useUserCollection } from "@/lib/userData";
import { isDemoApi } from "@/lib/api";
import { LiveDot } from "@/components/ui/Badge";
import { LinkBar } from "@/features/home/LinkBar";
import { useDetector } from "@/features/home/useDetector";
import { DetectionProgress } from "@/features/home/DetectionProgress";
import { DetectionResult } from "@/features/home/DetectionResult";
import { AddSiteDialog, SiteTile } from "@/features/sites/SitesPage";
import { useAccount } from "@/features/account/AccountProvider";
import { gamesApi } from "@/lib/games";
import { cn } from "@/lib/cn";

const IDEAS = [
  { icon: Music2, title: "Concerts", body: "The page of a concert or festival livestream." },
  { icon: Trophy, title: "Live matches", body: "Football and other matches, streamed live right here." },
  { icon: Radio, title: "Direct stream links", body: "Got a .m3u8 link? Paste it straight in." },
];

// A single live stream starts straight away; a page with several waits for the viewer to pick one.
const multiAutoplay = (result, autoplay) => (result.streams?.filter((s) => s.live).length > 1 ? null : autoplay ?? { at: 0 });

/** Live: paste any live link (page or stream) and watch it ad-free; pinned live channels below. */
export function LivePage() {
  const { user } = useAuth();
  const detector = useDetector();
  const { url, status, result, reset, autoplay } = detector;
  const { items: sites, loading } = useUserCollection(user?.uid, "sites");
  const channels = sites.filter((s) => s.kind === "live");
  const [adding, setAdding] = useState(false);
  const compact = status === "detecting" || status === "done";

  // A pinned live: find its stream straight away and bring the player into view.
  const watch = (link) => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    detector.setUrl(link);
    detector.detect(null, link);
  };

  return (
    <div>
      <section className={compact ? "" : "pt-2 lg:pt-8"}>
        <p className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-[.22em] text-live uppercase">
          <LiveDot /> Live
        </p>
        {!compact && (
          <>
            <h1 className="mt-4 font-display text-[clamp(36px,6.5vw,72px)] leading-[0.95] font-extrabold tracking-[-0.035em]">
              Watch it <span className="text-live">live.</span>
              <br />
              Skip the ads.
            </h1>
            <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-mist-500">
              Paste the link to a concert or a channel page, or a direct stream link. We find the live stream and play it here, clean.
            </p>
          </>
        )}

        <LinkBar
          detector={detector}
          className={compact ? "mt-4" : "mt-8"}
          placeholder="https://… concert page, channel page, or .m3u8 stream link"
          label="Live page or stream link"
          actionLabel="Find stream"
          busyLabel="Finding stream"
          actionIcon={Radio}
        />
      </section>

      <div className="mt-8">
        {status === "detecting" && <DetectionProgress url={url} demo={isDemoApi} />}
        {status === "done" && result && result.live && <DetectionResult key={result.url} result={result} onReset={reset} autoplay={multiAutoplay(result, autoplay)} liveOnly />}
        {status === "done" && result && !result.live && (
          <div className="glass rounded-[28px] p-6 text-center sm:p-8">
            <p className="font-display text-xl font-bold">That isn&apos;t a live stream</p>
            <p className="mt-2 text-sm text-mist-500">Dixon Watch only plays live streams. Paste the page of a live concert, event or channel.</p>
            <button onClick={reset} className="mt-5 text-sm font-semibold text-signal">Try another link</button>
          </div>
        )}
      </div>

      <FeaturedLives onWatch={watch} />

      {/* Pinned live channels */}
      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight">Your channels</h2>
            <p className="mt-1 text-sm text-mist-500">Live pages you pinned. One tap to watch.</p>
          </div>
          <Link to="/sites" className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-mist-500 transition hover:text-signal">
            All pinned pages <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {loading
            ? [0, 1].map((i) => <div key={i} className="skeleton aspect-[4/3] rounded-3xl" />)
            : channels.map((site) => <SiteTile key={site.id} site={site} uid={user.uid} />)}
          <motion.button
            layout
            onClick={() => setAdding(true)}
            className="group flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/[.12] text-mist-500 transition hover:border-live/60 hover:text-live"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-white/[.04] ring-1 ring-white/10 transition group-hover:bg-live/10 group-hover:ring-live/30">
              <Plus className="size-5" />
            </span>
            <span className="text-sm font-semibold">Add a channel</span>
          </motion.button>
        </div>
      </section>

      {/* What works */}
      {!compact && (
        <section className="mt-12 grid gap-3 sm:grid-cols-3">
          {IDEAS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-3xl bg-white/[.025] p-5 ring-1 ring-white/[.06]">
              <span className="grid size-10 place-items-center rounded-2xl bg-live/10 ring-1 ring-live/20">
                <Icon className="size-[18px] text-live" />
              </span>
              <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-mist-500">{body}</p>
            </div>
          ))}
          <Link
            to="/sports"
            className="group flex items-center gap-4 rounded-3xl bg-gradient-to-r from-signal/[.08] to-transparent p-5 ring-1 ring-signal/20 transition hover:ring-signal/40 sm:col-span-3"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-signal/10 ring-1 ring-signal/25">
              <Trophy className="size-[18px] text-signal" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">Looking for football?</span>
              <span className="block text-sm text-mist-500">Live scores, fixtures, news and where to watch each match are in Sports.</span>
            </span>
            <ArrowRight className="size-4 text-mist-500 transition group-hover:translate-x-0.5 group-hover:text-signal" />
          </Link>
        </section>
      )}

      <AddSiteDialog open={adding} onClose={() => setAdding(false)} uid={user?.uid} title="Add a live channel" />
    </div>
  );
}

/* ---------- lives an admin pinned for everyone ---------- */

const LABELS = ["Match", "Concert", "Show", "Event"];
const TONES = { match: "from-emerald-600 to-emerald-950", concert: "from-fuchsia-600 to-violet-950", show: "from-sky-600 to-blue-950", event: "from-amber-500 to-orange-950" };

function FeaturedLives({ onWatch }) {
  const { admin } = useAccount();
  const [items, setItems] = useState(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    gamesApi("live.featured")
      .then((r) => setItems(r.featured))
      .catch(() => setItems([]));
  }, []);

  async function remove(id) {
    if (confirm !== id) return setConfirm(id);
    setConfirm(null);
    try {
      setItems((await gamesApi("live.feature.remove", { id })).featured);
    } catch {
      /* stays as it was */
    }
  }

  if (!items?.length && !admin) return null;
  return (
    <section className="mt-12">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
            <Megaphone className="size-5 text-live" /> Pinned for everyone
          </h2>
          <p className="mt-1 text-sm text-mist-500">Live now, picked by Dixon Watch. The label tells you what&apos;s on.</p>
        </div>
        {admin && (
          <button onClick={() => setAdding(true)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-live/10 px-3.5 py-2 text-[13px] font-semibold text-live ring-1 ring-live/30 transition hover:bg-live/15">
            <Plus className="size-4" /> Pin a live
          </button>
        )}
      </div>
      {items === null ? (
        <div className="skeleton h-28 rounded-3xl" />
      ) : items.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-white/[.1] px-5 py-6 text-sm text-mist-500">Nothing pinned yet. Pin a live and every user will see it here with its label.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((f) => (
            <div key={f.id} className="group relative aspect-[4/3] overflow-hidden rounded-3xl ring-1 ring-white/10">
              <button onClick={() => onWatch(f.url)} className="absolute inset-0 text-left" aria-label={`Watch ${f.title}`}>
                <span className={cn("absolute inset-0 bg-gradient-to-br transition duration-500 group-hover:scale-105", TONES[f.label.toLowerCase()] ?? "from-rose-600 to-ink-950")} />
                <span className="absolute inset-0 flex flex-col justify-between p-4">
                  <span className="flex items-start justify-between gap-2">
                    <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase ring-1 ring-white/15 backdrop-blur">{f.label}</span>
                    <span className="flex items-center gap-1 rounded-full bg-live px-2 py-0.5 text-[10px] font-bold text-white">
                      <LiveDot /> LIVE
                    </span>
                  </span>
                  <span className={cn("line-clamp-2 font-display text-[15px] leading-tight font-bold", admin && "pr-9")}>{f.title}</span>
                </span>
              </button>
              {admin && (
                <button onClick={() => remove(f.id)} onMouseLeave={() => setConfirm(null)} aria-label={confirm === f.id ? "Tap again to remove" : "Remove"} title={confirm === f.id ? "Tap again to remove" : "Remove for everyone"} className={cn("absolute right-3 bottom-3 grid size-8 place-items-center rounded-full backdrop-blur transition", confirm === f.id ? "bg-live text-white" : "bg-black/50 text-mist-100 hover:bg-black/70")}>
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {adding && <PinLiveDialog onClose={() => setAdding(false)} onSaved={setItems} />}
    </section>
  );
}

function PinLiveDialog({ onClose, onSaved }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [label, setLabel] = useState("Match");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      onSaved((await gamesApi("live.feature.add", { url, title, label })).featured);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const input = "h-11 w-full rounded-2xl bg-white/[.05] px-4 text-[15px] ring-1 ring-white/10 outline-none placeholder:text-mist-700 focus:ring-live/50";
  return (
    <div className="fixed inset-0 z-[120] grid place-items-end bg-black/60 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:place-items-center" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-[28px] bg-ink-900 p-5 ring-1 ring-white/10 sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl font-bold">Pin a live for everyone</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full bg-white/[.06]">
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-mist-500">Every user will see it on their Live page.</p>
        <label className="mt-5 block text-xs font-semibold text-mist-300">Live link</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… live page or .m3u8 link" className={cn(input, "mt-1.5")} autoFocus inputMode="url" />
        <label className="mt-4 block text-xs font-semibold text-mist-300">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="e.g. Arsenal vs Chelsea" className={cn(input, "mt-1.5")} />
        <label className="mt-4 block text-xs font-semibold text-mist-300">Label</label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {LABELS.map((l) => (
            <button type="button" key={l} onClick={() => setLabel(l)} className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition", label === l ? "bg-live/15 text-live ring-live/50" : "bg-white/[.04] text-mist-300 ring-white/10")}>
              {l}
            </button>
          ))}
          <input value={LABELS.includes(label) ? "" : label} onChange={(e) => setLabel(e.target.value)} maxLength={24} placeholder="Other…" className="h-[34px] w-28 rounded-full bg-white/[.04] px-3.5 text-sm ring-1 ring-white/10 outline-none focus:ring-live/50" />
        </div>
        {error && <p className="mt-4 text-sm text-live">{error}</p>}
        <button type="submit" disabled={saving || !url.trim() || !title.trim()} className="mt-6 h-12 w-full rounded-full bg-live font-semibold text-white transition disabled:opacity-40">
          {saving ? "Pinning…" : "Pin for everyone"}
        </button>
      </form>
    </div>
  );
}
