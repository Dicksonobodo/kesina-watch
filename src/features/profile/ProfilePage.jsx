import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AtSign, Bookmark, Check, Crown, LogOut, Mail, Pencil, Send, ShieldCheck, Smartphone, UserRound, Zap } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { useShield } from "@/features/shield/ShieldProvider";
import { useAccount } from "@/features/account/AccountProvider";
import { api } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { saveUsername, useGameIdentity } from "@/lib/gameIdentity";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { cn } from "@/lib/cn";

export function ProfilePage() {
  const { user, isPreview, logout } = useAuth();
  const { stats } = useShield();
  const account = useAccount();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const game = useGameIdentity(Boolean(user));

  const provider = user?.providerData?.[0]?.providerId === "google.com" ? "Google" : isPreview ? "Preview" : "Email";

  async function onLogout() {
    setLeaving(true);
    await logout();
    navigate("/auth", { replace: true });
  }

  return (
    <div>
      <PageHeader eyebrow="Account" title="Profile" />

      <section className="glass relative mt-8 overflow-hidden rounded-[28px] p-6 sm:p-8">
        <div className="absolute -top-20 -right-10 size-60 rounded-full bg-signal/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="relative w-fit">
            {game?.avatar ? (
              <span className="grid size-20 place-items-center rounded-3xl bg-white/[.07] text-4xl ring-1 ring-white/10">{game.avatar}</span>
            ) : (
              <Avatar user={user} className="size-20 text-xl" />
            )}
            {user?.photoURL && game?.avatar && <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="absolute -right-2 -bottom-2 size-8 rounded-full object-cover ring-2 ring-ink-900" />}
            <Link to="/games/profile" className="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full bg-signal text-ink-950 shadow-lg" aria-label="Change avatar" title="Change avatar">
              <Pencil className="size-3.5" />
            </Link>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-2xl font-bold tracking-tight">{user?.displayName || game?.name || "Dixon Watch user"}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Detail icon={UserRound} label="Name" value={user?.displayName || "Not set"} />
              <UsernameRow game={game} />
              <Detail icon={Mail} label="Email" value={user?.email || "Not set"} />
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge>Signed in with {provider}</Badge>
              {account.premium ? (
                <Badge tone="signal">
                  <Crown className="size-3" /> Premium
                </Badge>
              ) : (
                <Badge>Free plan</Badge>
              )}
              {account.admin && (
                <Link to="/admin">
                  <Badge tone="live">Admin dashboard →</Badge>
                </Link>
              )}
            </div>
          </div>
          <Button variant="danger" onClick={onLogout} loading={leaving}>
            {!leaving && <LogOut className="size-4" />} Sign out
          </Button>
        </div>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Ads blocked" value={stats.ads} />
        <Stat label="Pop-ups stopped" value={stats.popups} />
        <Stat label="Pages shielded" value={stats.pages} />
      </section>

      <PremiumCard />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SendToDixon />
      </div>

      <section className="mt-10">
        <h3 className="font-mono text-[11px] font-medium tracking-[.22em] text-mist-500 uppercase">Preferences</h3>
        <div className="mt-3 divide-y divide-white/[.06] overflow-hidden rounded-3xl bg-white/[.025] ring-1 ring-white/[.06]">
          <Pref icon={ShieldCheck} title="Shield strength" value="Strict" />
        </div>
      </section>
    </div>
  );
}

/* ---------- Premium ---------- */

const PERKS = [
  "3× more detections per hour",
  "Twice as many streams at once",
  "Priority when the server is busy",
  "Support Dixon Watch staying ad-free",
];

