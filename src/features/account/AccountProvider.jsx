import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { api, isDemoApi } from "@/lib/api";
import { auth } from "@/lib/firebase";
import { gamesApi } from "@/lib/games";

/**
 * What the servers say about the signed-in user: admin?, premium?, and whether Premium can be
 * bought yet. Refreshed after payments (new token claims).
 *  - adminServer: admin according to the Live detection server (it has the live dashboard).
 *  - admin: admin according to either that server or the games function on Vercel
 *    (ADMIN_EMAILS there), which is enough to review questions.
 */
const AccountContext = createContext(null);
const EMPTY = { admin: false, adminServer: false, premium: false, billing: { enabled: false, price: 1500, currency: "NGN", days: 30 } };

export function AccountProvider({ children }) {
  const { user, isPreview } = useAuth();
  const [account, setAccount] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(
    async ({ forceToken = false } = {}) => {
      if (!user) {
        setAccount(EMPTY);
        setLoaded(true);
        return;
      }
      let next = EMPTY;
      // The Live detection server (laptop / VPS), when one is connected.
      if (!isPreview && !isDemoApi) {
        try {
          if (forceToken) await auth?.currentUser?.getIdToken(true); // pick up new Premium claims
          const me = await api("/me");
          next = { ...EMPTY, ...me, adminServer: Boolean(me.admin) };
        } catch {
          /* server down: the app still works, just without its admin/premium extras */
        }
      }
      // The games function on Vercel knows the admin emails too.
      if (!next.admin) {
        try {
          const me = await gamesApi("me");
          if (me.admin) next = { ...next, admin: true };
        } catch {
          /* games not set up yet */
        }
      }
      setAccount(next);
      setLoaded(true);
    },
    [user, isPreview],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ ...account, loaded, refresh }), [account, loaded, refresh]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside <AccountProvider>");
  return ctx;
}
