import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { incrementDoc, watchDoc } from "@/lib/userData";

// All-time Shield totals for the user, kept in users/{uid}/stats/shield and synced across devices.
const ShieldContext = createContext(null);
const EMPTY = { ads: 0, popups: 0, pages: 0 };

export function ShieldProvider({ children }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [stats, setStats] = useState(EMPTY);

  useEffect(() => {
    if (!uid) return setStats(EMPTY);
    return watchDoc(uid, "stats", "shield", (data) =>
      setStats({ ads: data.ads ?? 0, popups: data.popups ?? 0, pages: data.pages ?? 0 }),
    );
  }, [uid]);

  const record = useCallback(
    ({ ads = 0, popups = 0 }) => {
      if (!uid) return;
      incrementDoc(uid, "stats", "shield", { ads, popups, pages: 1 }).catch(() => {}); // reported by the data layer
    },
    [uid],
  );

  const value = useMemo(() => ({ stats, record }), [stats, record]);
  return <ShieldContext.Provider value={value}>{children}</ShieldContext.Provider>;
}

export function useShield() {
  const ctx = useContext(ShieldContext);
  if (!ctx) throw new Error("useShield must be used inside <ShieldProvider>");
  return ctx;
}
