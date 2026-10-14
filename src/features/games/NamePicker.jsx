import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";

/*
 * A search box with suggestions from a list we already have (no waiting on the network).
 * items: [{ key, name, sub? }]. Enter picks the highlighted one; arrows move the highlight.
 */

export const plain = (s = "") => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export function NamePicker({ items, onPick, placeholder = "Type a name", disabled, busy, exclude, autoFocus = true }) {
  const [text, setText] = useState("");
  const [at, setAt] = useState(0);

  const indexed = useMemo(() => items.map((i) => ({ ...i, search: plain(i.name) })), [items]);
  const matches = useMemo(() => {
    const q = plain(text);
    if (q.length < 2) return [];
    const words = q.split(" ");
    const hits = indexed.filter((i) => !exclude?.has(i.key) && words.every((w) => i.search.includes(w)));
    // names that start with what was typed (or whose surname does) come first
    const rank = (i) => (i.search.startsWith(q) ? 0 : i.search.split(" ").some((p) => p.startsWith(words[0])) ? 1 : 2);
    return hits.sort((a, b) => rank(a) - rank(b)).slice(0, 6);
  }, [text, indexed, exclude]);

  function pick(item) {
    if (!item || disabled) return;
    setText("");
    setAt(0);
    onPick(item);
  }

  return (
    <div className="relative">
      <div className={cn("flex h-12 items-center gap-3 rounded-full bg-white/[.05] px-4 ring-1 ring-white/10 focus-within:ring-signal/50", disabled && "opacity-50")}>
        <Search className="size-[18px] shrink-0 text-mist-500" />
        <input
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            setAt(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") pick(matches[at] ?? matches[0]);
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setAt((a) => Math.min(a + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAt((a) => Math.max(a - 1, 0));
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-mist-700"
        />
        {busy && <Spinner className="size-4 text-mist-500" />}
      </div>
      {matches.length > 0 && (
        <ul className="absolute inset-x-0 top-14 z-20 overflow-hidden rounded-2xl bg-ink-900 p-1.5 shadow-2xl ring-1 shadow-black/60 ring-white/10">
          {matches.map((m, i) => (
            <li key={m.key}>
              <button onMouseEnter={() => setAt(i)} onClick={() => pick(m)} className={cn("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition", i === at ? "bg-white/[.09]" : "hover:bg-white/[.06]")}>
                <span className="min-w-0 truncate text-sm font-medium">{m.name}</span>
                {m.sub && <span className="shrink-0 truncate text-[11px] text-mist-500">{m.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
