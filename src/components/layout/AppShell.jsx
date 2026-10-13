import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { Gamepad2, Gauge, Pin, Radio, ShieldCheck, Trophy, UserRound, WifiOff } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAuth, isFirebaseConfigured } from "@/features/auth/AuthProvider";
import { useShield } from "@/features/shield/ShieldProvider";
import { PresenceReporter } from "@/features/account/PresenceReporter";
import { useAccount } from "@/features/account/AccountProvider";
import { Logo } from "@/components/ui/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { cn } from "@/lib/cn";
import { onSyncProblem } from "@/lib/userData";

const NAV = [
  { to: "/live", label: "Live", icon: Radio },
  { to: "/sports", label: "Sports", icon: Trophy },
  { to: "/games", label: "Games", icon: Gamepad2 },
  { to: "/sites", label: "Pinned", icon: Pin, desktopOnly: true },
  // On phones, Profile is the avatar in the top bar (the tab bar holds the main sections).
  { to: "/profile", label: "Profile", icon: UserRound, hidden: true },
];
const ADMIN_NAV = { to: "/admin", label: "Admin", icon: Gauge };

export function AppShell() {
  const { user } = useAuth();
  const location = useLocation();
  const [syncProblem, setSyncProblem] = useState(null);
  useEffect(() => onSyncProblem(setSyncProblem), []);
  const online = useOnline();
  const { admin, adminServer } = useAccount();
  // The live dashboard needs the detection server; otherwise Admin opens the question review.
  const adminNav = { ...ADMIN_NAV, to: adminServer ? "/admin" : "/games/moderate" };

  return (
    <div className="relative min-h-dvh lg:pl-72">
      <Ambient />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-white/[.06] bg-ink-950/60 p-5 backdrop-blur-xl lg:flex">
        <NavLink to="/" className="px-2 py-1.5">
          <Logo />
        </NavLink>

        <nav className="mt-10 space-y-1">
          {[...NAV.filter((n) => !n.hidden), ...(admin ? [adminNav] : [])].map((item) => (
            <SidebarLink key={item.to} {...item} />
          ))}
        </nav>

        <div className="mt-auto space-y-3">
          <ShieldCard />
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              cn("flex items-center gap-3 rounded-2xl p-2.5 transition hover:bg-white/[.05]", isActive && "bg-white/[.06]")
            }
          >
            <Avatar user={user} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{user?.displayName || "Your account"}</span>
              <span className="block truncate text-xs text-mist-500">{user?.email}</span>
            </span>
          </NavLink>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="glass-strong sticky top-0 z-30 flex h-14 items-center justify-between !border-x-0 !border-t-0 px-4 lg:hidden">
        <NavLink to="/">
          <Logo />
        </NavLink>
        <NavLink to="/profile" aria-label="Profile">
          <Avatar user={user} className="size-8" />
        </NavLink>
      </header>

      {!isFirebaseConfigured && <PreviewBanner />}
      {syncProblem && <SyncProblemBanner />}
      {!online && <OfflineBanner />}

      <main className="relative mx-auto w-full max-w-6xl px-4 pt-6 pb-32 sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* A crash inside one page keeps the sidebar and tab bar working. */}
          <ErrorBoundary variant="page" name={location.pathname} resetKey={location.pathname}>
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </motion.div>
      </main>

      <PresenceReporter />

      {/* Mobile tab bar */}
      <nav className="glass-strong fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-40 grid h-16 grid-cols-3 rounded-[22px] px-1.5 lg:hidden">
        {NAV.filter((n) => !n.desktopOnly && !n.hidden).map((item) => (
          <TabLink key={item.to} {...item} />
        ))}
      </nav>
    </div>
  );
}

