import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Ban, ChevronDown, Copy, Flag, MessageCircle, MoreHorizontal, Plus, Search, Send, SquarePen, Swords, Undo2, X } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { gamesApi } from "@/lib/games";
import { cn } from "@/lib/cn";
import { useChat } from "./ChatProvider";
import { CHAT_GAMES, gameCardLine } from "./gameInfo";

/*
 * The chat window of the Game Zone: a bottom sheet on phones (about 60% of the screen, so the
 * game behind it stays visible) and a floating window on desktop. Looks and behaves like iMessage:
 * blue-ish bubbles for you, grey for them, "Read" receipts, tapbacks, a typing indicator, and
 * game cards that open full screen.
 */

const REACTIONS = ["❤️", "👍", "👎", "😂", "‼️", "❓"];
const BATTLES = [
  { id: "quiz", title: "Football IQ quiz" },
  { id: "shirt", title: "Shirt numbers" },
  { id: "clubs", title: "Who played for both?" },
  { id: "trophy", title: "Name the trophy" },
  { id: "xi", title: "Complete the XI" },
];

const clock = (at) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function stamp(at) {
  const d = new Date(at);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return `Today ${clock(at)}`;
  if (days === 1) return `Yesterday ${clock(at)}`;
  if (days < 7) return `${d.toLocaleDateString([], { weekday: "short" })} ${clock(at)}`;
  return d.toLocaleDateString([], { day: "numeric", month: "short" }) + ` ${clock(at)}`;
}
function ago(at) {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

const Avatar = ({ person, className }) => (
  <span className={cn("grid shrink-0 place-items-center rounded-full bg-white/[.08] ring-1 ring-white/10", className ?? "size-10 text-lg")}>{person?.avatar ?? "⚽"}</span>
);

/* ---------- the floating button ---------- */

export function ChatLauncher() {
  const { open, unread, openPanel, gameId } = useChat();
  if (open || gameId) return null;
  return (
    <button
      onClick={openPanel}
      aria-label={unread ? `Messages, ${unread} unread` : "Messages"}
      className="fixed right-4 bottom-[5.5rem] z-[100] grid size-14 place-items-center rounded-full bg-signal text-ink-950 shadow-xl shadow-black/50 transition active:scale-95 lg:right-6 lg:bottom-6"
    >
      <MessageCircle className="size-6" fill="currentColor" strokeWidth={1.5} />
      {unread > 0 && <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-live px-1.5 text-[11px] leading-5 font-bold text-white ring-2 ring-ink-950">{unread > 9 ? "9+" : unread}</span>}
    </button>
  );
}

/* ---------- the window ---------- */

export function ChatPanel() {
  const { open, view, closePanel, gameId } = useChat();
  return (
    <AnimatePresence>
      {open && !gameId && (
        <motion.div
          key="panel"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 32 }}
          className="fixed inset-x-0 bottom-0 z-[110] flex h-[64dvh] flex-col overflow-hidden rounded-t-[28px] bg-ink-900 pb-[env(safe-area-inset-bottom)] shadow-2xl ring-1 shadow-black/70 ring-white/10 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:h-[620px] lg:w-[400px] lg:rounded-3xl lg:pb-0"
          role="dialog"
          aria-label="Messages"
        >
          <button onClick={closePanel} aria-label="Hide messages" className="mx-auto mt-1.5 flex h-4 w-16 items-center justify-center lg:hidden">
            <span className="h-1 w-10 rounded-full bg-white/20" />
          </button>
          {view === "list" ? <ChatList /> : <Thread />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------- conversation list + search ---------- */

function ChatList() {
  const { inbox, closePanel, openThread, pendingInvite, setPendingInvite, send, me } = useChat();
  const [q, setQ] = useState("");
  const [people, setPeople] = useState(null);
  const [searching, setSearching] = useState(false);
  const input = useRef(null);

  useEffect(() => {
    const text = q.trim();
    if (text.replace(/^@/, "").length < 2) return setPeople(null);
    setSearching(true);
    const t = setTimeout(() => {
      gamesApi("chat.search", { q: text })
        .then((r) => setPeople(r.people))
        .catch(() => setPeople([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function pick(person) {
    await openThread(person);
    if (pendingInvite) {
      // someone shared a battle invite from the waiting room: send it into the conversation that was just opened
      setPendingInvite(null);
      setTimeout(() => window.dispatchEvent(new CustomEvent("dw-send-invite", { detail: pendingInvite })), 50);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 px-4 pt-1 pb-2">
        <h2 className="flex-1 font-display text-2xl font-extrabold tracking-tight">Messages</h2>
        <button onClick={() => input.current?.focus()} aria-label="New message" className="grid size-9 place-items-center rounded-full bg-white/[.06] text-signal transition hover:bg-white/10">
          <SquarePen className="size-[18px]" />
        </button>
        <button onClick={closePanel} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-white/[.06] text-mist-300 transition hover:bg-white/10">
          <ChevronDown className="size-5" />
        </button>
      </div>

      {pendingInvite && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-2xl bg-signal/10 px-3 py-2.5 text-[13px] ring-1 ring-signal/30">
          <Swords className="size-4 shrink-0 text-signal" />
          <span className="min-w-0 flex-1">
            Pick a friend to send your <b>{pendingInvite.title}</b> battle invite ({pendingInvite.code}).
          </span>
          <button onClick={() => setPendingInvite(null)} aria-label="Cancel" className="text-mist-500 hover:text-white">
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="px-4 pb-2">
        <div className="flex h-10 items-center gap-2.5 rounded-full bg-white/[.06] px-3.5 ring-1 ring-white/[.06] focus-within:ring-signal/50">
          <Search className="size-4 shrink-0 text-mist-500" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players by name" aria-label="Search players" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-mist-700" />
          {searching ? <Spinner className="size-4 text-mist-500" /> : q && <button onClick={() => setQ("")} aria-label="Clear" className="text-mist-500"><X className="size-4" /></button>}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
        {people ? (
          <>
            <p className="px-3 pt-1 pb-1.5 font-mono text-[10px] tracking-[.18em] text-mist-500 uppercase">Players</p>
            {people.length === 0 && <p className="px-3 py-6 text-center text-sm text-mist-500">No players found. Try the first letters of their name, or name#1234.</p>}
            {people.map((p) => (
              <button key={p.uid} onClick={() => pick(p)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/[.06]">
                <Avatar person={p} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                  <span className="block font-mono text-[11px] text-mist-500">
                    #{p.tag} · Level {p.level}
                  </span>
                </span>
                <MessageCircle className="size-4 text-signal" />
              </button>
            ))}
          </>
        ) : inbox.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-signal/10 text-signal">
              <MessageCircle className="size-7" />
            </span>
            <p className="mt-4 font-display text-lg font-bold">No messages yet</p>
            <p className="mt-1 text-sm text-mist-500">Search for a player above to start a chat, send a battle code, or challenge them to Word Swipe, Naija Whot or Darts.</p>
          </div>
        ) : (
          inbox.map((c) => (
            <button key={c.chat} onClick={() => pick(c.peer)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/[.06]">
              <Avatar person={c.peer} className="size-12 text-xl" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={cn("min-w-0 flex-1 truncate text-[15px]", c.unread ? "font-bold" : "font-semibold")}>{c.peer.name}</span>
                  <span className="shrink-0 text-[11px] text-mist-500">{ago(c.lastAt)}</span>
                </span>
                <span className={cn("block truncate text-[13px]", c.unread ? "font-medium text-mist-100" : "text-mist-500")}>
                  {c.last.from === me ? "You: " : ""}
                  {c.last.text}
                </span>
              </span>
              {c.unread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-signal px-1.5 text-[11px] leading-5 font-bold text-ink-950">{c.unread}</span>}
            </button>
          ))
        )}
      </div>
    </>
  );
}

/* ---------- one conversation ---------- */

function Thread() {
  const { peer, thread, showList, closePanel, send, me, error, setError, setTyping, block, report, startGame } = useChat();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(null); // null | "more" | "attach" | "battle"
  const [busy, setBusy] = useState("");
  const scroller = useRef(null);
  const stick = useRef(true);
  const lastCount = useRef(0);

  // Keep the newest message in view unless the reader scrolled up.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (stick.current || thread.messages.length > lastCount.current + 0) el.scrollTop = stick.current ? el.scrollHeight : el.scrollTop;
    lastCount.current = thread.messages.length;
  }, [thread.messages, thread.typing]);

  // A battle invite shared from the waiting room is sent once this conversation is open.
  useEffect(() => {
    const onInvite = (e) => send({ kind: "invite", code: e.detail.code }).catch(() => {});
    window.addEventListener("dw-send-invite", onInvite);
    return () => window.removeEventListener("dw-send-invite", onInvite);
  }, [send]);

  const items = useMemo(() => {
    const out = [];
    let prev = null;
    thread.messages.forEach((m, i) => {
      if (!prev || m.at - prev.at > 30 * 60_000) out.push({ kind: "stamp", at: m.at, key: `s${m.id}` });
      const next = thread.messages[i + 1];
      out.push({ kind: "msg", m, first: !prev || prev.from !== m.from || m.at - prev.at > 5 * 60_000, last: !next || next.from !== m.from || next.at - m.at > 5 * 60_000, key: m.id });
      prev = m;
    });
    return out;
  }, [thread.messages]);

  const lastMine = [...thread.messages].reverse().find((m) => m.from === me && !m.deleted);

  async function submit(e) {
    e?.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText("");
    stick.current = true;
    try {
      await send({ text: value });
    } catch {
      setText(value);
    }
  }

  async function play(type) {
    setMenu(null);
    setBusy(type);
    try {
      await startGame(type);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function battle(kind) {
    setMenu(null);
    setBusy("battle");
    try {
      const room = await gamesApi("battle.create", { kind, difficulty: "mixed" });
      await send({ kind: "invite", code: room.code });
      navigate(`/games/battle/${room.code}`); // wait for them in the room; the chat stays open beside it
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-white/[.06] px-3 pt-1 pb-2.5">
        <button onClick={showList} aria-label="Back to messages" className="grid size-9 place-items-center rounded-full text-signal transition hover:bg-white/[.06]">
          <ArrowLeft className="size-5" />
        </button>
        <Avatar person={peer} className="size-9 text-base" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] leading-tight font-semibold">{peer?.name ?? "…"}</span>
          <span className="block font-mono text-[10px] text-mist-500">{peer ? `#${peer.tag} · Level ${peer.level}` : ""}</span>
        </span>
        <button onClick={() => setMenu(menu === "more" ? null : "more")} aria-label="More" className="grid size-9 place-items-center rounded-full text-mist-300 transition hover:bg-white/[.06]">
          <MoreHorizontal className="size-5" />
        </button>
        <button onClick={closePanel} aria-label="Close" className="grid size-9 place-items-center rounded-full text-mist-300 transition hover:bg-white/[.06]">
          <ChevronDown className="size-5" />
        </button>
      </div>

      {menu === "more" && (
        <div className="absolute top-14 right-3 z-20 w-52 overflow-hidden rounded-2xl bg-ink-800 p-1 shadow-2xl ring-1 ring-white/10">
          <button
            onClick={async () => {
              await block(!thread.blocked).catch((e) => setError(e.message));
              setMenu(null);
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-white/[.07]"
          >
            <Ban className="size-4 text-live" /> {thread.blocked ? "Unblock" : "Block"} {peer?.name}
          </button>
          <button
            onClick={async () => {
              const reason = window.prompt("What's wrong? (optional)") ?? null;
              if (reason === null) return;
              await report(reason || "reported").catch((e) => setError(e.message));
              setMenu(null);
              setError("");
              window.alert("Thanks. We'll take a look.");
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-white/[.07]"
          >
            <Flag className="size-4 text-mist-300" /> Report
          </button>
        </div>
      )}

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        onClick={() => setMenu(null)}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3"
      >
        {thread.loading && (
          <div className="grid place-items-center py-10">
            <Spinner className="size-5 text-signal" />
          </div>
        )}
        {!thread.loading && thread.messages.length === 0 && (
          <div className="px-6 py-10 text-center">
            <Avatar person={peer} className="mx-auto size-16 text-3xl" />
            <p className="mt-3 font-display text-lg font-bold">{peer?.name}</p>
            <p className="mt-1 text-sm text-mist-500">Say hi, send a battle code, or tap + to challenge them to a game.</p>
          </div>
        )}
        {items.map((it) =>
          it.kind === "stamp" ? (
            <p key={it.key} className="my-3 text-center text-[11px] font-medium text-mist-500">
              {stamp(it.at)}
            </p>
          ) : (
            <Bubble key={it.key} m={it.m} first={it.first} last={it.last} me={me} peer={peer} />
          ),
        )}
        {lastMine && (
          <p className="mt-1 pr-1 text-right text-[11px] font-medium text-mist-500">{lastMine.pending ? "Sending…" : thread.readAt >= lastMine.at ? `Read ${clock(thread.readAt)}` : "Delivered"}</p>
        )}
        {thread.typing && (
          <div className="mt-2 flex">
            <span className="inline-flex items-center gap-1 rounded-[20px] rounded-bl-md bg-white/[.09] px-4 py-3">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="size-1.5 rounded-full bg-mist-300" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />
              ))}
            </span>
          </div>
        )}
      </div>

      {error && (
        <p className="mx-3 mb-1 flex items-start gap-2 rounded-xl bg-live/10 px-3 py-2 text-[12.5px] text-live">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </p>
      )}

      {thread.blocked ? (
        <p className="border-t border-white/[.06] px-4 py-4 text-center text-sm text-mist-500">You blocked {peer?.name}. Unblock them from the menu to chat again.</p>
      ) : (
        <div className="relative border-t border-white/[.06] px-3 py-2.5">
          {(menu === "attach" || menu === "battle") && (
            <div className="absolute right-3 bottom-[calc(100%+6px)] left-3 z-20 overflow-hidden rounded-2xl bg-ink-800 p-1.5 shadow-2xl ring-1 ring-white/10">
              {menu === "attach" ? (
                <>
                  <p className="px-3 pt-1.5 pb-1 font-mono text-[10px] tracking-[.18em] text-mist-500 uppercase">Play in this chat</p>
                  {CHAT_GAMES.map((g) => (
                    <button key={g.id} onClick={() => play(g.id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[.07]">
                      <span className="grid size-9 place-items-center rounded-xl text-lg" style={{ background: g.color }}>
                        {g.emoji}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{g.title}</span>
                        <span className="block text-[11.5px] text-mist-500">{g.blurb}</span>
                      </span>
                    </button>
                  ))}
                  <p className="px-3 pt-2 pb-1 font-mono text-[10px] tracking-[.18em] text-mist-500 uppercase">Football</p>
                  <button onClick={() => setMenu("battle")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[.07]">
                    <span className="grid size-9 place-items-center rounded-xl bg-rose-500/20 text-rose-300">
                      <Swords className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">Send a battle invite</span>
                      <span className="block text-[11.5px] text-mist-500">A join code for a head-to-head football game</span>
                    </span>
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setMenu("attach")} className="flex items-center gap-1.5 px-3 pt-1.5 pb-1 text-xs font-semibold text-signal">
                    <ArrowLeft className="size-3.5" /> Battle game
                  </button>
                  {BATTLES.map((b) => (
                    <button key={b.id} onClick={() => battle(b.id)} className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-white/[.07]">
                      {b.title}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
          <form onSubmit={submit} className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setMenu(menu === "attach" || menu === "battle" ? null : "attach")}
              aria-label="Games and invites"
              className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-white/[.08] text-mist-100 transition hover:bg-white/[.14]", (menu === "attach" || menu === "battle") && "rotate-45 bg-signal text-ink-950")}
            >
              {busy ? <Spinner className="size-4" /> : <Plus className="size-5" />}
            </button>
            <input
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setTyping(e.target.value.length > 0);
              }}
              onBlur={() => setTyping(false)}
              onFocus={() => setMenu(null)}
              placeholder="Message"
              aria-label="Message"
              maxLength={1000}
              enterKeyHint="send"
              autoComplete="off"
              className="h-9 min-w-0 flex-1 rounded-full bg-white/[.06] px-4 text-[15px] ring-1 ring-white/10 outline-none placeholder:text-mist-700 focus:ring-signal/50"
            />
            <button type="submit" disabled={!text.trim()} aria-label="Send" className="grid size-9 shrink-0 place-items-center rounded-full bg-signal text-ink-950 transition disabled:bg-white/[.08] disabled:text-mist-700">
              <Send className="size-[17px]" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

/* ---------- a message ---------- */

function Bubble({ m, first, last, me, peer }) {
  const { react, unsend, setGameId, closePanel } = useChat();
  const navigate = useNavigate();
  const [actions, setActions] = useState(false);
  const mine = m.from === me;
  const reacts = Object.entries(m.reactions ?? {});

  if (m.deleted) {
    return (
      <div className={cn("flex", mine ? "justify-end" : "justify-start", first ? "mt-2" : "mt-0.5")}>
        <span className="rounded-[20px] px-3.5 py-2 text-[13px] text-mist-500 italic ring-1 ring-white/10">{mine ? "You unsent a message" : `${peer?.name ?? "They"} unsent a message`}</span>
      </div>
    );
  }

  const tail = last ? (mine ? "rounded-br-md" : "rounded-bl-md") : "";
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start", first ? "mt-2" : "mt-0.5")}>
      <div className="relative max-w-[82%]">
        {m.type === "invite" && m.invite ? (
          <button
            onClick={() => {
              closePanel();
              navigate(mine ? `/games/battle/${m.invite.code}` : `/games/battle?room=${m.invite.code}`);
            }}
            className={cn("w-60 overflow-hidden rounded-[20px] text-left ring-1 transition active:scale-[.98]", tail, mine ? "bg-signal/15 ring-signal/40" : "bg-white/[.07] ring-white/10")}
          >
            <span className="flex items-center gap-3 px-3.5 pt-3">
              <span className="grid size-10 place-items-center rounded-xl bg-rose-500/20 text-rose-300">
                <Swords className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-bold">{m.invite.title}</span>
                <span className="block text-[11px] text-mist-500">Head-to-head battle</span>
              </span>
            </span>
            <span className="mt-2.5 flex items-center justify-between border-t border-white/10 px-3.5 py-2.5">
              <span className="font-mono text-lg font-bold tracking-[.25em] text-signal">{m.invite.code}</span>
              <span className="rounded-full bg-signal px-3 py-1 text-xs font-bold text-ink-950">{mine ? "Open" : "Join"}</span>
            </span>
          </button>
        ) : m.type === "game" && m.game ? (
          <button onClick={() => setGameId(m.game.id)} className={cn("w-60 overflow-hidden rounded-[20px] text-left ring-1 transition active:scale-[.98]", tail, mine ? "bg-signal/15 ring-signal/40" : "bg-white/[.07] ring-white/10")}>
            <GameCard game={m.game} me={me} peer={peer} />
          </button>
        ) : (
          <button
            onClick={() => setActions((a) => !a)}
            className={cn("block text-left text-[15px] leading-snug break-words whitespace-pre-wrap", "rounded-[20px] px-3.5 py-2", tail, mine ? "bg-signal text-ink-950" : "bg-white/[.09] text-white", m.pending && "opacity-60")}
          >
            {m.text}
          </button>
        )}
        {reacts.length > 0 && (
          <span className={cn("absolute -bottom-3 flex rounded-full bg-ink-800 px-1.5 py-0.5 text-[13px] ring-1 ring-white/15", mine ? "-left-2" : "-right-2")}>
            {[...new Set(reacts.map(([, e]) => e))].join("")}
            {reacts.length > 1 && <span className="ml-0.5 text-[10px] text-mist-300">{reacts.length}</span>}
          </span>
        )}
      </div>
      {actions && (
        <div className={cn("mt-1.5 flex items-center gap-1 rounded-full bg-ink-800 px-1.5 py-1 shadow-xl ring-1 ring-white/10", mine ? "self-end" : "self-start")}>
          {REACTIONS.map((e) => (
            <button
              key={e}
              onClick={() => {
                react(m, e);
                setActions(false);
              }}
              className={cn("grid size-8 place-items-center rounded-full text-base transition hover:bg-white/10", m.reactions?.[me] === e && "bg-signal/25")}
            >
              {e}
            </button>
          ))}
          {m.text && (
            <button onClick={() => (navigator.clipboard?.writeText(m.text), setActions(false))} aria-label="Copy" className="grid size-8 place-items-center rounded-full text-mist-300 transition hover:bg-white/10">
              <Copy className="size-4" />
            </button>
          )}
          {mine && (
            <button
              onClick={() => {
                unsend(m);
                setActions(false);
              }}
              aria-label="Unsend"
              className="grid size-8 place-items-center rounded-full text-live transition hover:bg-white/10"
            >
              <Undo2 className="size-4" />
            </button>
          )}
        </div>
      )}
      {reacts.length > 0 && <span className="h-2.5" />}
    </div>
  );
}

function GameCard({ game, me, peer }) {
  const info = CHAT_GAMES.find((g) => g.id === game.type) ?? CHAT_GAMES[0];
  const line = gameCardLine(game, me, peer?.name);
  return (
    <>
      <span className="block h-1.5" style={{ background: info.color }} />
      <span className="flex items-center gap-3 px-3.5 pt-3">
        <span className="grid size-11 place-items-center rounded-xl text-2xl" style={{ background: info.color }}>
          {info.emoji}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-bold">{game.title}</span>
          <span className="block text-[11px] text-mist-500">{info.blurb}</span>
        </span>
      </span>
      <span className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/10 px-3.5 py-2.5">
        <span className={cn("text-[13px] font-semibold", line.hot ? "text-signal" : "text-mist-300")}>{line.text}</span>
        <span className="rounded-full bg-signal px-3 py-1 text-xs font-bold text-ink-950">{line.cta}</span>
      </span>
    </>
  );
}
