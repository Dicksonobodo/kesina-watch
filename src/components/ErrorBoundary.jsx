import { Component } from "react";
import { RotateCcw } from "lucide-react";
import { reportError } from "@/lib/monitoring";
import { LogoMark } from "@/components/ui/Logo";

/**
 * Catches crashes while rendering so visitors see a friendly screen instead of a blank page.
 * variant="page": inside the app shell (the sidebar keeps working). variant="app": whole screen.
 * After a new deployment, old tabs can fail to load code that no longer exists: that case
 * reloads the page once automatically.
 */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (isStaleChunk(error) && !sessionStorageFlag("dw-reloaded")) {
      sessionStorageFlag("dw-reloaded", true);
      window.location.reload();
      return;
    }
    reportError(error, { where: `render:${this.props.name || "app"}`, componentStack: info.componentStack?.slice(0, 800) });
  }

  componentDidUpdate(prev) {
    // Navigating to another page clears a page-level crash.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const page = this.props.variant === "page";
    return (
      <div className={page ? "grid min-h-[60vh] place-items-center px-4" : "grid min-h-dvh place-items-center bg-ink-950 px-6"}>
        <div className="max-w-sm text-center">
          {!page && <LogoMark className="mx-auto size-12" />}
          <p className="mt-6 font-display text-2xl font-bold tracking-tight">Something broke on this page</p>
          <p className="mt-2 text-sm leading-relaxed text-mist-500">
            It&apos;s been reported automatically. Reloading usually fixes it.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-signal px-5 text-sm font-semibold text-ink-950 transition hover:bg-signal-dim"
            >
              <RotateCcw className="size-4" /> Reload
            </button>
            {page && (
              <button
                onClick={() => this.setState({ error: null })}
                className="glass inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold"
              >
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}

function isStaleChunk(error) {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    error?.message || "",
  );
}

function sessionStorageFlag(key, value) {
  try {
    if (value === undefined) return sessionStorage.getItem(key) === "1";
    sessionStorage.setItem(key, "1");
  } catch {
    return false;
  }
}
