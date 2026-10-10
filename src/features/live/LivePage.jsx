import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Mic2, Music2, Plus, Radio, Tv, Trophy } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { useUserCollection } from "@/lib/userData";
import { isDemoApi } from "@/lib/api";
import { LiveDot } from "@/components/ui/Badge";
import { LinkBar } from "@/features/home/LinkBar";
import { useDetector } from "@/features/home/useDetector";
import { DetectionProgress } from "@/features/home/DetectionProgress";
import { DetectionResult } from "@/features/home/DetectionResult";
import { AddSiteDialog, SiteTile } from "@/features/sites/SitesPage";

const IDEAS = [
  { icon: Music2, title: "Concerts", body: "The page of a concert or festival livestream." },
  { icon: Tv, title: "TV & programmes", body: "A channel's live page, or a show streaming now." },
  { icon: Mic2, title: "Events & church", body: "Conferences, services, launches, award shows." },
  { icon: Radio, title: "Direct stream links", body: "Got a .m3u8 link? Paste it straight in." },
];

/** Live: paste any live link (page or stream) and watch it ad-free; pinned live channels below. */
export function LivePage() {
  const { user } = useAuth();
  const detector = useDetector();
  const { url, status, result, reset, autoplay } = detector;
  const { items: sites, loading } = useUserCollection(user?.uid, "sites");
  const channels = sites.filter((s) => s.kind === "live");
  const [adding, setAdding] = useState(false);
  const compact = status === "detecting" || status === "done";

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
              Paste the link to a concert, a programme or a channel page, or a direct stream link. We find the live stream and play it here, clean.
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
        {status === "done" && result && <DetectionResult key={result.url} result={result} onReset={reset} autoplay={autoplay ?? (result.live ? { at: 0 } : null)} />}
      </div>

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
        <section className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            className="group flex items-center gap-4 rounded-3xl bg-gradient-to-r from-signal/[.08] to-transparent p-5 ring-1 ring-signal/20 transition hover:ring-signal/40 sm:col-span-2 lg:col-span-4"
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

      <AddSiteDialog open={adding} onClose={() => setAdding(false)} uid={user?.uid} defaultKind="live" title="Add a live channel" />
    </div>
  );
}
