const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, "");

/**
 * @param dl       file name: the relay asks the browser to save instead of play
 * @param rewrite  for playlists: every piece inside is also routed through the relay (player)
 */
export function relayUrl(source, url, { dl, rewrite } = {}) {
  const params = new URLSearchParams({ t: source.relayToken, url });
  if (dl) params.set("dl", dl);
  if (rewrite) params.set("rw", "1");
  return `${API_URL}/relay?${params}`;
}

export const canRelay = (source) => Boolean(API_URL && source?.relayToken);

/**
 * Fetches straight from the video source when it allows it (free for us), and
 * switches to the server relay for the rest of the job the first time it doesn't
 * (no CORS headers, or the source insists on its own Referer).
 */
export function createFetcher(source) {
  let mode = "direct";

  async function attempt(url, init, viaRelay) {
    const res = await fetch(viaRelay ? relayUrl(source, url) : url, {
      ...init,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
    if (!res.ok) {
      let message = `The video source answered ${res.status}.`;
      if (viaRelay) message = (await res.json().catch(() => ({}))).error || message;
      throw Object.assign(new Error(message), { status: res.status });
    }
    return res;
  }

  return {
    get mode() {
      return mode;
    },
    async fetch(url, { range, signal } = {}) {
      const init = { signal, headers: range ? { Range: `bytes=${range[0]}-${range[1] ?? ""}` } : {} };
      if (mode === "direct") {
        try {
          return await attempt(url, init, false);
        } catch (err) {
          if (err.name === "AbortError" || !canRelay(source)) throw err;
          mode = "relay";
        }
      }
      return attempt(url, init, true);
    },
    async bytes(url, opts) {
      const res = await this.fetch(url, opts);
      return new Uint8Array(await res.arrayBuffer());
    },
    async text(url, opts) {
      const res = await this.fetch(url, opts);
      return res.text();
    },
  };
}

// Network hiccups are normal over a 2-hour movie: retry each piece a few times.
export async function withRetry(task, { tries = 4, signal } = {}) {
  let lastError;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await task();
    } catch (err) {
      if (err.name === "AbortError" || signal?.aborted) throw err;
      if (err.status === 401 || err.status === 404 || err.status === 410) throw err;
      lastError = err;
      await new Promise((r) => setTimeout(r, 700 * 2 ** attempt));
    }
  }
  throw lastError;
}
