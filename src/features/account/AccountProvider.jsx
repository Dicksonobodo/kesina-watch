import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { api, isDemoApi } from "@/lib/api";
import { auth } from "@/lib/firebase";

/**
 * What the server says about the signed-in user: admin?, premium?, and whether
 * Premium can be bought yet. Refreshed after payments (new token claims).
 */
const AccountContext = createContext(null);
const EMPTY = { admin: false, premium: false, billing: { enabled: false, price: 1500, currency: "NGN", days: 30 } };

export function AccountProvider({ children }) {
  const { user, isPreview } = useAuth();
  const [account, setAccount] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(
    async ({ forceToken = false } = {}) => {
      if (!user || isPreview || isDemoApi) {
        setAccount(EMPTY);
        setLoaded(true);
        return;
      }
      try {
        if (forceToken) await auth?.currentUser?.getIdToken(true); // pick up new Premium claims
        setAccount({ ...EMPTY, ...(await api("/me")) });
      } catch {
        setAccount(EMPTY); // server down: the app still works, just without admin/premium extras
      } finally {
        setLoaded(true);
      }
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