function PremiumCard() {
  const account = useAccount();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { billing, premium } = account;

  // Back from Paystack: confirm the payment, then refresh the account.
  useEffect(() => {
    const reference = params.get("reference") || params.get("trxref");
    if (params.get("billing") !== "return" || !reference) return;
    setParams({}, { replace: true });
    setBusy(true);
    api(`/billing/verify?reference=${encodeURIComponent(reference)}`)
      .then(() => account.refresh({ forceToken: true }))
      .then(() => setMessage("Welcome to Premium! Your perks are active now."))
      .catch((err) => setMessage(err.message))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upgrade() {
    setBusy(true);
    setMessage("");
    try {
      const { url } = await api("/billing/checkout", { method: "POST" });
      window.location.href = url; // Paystack's secure payment page
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  }

  return (
    <section className="relative mt-4 overflow-hidden rounded-[28px] bg-gradient-to-br from-signal/[.12] via-white/[.02] to-violet-600/[.1] p-6 ring-1 ring-signal/20 sm:p-8">
      <div className="absolute -right-16 -bottom-24 size-72 rounded-full bg-signal/10 blur-3xl" />
      <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-[.22em] text-signal uppercase">
            <Crown className="size-3.5" /> Dixon Watch Premium
          </p>
          <h3 className="mt-3 font-display text-2xl font-bold tracking-tight">{premium ? "You're Premium. Thank you!" : "More speed. More at once."}</h3>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {PERKS.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm text-mist-300">
                <Check className="mt-0.5 size-4 shrink-0 text-signal" /> {p}
              </li>
            ))}
          </ul>
          {message && <p className="mt-4 text-sm text-mist-100">{message}</p>}
        </div>
        {!premium && (
          <div className="text-center md:text-right">
            <p className="font-display text-4xl font-bold">
              ₦{billing.price.toLocaleString()}
              <span className="text-base font-medium text-mist-500"> / {billing.days} days</span>
            </p>
            <Button size="lg" className="mt-4 w-full md:w-auto" onClick={upgrade} loading={busy} disabled={!billing.enabled}>
              {!busy && <Zap className="size-[18px]" />} {billing.enabled ? "Upgrade with Paystack" : "Coming soon"}
            </Button>
            <p className="mt-2 text-xs text-mist-700">{billing.enabled ? "Card, bank transfer or USSD · no auto-renew" : "Payments open soon."}</p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- Send to Dixon Watch ---------- */

function SendToDixon() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // A bookmark that opens the current page in Dixon Watch.
  const bookmarklet = `javascript:(()=>{location.href='${origin}/?u='+encodeURIComponent(location.href)})()`;
  const ref = (el) => el && el.setAttribute("href", bookmarklet); // React blocks javascript: hrefs in JSX
  return (
    <section className="rounded-3xl bg-white/[.025] p-6 ring-1 ring-white/[.06]">
      <h3 className="flex items-center gap-2 font-semibold">
        <Send className="size-4 text-signal" /> Send to Dixon Watch in one tap
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-mist-500">Skip copy and paste. On any live page, one tap opens it here with the ads stripped.</p>
      <div className="mt-5 space-y-4">
        <div>
          <p className="flex items-center gap-2 text-[13px] font-semibold text-mist-300">
            <Bookmark className="size-3.5" /> Computer
          </p>
          <p className="mt-1 text-sm text-mist-500">Drag this button to your bookmarks bar:</p>
          <a
            ref={ref}
            onClick={(e) => e.preventDefault()}
            className="mt-2 inline-flex cursor-grab items-center gap-2 rounded-full bg-signal px-4 py-2 text-sm font-semibold text-ink-950 active:cursor-grabbing"
            title="Drag me to your bookmarks bar"
          >
            ▶ Watch on Dixon
          </a>
        </div>
        <div>
          <p className="flex items-center gap-2 text-[13px] font-semibold text-mist-300">
            <Smartphone className="size-3.5" /> Android phone
          </p>
          <p className="mt-1 text-sm text-mist-500">
            Install Dixon Watch (browser menu → <em>Install app</em> / <em>Add to Home screen</em>). Then use <em>Share</em> on any page and pick Dixon Watch.
          </p>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-3xl bg-white/[.025] p-5 ring-1 ring-white/[.06]">
      <p className="font-mono text-[11px] tracking-[.18em] text-mist-500 uppercase">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold">
        <AnimatedNumber value={value} />
      </p>
    </div>
  );
}

function Pref({ icon: Icon, title, value }) {
  return (
    <div className={cn("flex items-center gap-4 px-5 py-4 opacity-60")}>
      <Icon className="size-[18px] text-mist-500" />
      <span className="flex-1 text-[15px]">{title}</span>
      <span className="text-sm text-mist-500">{value}</span>
    </div>
  );
}

/* ---------- name, username, email ---------- */

function Detail({ icon: Icon, label, value, children }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="size-4 shrink-0 text-mist-500" />
      <dt className="w-20 shrink-0 text-mist-500">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-mist-100">{children ?? value}</dd>
    </div>
  );
}

/** The username other players see (games, chat, leaderboards). Editable here. */
function UsernameRow({ game }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveUsername(value.trim());
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Detail icon={AtSign} label="Username">
        {editing ? (
          <form onSubmit={save} className="flex items-center gap-2">
            <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={20} autoFocus aria-label="New username" className="h-9 min-w-0 flex-1 rounded-xl bg-white/[.06] px-3 text-sm ring-1 ring-white/10 outline-none focus:ring-signal/60" />
            <Button size="sm" type="submit" loading={busy} disabled={value.trim().length < 2}>
              Save
            </Button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-mist-500">
              Cancel
            </button>
          </form>
        ) : (
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold">{game?.name ? `@${game.name}` : "…"}</span>
            {game?.name && (
              <button onClick={() => (setValue(game.name), setEditing(true))} className="inline-flex items-center gap-1 rounded-full bg-white/[.06] px-2.5 py-0.5 text-[11px] font-semibold text-signal ring-1 ring-white/10">
                <Pencil className="size-3" /> Change
              </button>
            )}
          </span>
        )}
      </Detail>
      <p className="mt-1 pl-[7.75rem] text-[11px] text-mist-500">What other players see in games, chat and leaderboards.</p>
      {error && <p className="mt-1 pl-[7.75rem] text-xs text-live">{error}</p>}
    </div>
  );
}
