import { useEffect, useState } from "react";
import { gamesApi } from "./games";

/*
 * Your game identity (username and avatar) for places outside the Game Zone: the account
 * profile, the top bar and the sidebar. Loaded once and shared; the Game Zone keeps it up to date
 * whenever the username or avatar changes there.
 */

let current = null;
let loading = null;
const listeners = new Set();

export function publishGameProfile(profile) {
  if (!profile) return;
  current = { name: profile.name, avatar: profile.avatar, theme: profile.theme };
  for (const fn of listeners) fn(current);
}

function load() {
  loading ??= gamesApi("profile.get")
    .then((r) => publishGameProfile(r.profile))
    .catch(() => {
      loading = null; // try again next time
    });
  return loading;
}

/** { name, avatar } once loaded, else null. Pass false to skip loading (signed out). */
export function useGameIdentity(enabled = true) {
  const [me, setMe] = useState(current);
  useEffect(() => {
    if (!enabled) return;
    listeners.add(setMe);
    if (!current) load();
    else setMe(current);
    return () => listeners.delete(setMe);
  }, [enabled]);
  return me;
}

/** Change the username from anywhere (it is the name other players see). */
export async function saveUsername(name) {
  const r = await gamesApi("profile.setName", { name });
  publishGameProfile(r.profile);
  return r.profile;
}
