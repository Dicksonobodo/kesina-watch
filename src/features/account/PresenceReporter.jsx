import { useEffect, useRef, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import { api, isDemoApi } from "@/lib/api";
import { deviceName } from "@/lib/userData";

/*
 * Tells the server what this tab is doing (page, what's playing) every 30s and
 * right away when it changes, so the admin dashboard can show who is watching live.
 * The player calls setWatching() when it opens and closes.
 */

let watching = null;
const listeners = new Set();

export function setWatching(info) {
  watching = info;
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const getWatching = () => watching;

const HEARTBEAT_MS = 30_000;

export function PresenceReporter() {
  const { user, isPreview } = useAuth();
  const { pathname } = useLocation();
  const nowWatching = useSyncExternalStore(subscribe, getWatching);
  const state = useRef({});
  state.current = { page: pathname, watching: nowWatching, device: deviceName() };

  const enabled = Boolean(user && !isPreview && !isDemoApi);

  // Immediately when what the user is doing changes…
  useEffect(() => {
    if (enabled) api("/presence", { method: "POST", body: state.current }).catch(() => {});
  }, [enabled, pathname, nowWatching]);

  // …and every 30s while the tab is visible.
  useEffect(() => {
    if (!enabled) return;
    const beat = () => document.visibilityState === "visible" && api("/presence", { method: "POST", body: state.current }).catch(() => {});
    const timer = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [enabled]);

  return null;
}
