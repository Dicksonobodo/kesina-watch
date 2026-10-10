import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { BookmarkMinus, Play, ScanSearch, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { Poster } from "@/components/ui/Poster";
import { cn } from "@/lib/cn";
import { ACTIVE, useDownloads } from "@/features/downloads/DownloadsProvider";
import { JobCard } from "@/features/downloads/JobCard";
import { useLibrary } from "./LibraryProvider";

const MATCHES = {
  all: () => true,
  downloading: (j) => ACTIVE.has(j.status) || j.status === "remote",
  completed: (j) => j.status === "done" || j.status === "handed",
  saved: () => false,
  failed: (j) => j.status === "error" || j.status === "interrupted",
};

const TABS = [
  { id: "all", label: "All" },
  { id: "downloading", label: "Downloading" },
  { id: "completed", label: "Completed" },
  { id: "saved", label: "Saved" },
  { id: "failed", label: "Failed" },
];

export function LibraryPage() {
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const { items } = useDownloads();
  const { saved, loading } = useLibrary();

  const q = query.trim().toLowerCase();
  const matchesQuery = (x) => !q || x.title?.toLowerCase().includes(q) || x.site?.toLowerCase().includes(q);
  const downloads = items.filter((j) => MATCHES[tab](j) && matchesQuery(j));
  const savedShown = tab === "all" || tab === "saved" ? saved.filter(matchesQuery) : [];
  const count = (id) => (id === "saved" ? saved.length : items.filter(MATCHES[id]).length);
  const empty = !downloads.length && !savedShown.length;

  return (
    <div>
      <PageHeader
        eyebrow="Your collection"
        title="Library"
        description="Everything you've downloaded or saved, synced across every device you sign in on."
        action={
          <label className="flex h-11 w-full items-center gap-2.5 rounded-full bg-white/[.04] px-4 ring-1 ring-white/[.08] transition focus-within:ring-2 focus-within:ring-signal/70 sm:w-72">
            <Search className="size-4 text-mist-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your library"
              className="w-full bg-transparent text-sm outline-none placeholder:text-mist-700"
            />
          </label>
        }
      />

      <div className="-mx-4 mt-8 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="inline-flex gap-1 rounded-full bg-white/[.03] p-1 ring-1 ring-white/[.06]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative h-9 rounded-full px-4 text-[13px] font-semibold whitespace-nowrap transition",
                tab === t.id ? "text-ink-950" : "text-mist-500 hover:text-mist-100",
              )}
            >
              {tab === t.id && (
                <motion.span
                  layoutId="library-tab"
                  className="absolute inset-0 rounded-full bg-mist-100"
                  transition={{ type: "spring", stiffness: 450, damping: 36 }}
                />
              )}
              <span className="relative">
                {t.label}
                {count(t.id) > 0 && <span className="ml-1.5 font-mono text-[11px] opacity-60">{count(t.id)}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-10">
        {loading ? (
          <div className="grid gap-2.5 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-[82px] rounded-2xl" />
            ))}
          </div>
        ) : empty ? (
          <EmptyState
            art={<StackArt />}
            title={q ? "Nothing matches that search" : tab === "all" ? "Your library is empty" : "Nothing here yet"}
            body={
              tab === "saved"
                ? "Tap the bookmark on any detected movie to keep it here for later."
                : "Detect a movie and download or save it. It shows up here on every device you sign in on."
            }
            action={
              <Link to="/">
                <Button>
                  <ScanSearch className="size-[18px]" /> Detect a movie
                </Button>
              </Link>
            }
          />
        ) : (
          <>
            {savedShown.length > 0 && (
              <section>
                {tab === "all" && <SectionTitle>Saved for later</SectionTitle>}
                <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  <AnimatePresence initial={false}>
                    {savedShown.map((item) => (
                      <SavedTile key={item.id} item={item} />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            )}
            {downloads.length > 0 && (
              <section>
                {tab === "all" && savedShown.length > 0 && <SectionTitle>Downloads</SectionTitle>}
                <div className="grid gap-2.5 lg:grid-cols-2">
                  <AnimatePresence initial={false}>
                    {downloads.map((job) => (
                      <JobCard key={job.id} job={job} place="library" />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 className="mb-4 font-mono text-[11px] font-medium tracking-[.22em] text-mist-500 uppercase">{children}</h2>;
}

function SavedTile({ item }) {
  const { remove } = useLibrary();
  const navigate = useNavigate();
  const open = () => navigate(`/?u=${encodeURIComponent(item.pageUrl)}`);

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="group">
      <div className="relative">
        <button onClick={open} className="block w-full text-left" aria-label={`Open ${item.title}`}>
          <Poster
            src={item.poster}
            title={item.title}
            year={item.year}
            palette={item.palette ?? undefined}
            className="transition duration-300 group-hover:-translate-y-1 group-hover:shadow-2xl group-hover:shadow-black/60"
          />
          <span className="absolute inset-0 grid place-items-center rounded-2xl bg-black/50 opacity-0 transition group-hover:opacity-100">
            <span className="grid size-12 place-items-center rounded-full bg-signal text-ink-950 shadow-[0_0_40px_-8px_rgb(198_255_61/.8)]">
              <Play className="ml-0.5 size-5" fill="currentColor" />
            </span>
          </span>
        </button>
        <button
          onClick={() => remove(item.id)}
          aria-label="Remove from saved"
          title="Remove from saved"
          className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 text-mist-100 opacity-100 backdrop-blur transition hover:bg-live hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
        >
          <BookmarkMinus className="size-4" />
        </button>
      </div>
      <p className="mt-2.5 truncate text-sm font-semibold">{item.title}</p>
      <p className="truncate font-mono text-[11px] text-mist-500">{[item.year, item.site].filter(Boolean).join(" · ")}</p>
    </motion.div>
  );
}

function StackArt() {
  return (
    <div className="relative h-36 w-40">
      {[
        { palette: ["#ff4ecd", "#3a0ca3", "#0d0221"], rotate: -12, x: -34 },
        { palette: ["#2de2e6", "#0b3d91", "#050b1f"], rotate: 10, x: 34 },
        { palette: ["#c6ff3d", "#0f7b5f", "#04140f"], rotate: 0, x: 0 },
      ].map((p, i) => (
        <motion.div
          key={i}
          className="absolute top-0 left-1/2 w-24"
          initial={{ opacity: 0, y: 20, rotate: 0, x: "-50%" }}
          animate={{ opacity: i === 2 ? 1 : 0.6, y: 0, rotate: p.rotate, x: `calc(-50% + ${p.x}px)` }}
          transition={{ delay: 0.1 + i * 0.08, type: "spring", stiffness: 200, damping: 20 }}
        >
          <Poster title="" palette={p.palette} className="rounded-xl" />
        </motion.div>
      ))}
    </div>
  );
}
