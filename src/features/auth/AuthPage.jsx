import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Trophy, Eye, EyeOff, Lock, Mail, MousePointerClick, ShieldCheck, UserRound, Zap } from "lucide-react";
import { useAuth, isFirebaseConfigured } from "./AuthProvider";
import { authErrorMessage } from "./authErrors";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
import { Logo } from "@/components/ui/Logo";
import { Splash } from "@/components/layout/Splash";
import { cn } from "@/lib/cn";

const MODES = { signin: "Sign in", signup: "Create account" };

export function AuthPage() {
  const { user, loading, isPreview, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/";

  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(null); // "google" | "email" | "reset"
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (loading) return <Splash />;
  if (user && !isPreview) return <Navigate to={from} replace />;

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function run(kind, action) {
    setBusy(kind);
    setError("");
    setNotice("");
    try {
      await action();
      if (kind !== "reset") navigate(from, { replace: true });
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    run("email", () =>
      mode === "signup"
        ? signUpWithEmail(form.name.trim(), form.email.trim(), form.password)
        : signInWithEmail(form.email.trim(), form.password),
    );
  }

  function onForgot() {
    if (!form.email) return setError("Type your email above first, then tap “Forgot password”.");
    run("reset", async () => {
      await resetPassword(form.email.trim());
      setNotice(`Reset link sent to ${form.email.trim()}. Check your inbox.`);
    });
  }

  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <Showcase />

      <div className="relative flex flex-col px-5 py-8 sm:px-10 lg:px-16">
        <div className="lg:hidden">
          <Logo />
        </div>

        <div className="mx-auto my-auto w-full max-w-[400px] pt-10 lg:pt-0">
          <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">
            {mode === "signin" ? "Welcome back." : "Start watching."}
          </h1>
          <p className="mt-2 text-[15px] text-mist-500">
            {mode === "signin" ? "Sign in to your scores, games and channels." : "One account. Every device. Play to win."}
          </p>

          {/* Mode switch */}
          <div className="mt-8 grid grid-cols-2 rounded-full bg-white/[.04] p-1 ring-1 ring-white/[.07]">
            {Object.entries(MODES).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setMode(key);
                  setError("");
                  setNotice("");
                }}
                className={cn(
                  "relative h-10 rounded-full text-sm font-semibold transition",
                  mode === key ? "text-ink-950" : "text-mist-500 hover:text-mist-100",
                )}
              >
                {mode === key && (
                  <motion.span
                    layoutId="auth-mode"
                    className="absolute inset-0 rounded-full bg-mist-100"
                    transition={{ type: "spring", stiffness: 450, damping: 36 }}
                  />
                )}
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>

          <Button
            variant="light"
            size="lg"
            className="mt-6 w-full"
            loading={busy === "google"}
            disabled={Boolean(busy)}
            onClick={() => run("google", signInWithGoogle)}
          >
            {busy !== "google" && <GoogleIcon />}
            Continue with Google
          </Button>

          <div className="my-6 flex items-center gap-4 text-xs text-mist-700">
            <span className="h-px flex-1 bg-white/[.07]" />
            or with email
            <span className="h-px flex-1 bg-white/[.07]" />
          </div>

          <form onSubmit={onSubmit} className="space-y-3.5">
            <AnimatePresence initial={false}>
              {mode === "signup" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <Field id="name" icon={UserRound} placeholder="Your name" autoComplete="name" value={form.name} onChange={update("name")} />
                </motion.div>
              )}
            </AnimatePresence>

            <Field
              id="email"
              type="email"
              icon={Mail}
              placeholder="you@example.com"
              autoComplete="email"
              required
              value={form.email}
              onChange={update("email")}
            />
            <Field
              id="password"
              type={showPassword ? "text" : "password"}
              icon={Lock}
              placeholder={mode === "signup" ? "Create a password (6+ characters)" : "Password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={form.password}
              onChange={update("password")}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="text-mist-500 transition hover:text-mist-100"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                </button>
              }
            />

            {mode === "signin" && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onForgot}
                  disabled={busy === "reset"}
                  className="text-[13px] font-medium text-mist-500 transition hover:text-signal"
                >
                  {busy === "reset" ? "Sending…" : "Forgot password?"}
                </button>
              </div>
            )}

            <AnimatePresence mode="wait">
              {(error || notice) && (
                <motion.p
                  key={error || notice}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role={error ? "alert" : "status"}
                  className={cn(
                    "rounded-xl px-3.5 py-2.5 text-[13px] ring-1",
                    error ? "bg-live/[.08] text-live ring-live/25" : "bg-signal/[.08] text-signal ring-signal/25",
                  )}
                >
                  {error || notice}
                </motion.p>
              )}
            </AnimatePresence>

            <Button type="submit" size="lg" className="mt-2 w-full" loading={busy === "email"} disabled={Boolean(busy)}>
              {MODES[mode]}
              {busy !== "email" && <ArrowRight className="size-[18px]" />}
            </Button>
          </form>

          {!isFirebaseConfigured && (
            <p className="mt-6 text-center text-xs text-mist-700">
              Firebase isn&apos;t connected yet. Add your keys to <code className="font-mono text-mist-500">.env</code>.
            </p>
          )}
        </div>

        <p className="mx-auto mt-10 max-w-[400px] text-center text-xs leading-relaxed text-mist-700">
          By continuing you agree to only watch content you have the right to watch.
        </p>
      </div>
    </div>
  );
}

