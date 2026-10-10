import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Creates users/{uid} on first sign-in and refreshes it on later ones.
export async function ensureUserProfile(user) {
  if (!db) return;
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  await setDoc(
    ref,
    {
      name: user.displayName ?? "",
      email: user.email ?? "",
      avatar: user.photoURL ?? "",
      lastSeenAt: serverTimestamp(),
      ...(snap.exists() ? {} : { createdAt: serverTimestamp(), plan: "free" }),
    },
    { merge: true },
  );
}
