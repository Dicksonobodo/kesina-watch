import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ExternalLink, Link2, Pin, Plus, Radio, Trash2, Type } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { Badge, LiveDot } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { hostnameOf, isHttpUrl } from "@/lib/format";
import { paletteFor } from "@/lib/palette";
import { idFromUrl, putItem, removeItem, useUserCollection } from "@/lib/userData";
import { cn } from "@/lib/cn";

/** Pinned live pages (a channel, a concert page) in users/{uid}/sites. */
export function SitesPage() {
  const { user } = useAuth();
  const { items: allSites, loading } = useUserCollection(user?.uid, "sites");
  const sites = allSites.filter((s) => s.kind === "live");
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <PageHeader
        eyebrow="Watch anywhere"
        title="Sites"
        description="Pin pages you come back to, like a live channel or a concert stream. Tap one to play it here, ad-free."
        action={
          <Button onClick={() => setAdding(true)} className="w-full sm:w-auto">
            <Plus className="size-[18px]" /> Pin a page
          </Button>
        }
      />

      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {loading
          ? [0, 1, 2].map((i) => <div key={i} className="skeleton aspect-[4/3] rounded-3xl" />)
          : (
            <>
              <AnimatePresence initial={false}>
                {sites.map((site) => (
                  <SiteTile key={site.id} site={site} uid={user.uid} />
                ))}
              </AnimatePresence>
              <motion.button
                layout
                onClick={() => setAdding(true)}
                className="group flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/[.12] text-mist-500 transition hover:border-signal/50 hover:text-signal"
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-white/[.04] ring-1 ring-white/10 transition group-hover:bg-signal/10 group-hover:ring-signal/30">
                  <Plus className="size-5" />
                </span>
                <span className="text-sm font-semibold">Pin a page</span>
              </motion.button>
            </>
          )}
      </div>

      {!loading && sites.length === 0 && (
        <p className="mt-6 max-w-lg text-sm text-mist-500">
          Tip: pin the exact page where the live player is (the channel or event page), not the site&apos;s home page. You can also pin a live stream straight from its result with the pin button.
        </p>
      )}

      <AddSiteDialog open={adding} onClose={() => setAdding(false)} uid={user?.uid} />
    </div>
  );
}

export function SiteTile({ site, uid }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [a, b, c] = paletteFor(site.url);
  const host = hostnameOf(site.url);

  function open() {
    putItem(uid, "sites", site.id, { lastVisited: Date.now() }).catch(() => {});
    navigate(`/live?u=${encodeURIComponent(site.url)}`);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="group relative aspect-[4/3] overflow-hidden rounded-3xl ring-1 ring-white/10"
      onMouseLeave={() => setConfirming(false)}
    >
      <button onClick={open} className="absolute inset-0 text-left" aria-label={`Play ${site.name}`}>
        <div
          className="absolute inset-0 transition duration-500 group-hover:scale-105"
          style={{ background: `radial-gradient(90% 90% at 85% 0%, ${a}cc, transparent 60%), radial-gradient(80% 80% at 0% 100%, ${b}aa, transparent 60%), ${c}` }}
        />
        <span className="pointer-events-none absolute -right-3 -bottom-8 font-display text-[110px] leading-none font-extrabold text-white/10 uppercase">
          {site.name.trim()[0] ?? "?"}
        </span>
        <div className="absolute inset-0 flex flex-col justify-between p-4">
          <div className="flex items-start justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-black/30 ring-1 ring-white/10 backdrop-blur">
              <Radio className="size-5" />
            </span>
            {site.kind === "live" && (
              <Badge tone="live" className="!bg-black/60 !text-white !ring-white/15 backdrop-blur">
                <LiveDot /> Live
              </Badge>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] font-bold">{site.name}</p>
            <p className="truncate font-mono text-[11px] text-white/60">{host}</p>
          </div>
        </div>
      </button>

      <div className="absolute top-3 right-3 flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100" style={site.kind === "live" ? { top: "3.25rem" } : undefined}>
        <a
          href={site.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open original page"
          title="Open original page"
          className="grid size-8 place-items-center rounded-full bg-black/50 text-mist-100 backdrop-blur transition hover:bg-black/70"
        >
          <ExternalLink className="size-3.5" />
        </a>
        <button
          onClick={() => (confirming ? removeItem(uid, "sites", site.id) : setConfirming(true))}
          aria-label={confirming ? "Tap again to unpin" : "Unpin"}
          title={confirming ? "Tap again to unpin" : "Unpin"}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-full px-2 backdrop-blur transition",
            confirming ? "bg-live text-white" : "w-8 justify-center bg-black/50 text-mist-100 hover:bg-black/70",
          )}
        >
          <Trash2 className="size-3.5" />
          {confirming && <span className="text-[11px] font-semibold">Unpin</span>}
        </button>
      </div>
    </motion.div>
  );
}

export function AddSiteDialog({ open, onClose, uid, title = "Pin a page" }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function close() {
    setUrl("");
    setName("");
    setError("");
    onClose();
  }

  async function save(e) {
    e.preventDefault();
    const link = url.trim();
    if (!isHttpUrl(link)) return setError("Paste a full link that starts with http:// or https://");
    setSaving(true);
    try {
      await pinSite(uid, { url: link, name: name.trim() || prettyHost(link), kind: "live" });
      close();
    } catch (err) {
      setError(err.message || "Couldn't pin that page.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} title={title}>
      <form onSubmit={save} className="space-y-3.5">
        <Field
          id="site-url"
          icon={Link2}
          placeholder="https://… the page with the player"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError("");
          }}
          inputMode="url"
          autoFocus
        />
        <Field id="site-name" icon={Type} placeholder={prettyHost(url) || "Name (optional)"} value={name} onChange={(e) => setName(e.target.value)} />

        {error && <p className="text-[13px] text-live">{error}</p>}

        <Button type="submit" size="lg" className="mt-2 w-full" loading={saving}>
          {!saving && <Pin className="size-[18px]" />} Pin it
        </Button>
      </form>
    </Dialog>
  );
}

export function pinSite(uid, { url, name, kind }) {
  return putItem(uid, "sites", idFromUrl("site", url), { url, name, kind, createdAt: Date.now() });
}

export function prettyHost(url) {
  const host = hostnameOf(url);
  if (!host) return "";
  const base = host.split(".").slice(-2, -1)[0] || host;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