const SHOWCASE_PHOTOS = [
  { src: "/home/sports.webp", className: "left-[6%] top-[14%] w-[34%] -rotate-[8deg]", delay: 0 },
  { src: "/games/trophy.webp", className: "left-[34%] top-[6%] w-[38%] rotate-[3deg] z-10", delay: 0.6 },
  { src: "/home/live.webp", className: "right-[4%] top-[20%] w-[32%] rotate-[10deg]", delay: 1.2 },
];

const PERKS = [
  { icon: ShieldCheck, text: "Live streams with ads and pop-ups blocked" },
  { icon: Trophy, text: "Live scores, tables and news for 35+ competitions" },
  { icon: Zap, text: "Quizzes, predictions and battles with friends" },
];

function Showcase() {
  return (
    <div className="relative hidden overflow-hidden border-r border-white/[.06] bg-ink-900 lg:flex lg:flex-col">
      <div className="absolute -top-32 -left-24 size-[520px] rounded-full bg-violet-600/20 blur-[120px]" />
      <div className="absolute right-0 bottom-0 size-[420px] rounded-full bg-signal/[.08] blur-[110px]" />

      <div className="relative p-10">
        <Logo />
      </div>

      <div className="relative mx-10 h-[46%] min-h-[300px]">
        {SHOWCASE_PHOTOS.map((p) => (
          <motion.div
            key={p.src}
            className={cn("absolute", p.className)}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: [0, -10, 0] }}
            transition={{
              opacity: { duration: 0.8, delay: p.delay * 0.3 },
              y: { duration: 6, repeat: Infinity, ease: "easeInOut", delay: p.delay },
            }}
          >
            <img src={p.src} alt="" className="aspect-[3/4] w-full rounded-2xl object-cover shadow-2xl ring-1 shadow-black/60 ring-white/15" />
          </motion.div>
        ))}
      </div>

      <div className="relative mt-auto p-10 pt-6">
        <h2 className="font-display text-[clamp(36px,4vw,56px)] leading-[0.98] font-extrabold tracking-tight">
          Watch live. Follow the game.
          <br />
          <span className="text-signal text-glow">Zero ads.</span>
        </h2>
        <ul className="mt-8 space-y-3">
          {PERKS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-[15px] text-mist-300">
              <span className="grid size-8 place-items-center rounded-lg bg-white/[.05] ring-1 ring-white/10">
                <Icon className="size-4 text-signal" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
