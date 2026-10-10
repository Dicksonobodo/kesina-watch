import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ChevronDown, Compass, ExternalLink, Globe, Pin, PinOff, Search, ShieldCheck } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { api, isDemoApi } from "@/lib/api";
import { hostnameOf } from "@/lib/format";
import { paletteFor } from "@/lib/palette";
import { idFromUrl, removeItem, useUserCollection } from "@/lib/userData";
import { pinSite, prettyHost } from "@/features/sites/SitesPage";
import { Button } from "@/components/ui/Button";
import { Poster } from "@/components/ui/Poster";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { DetectSheet } from "./DetectSheet";

/**
 * Browse a movie site the clean way: our server reads the site with ads blocked and returns
 * just the movies. You see a Dixon Watch poster grid, the site's menu and search, and tap a
 * poster to watch or download, without ever loading the site's own (ad-filled) pages.
 */
export function BrowsePage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [address, setAddress] = useState(params.get("site") ?? "");
  const [page, setPage] = useState(null); // current listing
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState([]); // listing URLs for the back button
  const [status, setStatus] = useState("idle"); // idle | loading | more | error
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null); // grid item shown in the detect sheet
  const { items: sites } = useUserCollection(user?.uid, "sites");
  const movieSites = sites.filter((s) => s.kind !== "live");
  const topRef = useRef(null);
  const pageRef = useRef(null);
  pageRef.current = page;

  const load = useCallback(
    async (url, { append = false, push = true } = {}) => {
      if (isDemoApi) {
        setError("Browsing sites needs the Dixon Watch server.");
        setStatus("error");
        return;
      }
      setStatus(append ? "more" : "loading");
      setError("");
      try {
        const data = await api("/browse", { method: "POST", body: { url }, signal: AbortSignal.timeout(80_000) });
        if (push && !append && pageRef.current) setHistory((h) => [...h, pageRef.current.url]);
        setPage(data);
        setItems((prev) => {
          if (!append) return data.items;
          const seen = new Set(prev.map((i) => i.link));
          return [...prev, ...data.items.filter((i) => !seen.has(i.link))];
        });
        setStatus("idle");
        if (!append) {
          setParams({ site: data.url }, { replace: true });
          topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } catch (err) {
        setError(err.message);
        setStatus(append ? "idle" : "error");
      }
    },
    [setParams],
  );

  // /browse?site=… (from pinned sites or a shared link) opens straight away.
  useEffect(() => {
    const site = params.get("site");
    if (site && !page) load(site, { push: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openAddress(e) {
    e.preventDefault();
    const value = address.trim();
    if (!value) return;
    setHistory([]);
    load(value, { push: false });
  }

  function back() {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    load(prev, { push: false });
  }

  function search(e) {
    e.preventDefault();
    if (!page?.search || !query.trim()) return;
    load(page.search.replace("{q}", encodeURIComponent(query.trim())));
  }

  const pinned = page && sites.some((s) => s.id === idFromUrl("site", page.url) || hostnameOf(s.url) === page.site);
  async function togglePin() {
    if (!user || !page) return;
    const existing = sites.find((s) => hostnameOf(s.url) === page.site);
    if (existing) await removeItem(user.uid, "sites", existing.id);
    else await pinSite(user.uid, { url: new URL("/", page.url).href, name: page.siteName || prettyHost(page.url), kind: "movies" });
  }

  return (
    <div ref={topRef} className="scroll-mt-20">
      <header>
        <p className="font-mono text-[11px] font-medium tracking-[.22em] text-mist-500 uppercase">Movie sites, minus the ads</p>
        {!page && (
          <>
            <h1 className="mt-3 font-display text-[clamp(34px,6vw,64px)] leading-[0.95] font-extrabold tracking-[-0.035em]">
              Browse any site.
              <br />
              <span className="text-signal">See only the movies.</span>
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-mist-500">
              Type a movie website. We open it for you with every ad, pop-up and fake button stripped out, and show you its movies here. Tap one to watch or download.
            </p>
          </>
        )}

        {/* Address bar */}
        <form onSubmit={openAddress} className={cn("glass-strong flex items-center gap-2 rounded-full p-1.5 pl-4", page ? "mt-4" : "mt-7")}>
          <Globe className="size-5 shrink-0 text-mist-500" />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            inputMode="url"
            placeholder="somemoviesite.com"
            aria-label="Website address"
            className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-mist-700"
          />
          <Button type="submit" loading={status === "loading" && !page} className="shrink-0">
            {!(status === "loading" && !page) && <Compass className="size-4" />} Open
          </Button>
        </form>
      </header>

      {status === "error" && <p className="mt-4 rounded-2xl bg-live/[.08] px-4 py-3 text-sm text-live ring-1 ring-live/25">{error}</p>}

      {/* No site open: pinned movie sites */}
      {!page && status !== "loading" && (
        <section className="mt-10">
          <h2 className="mb-3 font-mono text-[11px] font-medium tracking-[.22em] text-mist-500 uppercase">Your sites</h2>
          {movieSites.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {movieSites.map((s) => {
                const [a, b, c] = paletteFor(s.url);
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setAddress(s.url);
                      load(s.url, { push: false });
                    }}
                    className="group relative aspect-[16/10] overflow-hidden rounded-3xl text-left ring-1 ring-white/10"
                  >
                    <div className="absolute inset-0 transition duration-500 group-hover:scale-105" style={{ background: `radial-gradient(90% 90% at 85% 0%, ${a}cc, transparent 60%), radial-gradient(80% 80% at 0% 100%, ${b}aa, transparent 60%), ${c}` }} />
                    <span className="absolute -right-2 -bottom-6 font-display text-[90px] leading-none font-extrabold text-white/10 uppercase">{s.name[0]}</span>
                    <span className="absolute inset-x-4 bottom-4">
                      <span className="block truncate font-display font-bold">{s.name}</span>
                      <span className="block truncate font-mono text-[11px] text-white/60">{hostnameOf(s.url)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="max-w-lg text-sm text-mist-500">Sites you pin show up here. Open a site above, then tap the pin to keep it.</p>
          )}
        </section>
      )}

      {/* First load */}
      {status === "loading" && !page && <GridSkeleton note="Opening the site with ads blocked… script-heavy sites can take up to a minute." />}

      {/* A site is open */}
      {page && (
        <section className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            {history.length > 0 && (
              <button onClick={back} aria-label="Back" className="grid size-10 place-items-center rounded-full bg-white/[.06] transition hover:bg-white/[.12]">
                <ArrowLeft className="size-4" />
              </button>
            )}
            <span className="grid size-10 shrink-0 place-items-center rounded-xl font-display text-lg font-bold text-ink-950" style={{ background: paletteFor(page.site)[0] }}>
              {(page.siteName || page.site)[0]?.toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-xl font-bold tracking-tight">{page.siteName || page.site}</p>
              <p className="truncate font-mono text-[11px] text-mist-500">{page.pageTitle || page.url}</p>
            </div>
            <span className="hidden items-center gap-1.5 rounded-full bg-signal/10 px-3 py-1.5 font-mono text-[11px] text-signal ring-1 ring-signal/25 sm:inline-flex">
              <ShieldCheck className="size-3.5" /> No ads{page.adsBlocked ? ` · ${page.adsBlocked} blocked` : ""}
            </span>
            <button onClick={togglePin} className={cn("grid size-10 place-items-center rounded-full transition", pinned ? "bg-signal/15 text-signal" : "bg-white/[.06] text-mist-300 hover:bg-white/[.12]")} aria-label={pinned ? "Unpin site" : "Pin site"} title={pinned ? "Unpin site" : "Pin site"}>
              {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            </button>
            <a href={page.url} target="_blank" rel="noopener noreferrer" className="grid size-10 place-items-center rounded-full bg-white/[.06] text-mist-300 transition hover:bg-white/[.12]" aria-label="Open the original site" title="Open the original site (with its ads)">
              <ExternalLink className="size-4" />
            </a>
          </div>

          {/* Site menu + search */}
          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
            {page.search && (
              <form onSubmit={search} className="flex h-10 items-center gap-2 rounded-full bg-white/[.04] px-4 ring-1 ring-white/[.08] focus-within:ring-2 focus-within:ring-signal/60 lg:w-72">
                <Search className="size-4 text-mist-500" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${page.siteName || "this site"}`} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-mist-700" />
              </form>
            )}
            {page.menu.length > 0 && (
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
                {page.menu.map((m) => (
                  <button
                    key={m.link}
                    onClick={() => load(m.link)}
                    className={cn("h-9 shrink-0 rounded-full px-3.5 text-[12.5px] font-semibold ring-1 transition", m.link === page.url ? "bg-signal/10 text-signal ring-signal/50" : "text-mist-300 ring-white/10 hover:text-mist-100")}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Poster grid */}
          {status === "loading" ? (
            <GridSkeleton />
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              <AnimatePresence initial={false}>
                {items.map((item, i) => (
                  <motion.button
                    key={item.link}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i % 24, 12) * 0.02 }}
                    onClick={() => setOpen(item)}
                    className="group text-left"
                  >
                    <div className="relative">
                      <Poster
                        src={item.poster}
                        title={item.title}
                        year={item.year}
                        palette={paletteFor(item.title)}
                        className="transition duration-300 group-hover:-translate-y-1 group-hover:shadow-2xl group-hover:shadow-black/60 group-hover:ring-signal/40"
                      />
                      {item.badge && (
                        <span className="absolute top-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white backdrop-blur">{item.badge}</span>
                      )}
                    </div>
                    <p className="mt-2.5 line-clamp-2 text-[13.5px] leading-snug font-semibold">{item.title}</p>
                    {item.year && <p className="font-mono text-[11px] text-mist-500">{item.year}</p>}
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          )}

          {page.next && status !== "loading" && (
            <div className="mt-10 flex justify-center">
              <Button variant="ghost" size="lg" loading={status === "more"} onClick={() => load(page.next, { append: true, push: false })}>
                {status !== "more" && <ChevronDown className="size-4" />} Load more
              </Button>
            </div>
          )}
          {error && status === "idle" && <p className="mt-4 text-center text-sm text-live">{error}</p>}
        </section>
      )}

      <AnimatePresence>{open && <DetectSheet key={open.link} item={open} onClose={() => setOpen(null)} />}</AnimatePresence>
    </div>
  );
}

function GridSkeleton({ note }) {
  return (
    <div className="mt-6">
      {note && (
        <p className="mb-4 flex items-center gap-2 text-sm text-mist-500">
          <Spinner className="size-3.5 text-signal" /> {note}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i}>
            <div className="skeleton aspect-[2/3] rounded-2xl" />
            <div className="skeleton mt-2.5 h-3.5 w-3/4 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
