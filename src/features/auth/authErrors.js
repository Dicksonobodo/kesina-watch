const MESSAGES = {
  "auth/invalid-credential": "That email and password don't match.",
  "auth/invalid-email": "That doesn't look like a valid email.",
  "auth/user-not-found": "No account with that email yet.",
  "auth/wrong-password": "That email and password don't match.",
  "auth/email-already-in-use": "An account with that email already exists. Try signing in.",
  "auth/weak-password": "Use at least 6 characters for your password.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/network-request-failed": "Network problem. Check your connection.",
  "auth/popup-closed-by-user": "Google sign-in was closed before finishing.",
  "auth/cancelled-popup-request": "Google sign-in was closed before finishing.",
  "auth/unauthorized-domain": "This domain isn't allowed yet. Add it in Firebase → Authentication → Settings.",
  "app/not-configured": "Firebase isn't connected yet. Add your keys to the .env file.",
};

export function authErrorMessage(err) {
  return MESSAGES[err?.code] ?? "Something went wrong. Please try again.";
}