function SidebarLink({ to, label, icon: Icon, end }) {
  return (
    <NavLink to={to} end={end} className="relative block">
      {({ isActive }) => (
        <span
          className={cn(
            "relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-medium transition",
            isActive ? "text-mist-100" : "text-mist-500 hover:text-mist-100",
          )}
        >
          {isActive && (
            <motion.span
              layoutId="sidebar-pill"
              className="absolute inset-0 rounded-xl bg-white/[.06] ring-1 ring-white/[.08]"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <Icon className={cn("relative size-[19px]", isActive && "text-signal")} />
          <span className="relative">{label}</span>
        </span>
      )}
    </NavLink>
  );
}

function TabLink({ to, label, icon: Icon, end }) {
  return (
    <NavLink to={to} end={end} className="relative grid place-items-center">
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="tab-pill"
              className="absolute inset-x-1.5 inset-y-2 rounded-2xl bg-white/[.07]"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <span className={cn("relative flex flex-col items-center gap-1", isActive ? "text-mist-100" : "text-mist-500")}>
            <Icon className={cn("size-5", isActive && "text-signal")} />
            <span className="text-[10.5px] font-semibold">{label}</span>
          </span>
        </>
      )}
    </NavLink>
  );
}

function ShieldCard() {
  const { stats } = useShield();
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-signal/[.12] to-transparent p-4 ring-1 ring-signal/20">
      <div className="absolute -top-8 -right-8 size-24 rounded-full bg-signal/20 blur-2xl" />
      <div className="relative flex items-center gap-2 text-signal">
        <ShieldCheck className="size-4" />
        <span className="font-mono text-[11px] font-medium tracking-[.18em] uppercase">Shield active</span>
      </div>
      <p className="relative mt-3 font-display text-3xl font-bold tracking-tight">
        <AnimatedNumber value={stats.ads} />
      </p>
      <p className="relative text-xs text-mist-500">ads blocked for you</p>
    </div>
  );
}

function PreviewBanner() {
  return (
    <div className="relative mx-auto mt-4 max-w-6xl px-4 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-live/[.08] px-4 py-3 text-[13px] text-mist-300 ring-1 ring-live/25">
        <span className="font-mono text-[11px] font-medium tracking-wider text-live uppercase">Preview</span>
        <span>
          Firebase isn&apos;t connected yet, so you&apos;re browsing as a preview user. Add your keys to{" "}
          <code className="font-mono text-mist-100">.env</code> to turn on real sign-in.
        </span>
      </div>
    </div>
  );
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function OfflineBanner() {
  return (
    <div className="relative mx-auto mt-4 max-w-6xl px-4 sm:px-6 lg:px-10">
      <div className="flex items-center gap-3 rounded-2xl bg-white/[.04] px-4 py-3 text-[13px] text-mist-300 ring-1 ring-white/10">
        <WifiOff className="size-4 shrink-0 text-mist-500" />
        You're offline. Finding streams, playing and scores need a connection.
      </div>
    </div>
  );
}

function PageLoading() {
  return (
    <div className="space-y-4 pt-2">
      <div className="skeleton h-4 w-32 rounded-full" />
      <div className="skeleton h-12 w-2/3 max-w-md rounded-2xl" />
      <div className="skeleton h-14 w-full rounded-full" />
    </div>
  );
}

// Shown when Firestore refuses access: almost always the security rules aren't published.
function SyncProblemBanner() {
  return (
    <div className="relative mx-auto mt-4 max-w-6xl px-4 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-live/[.08] px-4 py-3 text-[13px] text-mist-300 ring-1 ring-live/25">
        <span className="font-mono text-[11px] font-medium tracking-wider text-live uppercase">Sync off</span>
        <span>
          Your pinned pages can&apos;t be saved: Firestore is refusing access. In the Firebase console, open Firestore → Rules, paste the contents of{" "}
          <code className="font-mono text-mist-100">firestore.rules</code> and press Publish.
        </span>
      </div>
    </div>
  );
}

function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-40 left-1/4 size-[520px] rounded-full bg-signal/[.06] blur-[120px]" />
      <div className="absolute -right-40 bottom-0 size-[480px] rounded-full bg-violet-600/[.08] blur-[120px]" />
    </div>
  );
}
