import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "@/lib/firebase";
import { ensureUserProfile } from "@/lib/users";
import { reportError, setMonitoringUser } from "@/lib/monitoring";

const AuthContext = createContext(null);

// In local development without Firebase keys, you're signed in as a preview user
// so the UI can be explored. Production builds never do this.
const PREVIEW_USER = {
  uid: "preview",
  displayName: "Preview User",
  email: "preview@dixon.watch",
  photoURL: null,
  isPreview: true,
};

function requireAuth() {
  if (!auth) throw Object.assign(new Error("Firebase isn't set up yet."), { code: "app/not-configured" });
  return auth;
}

export function AuthProvider({ children }) {
  // undefined = still checking, null = signed out
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    if (!auth) {
      setUser(import.meta.env.DEV ? PREVIEW_USER : null);
      return;
    }
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setMonitoringUser(u?.uid);
      if (u) ensureUserProfile(u).catch((err) => reportError(err, { where: "profile-sync" }));
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading: user === undefined,
      isPreview: Boolean(user?.isPreview),

      async signInWithGoogle() {
        const a = requireAuth();
        try {
          await signInWithPopup(a, googleProvider);
        } catch (err) {
          // Some mobile browsers block pop-ups; fall back to a full-page redirect.
          if (err.code === "auth/popup-blocked") return signInWithRedirect(a, googleProvider);
          throw err;
        }
      },

      async signInWithEmail(email, password) {
        await signInWithEmailAndPassword(requireAuth(), email, password);
      },

      async signUpWithEmail(name, email, password) {
        const a = requireAuth();
        const { user: created } = await createUserWithEmailAndPassword(a, email, password);
        if (name) {
          await updateProfile(created, { displayName: name });
          await created.getIdToken(true); // the next requests carry the name, so it becomes the username (not the email)
        }
        await ensureUserProfile({ ...created, displayName: name || created.displayName });
      },

      async resetPassword(email) {
        await sendPasswordResetEmail(requireAuth(), email);
      },

      async logout() {
        if (auth) await signOut(auth);
        else setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export { isFirebaseConfigured };
