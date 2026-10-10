import { createContext, useCallback, useContext, useMemo } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { idFromUrl, putItem, removeItem, useUserCollection } from "@/lib/userData";

/**
 * users/{uid}/library: one document per download (kind "download") and per saved
 * title (kind "saved"). Synced across devices; cached offline.
 */
const LibraryContext = createContext(null);

export function LibraryProvider({ children }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const { items, loading } = useUserCollection(uid, "library");

  const put = useCallback((id, data) => (uid ? putItem(uid, "library", id, data) : Promise.resolve()), [uid]);
  const remove = useCallback((id) => (uid ? removeItem(uid, "library", id) : Promise.resolve()), [uid]);

  const value = useMemo(() => {
    const downloads = items.filter((i) => i.kind === "download");
    const saved = items.filter((i) => i.kind === "saved");
    const savedIds = new Set(saved.map((s) => s.id));

    return {
      loading,
      downloads,
      saved,
      put,
      remove,
      isSaved: (pageUrl) => savedIds.has(idFromUrl("saved", pageUrl)),
      toggleSaved(result) {
        const id = idFromUrl("saved", result.url);
        if (savedIds.has(id)) return remove(id);
        return put(id, {
          kind: "saved",
          title: result.title,
          year: result.year ?? null,
          poster: result.poster ?? null,
          palette: result.palette ?? null,
          site: result.site ?? null,
          pageUrl: result.url,
          runtime: result.runtime ?? null,
          qualities: result.sources?.map((s) => s.quality).slice(0, 6) ?? [],
          createdAt: Date.now(),
        });
      },
    };
  }, [items, loading, put, remove]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used inside <LibraryProvider>");
  return ctx;
}
