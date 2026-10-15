import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Ban, Check, ChevronDown, Copy, Crown, Equal, Flag, MessageCircle, Pencil, MoreHorizontal, Plus, Search, Send, SquarePen, Swords, Undo2, X } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { gamesApi } from "@/lib/games";
import { cn } from "@/lib/cn";
import { useChat } from "./ChatProvider";
import { CHAT_GAMES, gameCardLine } from "./gameInfo";
import { useScrollLock } from "./useScrollLock";
import { useVisualViewport } from "./useVisualViewport";
import { cardOf as whotCardOf, WhotCard } from "./Whot";

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
  useScrollLock(open && !gameId); // full screen on phones: only the messages scroll
  // Follow the part of the screen above the keyboard, so the message box sits right on the keyboard.
  const vv = useVisualViewport(open && !gameId);
  const keyboardUp = vv && vv.height < window.innerHeight - 120;
  return (
    <AnimatePresence>
      {open && !gameId && (
        <motion.div
          key="panel"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 32 }}
          className="fixed inset-0 z-[110] flex h-[100dvh] flex-col overflow-hidden bg-ink-900 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-2xl shadow-black/70 lg:inset-auto lg:right-6 lg:bottom-6 lg:h-[620px] lg:w-[400px] lg:rounded-3xl lg:pt-0 lg:pb-0 lg:ring-1 lg:ring-white/10"
          style={vv ? { height: vv.height, top: vv.top, bottom: "auto", paddingBottom: keyboardUp ? 0 : undefined } : undefined}
          role="dialog"
          aria-label="Messages"
        >
          <span className="block h-2 lg:h-1.5" />
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
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" aria-label="Search players" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-mist-700" />
          {searching ? <Spinner className="size-4 text-mist-500" /> : q && <button onClick={() => setQ("")} aria-label="Clear" className="text-mist-500"><X className="size-4" /></button>}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
        {people ? (
          <>
            <p className="px-3 pt-1 pb-1.5 font-mono text-[10px] tracking-[.18em] text-mist-500 uppercase">Players</p>
            {people.length === 0 && <p className="px-3 py-6 text-center text-sm text-mist-500">No players found. Try part of their name or email, or name#1234.</p>}
            {people.map((p) => (
              <button key={p.uid} onClick={() => pick(p)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/[.06]">
                <Avatar person={p} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                  <span className="block font-mono text-[11px] text-mist-500">
                    #{p.tag} · Level {p.level}
                    {p.via === "email" && " · matched email"}
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
  const { peer, thread, showList, closePanel, send, me, error, setError, setTyping, block, report, startGame, editMessage } = useChat();
  const [held, setHeld] = useState(null); // the message whose menu is open (press and hold)
  const [editing, setEditing] = useState(null); // the message being edited
  const input = useRef(null);
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

  // When the keyboard opens the conversation gets shorter: keep the newest message in sight.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const keep = () => stick.current && scroller.current && (scroller.current.scrollTop = scroller.current.scrollHeight);
    vv.addEventListener("resize", keep);
    return () => vv.removeEventListener("resize", keep);
  }, []);

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
    if (editing) {
      const msg = editing;
      setEditing(null);
      try {
        await editMessage(msg, value);
      } catch {
        setEditing(msg);
        setText(value);
      }
      return;
    }
    stick.current = true;
    try {
      await send({ text: value });
    } catch {
      setText(value);
    }
  }

  function startEdit(m) {
    setHeld(null);
    setEditing(m);
    setText(m.text);
    setTimeout(() => input.current?.focus(), 50);
  }
  function cancelEdit() {
    setEditing(null);
    setText("");
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
            <Bubble key={it.key} m={it.m} first={it.first} last={it.last} me={me} peer={peer} onHold={setHeld} />
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

      <AnimatePresence>{held && <MessageMenu m={held} me={me} peer={peer} onClose={() => setHeld(null)} onEdit={startEdit} />}</AnimatePresence>

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
          {editing && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-white/[.05] px-3 py-2 text-[12.5px]">
              <Pencil className="size-3.5 shrink-0 text-signal" />
              <span className="min-w-0 flex-1 truncate text-mist-300">
                Editing: <span className="text-mist-500">{editing.text}</span>
              </span>
              <button type="button" onClick={cancelEdit} className="font-semibold text-signal">
                Cancel
              </button>
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
              ref={input}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setTyping(e.target.value.length > 0);
              }}
              onBlur={() => setTyping(false)}
              onFocus={() => setMenu(null)}
              placeholder={editing ? "Edit message" : "Message"}
              aria-label="Message"
              maxLength={1000}
              enterKeyHint="send"
              autoComplete="off"
              className="h-9 min-w-0 flex-1 rounded-full bg-white/[.06] px-4 text-[15px] ring-1 ring-white/10 outline-none placeholder:text-mist-700 focus:ring-signal/50"
            />
            <button
              type="submit"
              onPointerDown={(e) => e.preventDefault()} // keep the keyboard open after sending, like WhatsApp
              disabled={!text.trim()}
              aria-label={editing ? "Save edit" : "Send"} className="grid size-9 shrink-0 place-items-center rounded-full bg-signal text-ink-950 transition disabled:bg-white/[.08] disabled:text-mist-700">
              {editing ? <Check className="size-[18px]" strokeWidth={3} /> : <Send className="size-[17px]" />}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

/* ---------- a message ---------- */

const EDIT_WINDOW_MS = 15 * 60_000;
const HOLD_MS = 420;

/**
 * Press and hold (like WhatsApp): fires after a short hold if the finger doesn't move. Right-click
 * does the same on a computer. A hold swallows the tap that would follow it.
 */
function useHold(onHold) {
  const timer = useRef(0);
  const start = useRef(null);
  const fired = useRef(false);
  const cancel = useCallback(() => clearTimeout(timer.current), []);
  useEffect(() => cancel, [cancel]);
  return {
    fired,
    handlers: {
      onPointerDown: (e) => {
        if (e.button > 0) return;
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          fired.current = true;
          navigator.vibrate?.(12);
          onHold();
        }, HOLD_MS);
      },
      onPointerMove: (e) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel(); // scrolling, not holding
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e) => {
        e.preventDefault();
        cancel();
        fired.current = true;
        onHold();
      },
    },
  };
}

function Bubble({ m, first, last, me, peer, onHold }) {
  const { setGameId, closePanel } = useChat();
  const navigate = useNavigate();
  const mine = m.from === me;
  const reacts = Object.entries(m.reactions ?? {});
  const hold = useHold(() => !m.pending && onHold(m));
  // a tap right after a hold must not also open a game or an invite
  const tap = (fn) => () => {
    if (hold.fired.current) return (hold.fired.current = false);
    fn();
  };

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
      <div className="relative max-w-[82%] select-none [-webkit-touch-callout:none]" {...hold.handlers}>
        {m.type === "invite" && m.invite ? (
          <button
            onClick={tap(() => {
              closePanel();
              navigate(mine ? `/games/battle/${m.invite.code}` : `/games/battle?room=${m.invite.code}`);
            })}
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
        ) : m.type === "game" && m.game && m.stale ? (
          // an earlier turn of a game: a small line, the newest turn is further down
          <button onClick={tap(() => setGameId(m.game.id))} className="flex items-center gap-1.5 rounded-full bg-white/[.05] px-3 py-1.5 text-[12px] text-mist-500 ring-1 ring-white/[.06] transition hover:text-mist-300">
            <span>{CHAT_GAMES.find((g) => g.id === m.game.type)?.emoji}</span> {m.game.title} · {mine ? "you played" : `${peer?.name ?? "they"} played`}
          </button>
        ) : m.type === "game" && m.game ? (
          <div className="relative">
            <button onClick={tap(() => setGameId(m.game.id))} className={cn("block w-60 overflow-hidden rounded-[22px] text-left ring-1 shadow-lg shadow-black/30 transition active:scale-[.98]", tail, "bg-ink-800 ring-white/10")}>
              <GameCard game={m.game} me={me} peer={peer} />
            </button>
            <ResultBadge game={m.game} me={me} side={mine ? "left" : "right"} />
          </div>
        ) : (
          <div className={cn("text-[15px] leading-snug break-words whitespace-pre-wrap transition active:scale-[.97]", "rounded-[20px] px-3.5 py-2", tail, mine ? "bg-signal text-ink-950" : "bg-white/[.09] text-white", m.pending && "opacity-60")}>{m.text}</div>
        )}
        {reacts.length > 0 && (
          <span className={cn("absolute -bottom-3 flex rounded-full bg-ink-800 px-1.5 py-0.5 text-[13px] ring-1 ring-white/15", mine ? "-left-2" : "-right-2")}>
            {[...new Set(reacts.map(([, e]) => e))].join("")}
            {reacts.length > 1 && <span className="ml-0.5 text-[10px] text-mist-300">{reacts.length}</span>}
          </span>
        )}
      </div>
      {m.edited && <span className={cn("mt-0.5 px-1 text-[10.5px] font-medium text-mist-500", reacts.length > 0 && "mt-3")}>Edited</span>}
      {reacts.length > 0 && !m.edited && <span className="h-2.5" />}
    </div>
  );
}

/** What opens when you hold a message: reactions on top, the message, then what you can do with it. */
function MessageMenu({ m, me, peer, onClose, onEdit }) {
  const { react, unsend } = useChat();
  const mine = m.from === me;
  const canEdit = mine && m.type === "text" && Date.now() - m.at < EDIT_WINDOW_MS;
  const [copied, setCopied] = useState(false);
  // Letting go of the long-press can send a click onto this backdrop; only a new tap closes it.
  const armed = useRef(false);
  const actions = [
    m.text && { icon: Copy, label: copied ? "Copied" : "Copy", run: () => (navigator.clipboard?.writeText(m.text), setCopied(true), setTimeout(onClose, 450)) },
    canEdit && { icon: Pencil, label: "Edit", run: () => onEdit(m) },
    mine && { icon: Undo2, label: "Unsend", danger: true, run: () => (unsend(m), onClose()) },
  ].filter(Boolean);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onPointerDown={() => (armed.current = true)} onClick={() => armed.current && onClose()} className="absolute inset-0 z-30 flex flex-col justify-center bg-black/55 px-4 backdrop-blur-md">
      <motion.div initial={{ scale: 0.92, y: 8 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 420, damping: 28 }} className={cn("pointer-events-none flex flex-col gap-2 [&>*]:pointer-events-auto", mine ? "items-end" : "items-start")}>
        <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-0.5 rounded-full bg-ink-800 px-1.5 py-1 shadow-2xl ring-1 ring-white/10">
          {REACTIONS.map((e) => (
            <button
              key={e}
              onClick={() => {
                react(m, e);
                onClose();
              }}
              className={cn("grid size-10 place-items-center rounded-full text-xl transition hover:scale-110 hover:bg-white/10", m.reactions?.[me] === e && "bg-signal/25")}
            >
              {e}
            </button>
          ))}
        </div>
        <div onClick={(e) => e.stopPropagation()} className={cn("max-h-40 max-w-[82%] overflow-hidden rounded-[20px] px-3.5 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap shadow-2xl", mine ? "bg-signal text-ink-950" : "bg-white/[.12] text-white")}>
          {m.type === "text" ? m.text : m.type === "invite" ? `⚔️ ${m.invite?.title} · ${m.invite?.code}` : `${CHAT_GAMES.find((g) => g.id === m.game?.type)?.emoji ?? "🎮"} ${m.game?.title ?? "Game"}`}
        </div>
        {actions.length > 0 && (
          <div onClick={(e) => e.stopPropagation()} className="w-48 overflow-hidden rounded-2xl bg-ink-800 shadow-2xl ring-1 ring-white/10">
            {actions.map((a, i) => (
              <button key={a.label} onClick={a.run} className={cn("flex w-full items-center justify-between px-4 py-3 text-left text-[15px] transition hover:bg-white/[.06]", i > 0 && "border-t border-white/[.06]", a.danger && "text-live")}>
                {a.label}
                <a.icon className="size-4" />
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-white/50">{new Date(m.at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}{mine ? "" : ` · ${peer?.name ?? ""}`}</p>
      </motion.div>
    </motion.div>
  );
}

function GameCard({ game, me, peer }) {
  const info = CHAT_GAMES.find((g) => g.id === game.type) ?? CHAT_GAMES[0];
  const line = gameCardLine(game, me, peer?.name);
  return (
    <>
      <span className="relative block h-36 overflow-hidden" style={{ background: info.table }}>
        <GamePreview game={game} me={me} peer={peer} />
      </span>
      <span className="flex items-center gap-2.5 bg-white/[.06] px-3 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg text-base" style={{ background: info.color }}>
          {info.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] leading-tight font-bold">{game.title}</span>
          {!line.result && <span className={cn("block truncate text-[12px] leading-tight", line.hot ? "font-semibold text-signal" : "text-mist-500")}>{line.text}</span>}
          {line.detail && <span className="block truncate text-[12px] leading-tight text-mist-500">{line.detail}</span>}
        </span>
        {line.hot && <span className="rounded-full bg-signal px-2.5 py-1 text-[11px] font-bold text-ink-950">{line.cta}</span>}
      </span>
      {/* the result, clear at the bottom of the bubble */}
      {line.result && (
        <span
          className={cn(
            "flex items-center justify-center gap-2 py-2.5 font-display text-[17px] font-extrabold tracking-tight",
            line.result === "won" && "bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-950",
            line.result === "lost" && "bg-live text-white",
            line.result === "draw" && "bg-white/15 text-white",
          )}
        >
          {line.result === "won" ? <Crown className="size-[18px]" fill="currentColor" strokeWidth={1.5} /> : line.result === "lost" ? <X className="size-[18px]" strokeWidth={3} /> : <Equal className="size-[18px]" strokeWidth={3} />}
          {line.text}
        </span>
      )}
    </>
  );
}

/** The picture in a game bubble: the state of the game at that turn. */
function GamePreview({ game, me, peer }) {
  const other = (obj) => Object.keys(obj ?? {}).find((u) => u !== me);
  if (game.type === "darts") {
    const left = game.left ?? {};
    return (
      <>
        <svg viewBox="-1.3 -1.3 2.6 2.6" className="absolute top-1/2 left-1/2 size-36 -translate-x-1/2 -translate-y-1/2 opacity-90">
          <circle r="1.25" fill="#0b0b0f" />
          {[1, 0.95, 0.63, 0.58, 0.094].map((r, i) => (
            <circle key={r} r={r} fill={["#1b8a3a", "#efe2bf", "#c62828", "#efe2bf", "#1b8a3a"][i]} />
          ))}
          {Array.from({ length: 10 }).map((_, i) => (
            <path key={i} d={`M0 0 L${Math.sin(((i * 36 - 9) * Math.PI) / 180) * 0.95} ${-Math.cos(((i * 36 - 9) * Math.PI) / 180) * 0.95} A.95 .95 0 0 1 ${Math.sin(((i * 36 + 9) * Math.PI) / 180) * 0.95} ${-Math.cos(((i * 36 + 9) * Math.PI) / 180) * 0.95}Z`} fill="#161616" />
          ))}
          <circle r="0.04" fill="#c62828" />
        </svg>
        <span className="absolute inset-x-2 bottom-2 flex justify-between gap-2">
          {[["You", left[me]], [peer?.name ?? "Them", left[other(left)]]].map(([n, v]) => (
            <span key={n} className="rounded-lg bg-black/65 px-2 py-0.5 text-center backdrop-blur">
              <span className="block max-w-20 truncate text-[9px] text-mist-300">{n}</span>
              <span className="block font-display text-base leading-none font-extrabold tabular-nums">{v ?? 301}</span>
            </span>
          ))}
        </span>
      </>
    );
  }
  if (game.type === "whot") {
    const counts = game.counts ?? {};
    const top = game.top ? whotCardOf(game.top) : null;
    return (
      <>
        <span className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3">
          <span className="-rotate-6"><WhotCard back size="md" /></span>
          {top && <span className="rotate-6"><WhotCard card={top} size="md" /></span>}
        </span>
        <span className="absolute inset-x-2 bottom-2 flex justify-between text-[10px] font-semibold">
          <span className="rounded-full bg-black/55 px-2 py-0.5">You · {counts[me] ?? 6} cards</span>
          <span className="rounded-full bg-black/55 px-2 py-0.5">{peer?.name ?? "Them"} · {counts[other(counts)] ?? 6}</span>
        </span>
      </>
    );
  }
  if (game.type === "ttt") {
    const board = game.board ?? Array(9).fill("");
    const marks = game.marks ?? {};
    return (
      <>
        <svg viewBox="0 0 300 300" className="absolute top-1/2 left-1/2 size-28 -translate-x-1/2 -translate-y-1/2">
          <g stroke="rgba(255,255,255,.3)" strokeWidth="7" strokeLinecap="round">
            {[100, 200].map((v) => (
              <g key={v}>
                <line x1={v} y1="18" x2={v} y2="282" />
                <line x1="18" y1={v} x2="282" y2={v} />
              </g>
            ))}
          </g>
          {board.map((m, i) => {
            const cx = 50 + (i % 3) * 100;
            const cy = 50 + Math.floor(i / 3) * 100;
            const dim = game.line && !game.line.includes(i);
            if (m === "X") return <g key={i} stroke="var(--color-signal)" strokeWidth="13" strokeLinecap="round" opacity={dim ? 0.3 : 1}><path d={`M${cx - 24} ${cy - 24}L${cx + 24} ${cy + 24}`} /><path d={`M${cx + 24} ${cy - 24}L${cx - 24} ${cy + 24}`} /></g>;
            if (m === "O") return <circle key={i} cx={cx} cy={cy} r="26" stroke="#ff5d8f" strokeWidth="13" fill="none" opacity={dim ? 0.3 : 1} />;
            return null;
          })}
          {game.line && (() => {
            const p = (i) => [50 + (i % 3) * 100, 50 + Math.floor(i / 3) * 100];
            const [a, b] = [p(game.line[0]), p(game.line[2])];
            return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#fff" strokeWidth="11" strokeLinecap="round" />;
          })()}
        </svg>
        <span className="absolute inset-x-2 bottom-2 flex justify-between text-[10px] font-semibold">
          <span className="rounded-full bg-black/55 px-2 py-0.5">You · {marks[me] ?? "X"}</span>
          <span className="rounded-full bg-black/55 px-2 py-0.5">{peer?.name ?? "Them"} · {marks[other(marks)] ?? "O"}</span>
        </span>
      </>
    );
  }
  if (game.type === "shootout") {
    const goals = game.goals ?? {};
    const marks = game.marks ?? {};
    const order = game.order ?? [me, other(goals)];
    return (
      <>
        <svg viewBox="0 0 200 104" className="absolute top-2 left-1/2 w-44 -translate-x-1/2">
          <g stroke="#fff" strokeOpacity=".22" strokeWidth=".8">
            {Array.from({ length: 13 }).map((_, i) => (
              <line key={`v${i}`} x1={40 + i * 10} y1="22" x2={40 + i * 10} y2="80" />
            ))}
            {Array.from({ length: 6 }).map((_, i) => (
              <line key={`h${i}`} x1="40" y1={22 + i * 11.6} x2="160" y2={22 + i * 11.6} />
            ))}
          </g>
          <path d="M30 86 V14 H170 V86" fill="none" stroke="#f8fafc" strokeWidth="5" strokeLinejoin="round" />
          <line x1="0" y1="88" x2="200" y2="88" stroke="#fff" strokeOpacity=".5" strokeWidth="1.5" />
          <circle cx="132" cy="38" r="7" fill="#fff" />
          <path d="M132 33.5l3.4 2.5-1.3 4h-4.2l-1.3-4z" fill="#111827" />
        </svg>
        <span className="absolute inset-x-2 bottom-2 flex flex-col gap-1">
          {order.map((uid) => (
            <span key={uid} className="flex items-center gap-1.5 rounded-full bg-black/65 py-0.5 pr-2 pl-2.5 backdrop-blur">
              <span className="w-14 shrink-0 truncate text-[10px] font-semibold">{uid === me ? "You" : peer?.name ?? "Them"}</span>
              <span className="flex min-w-0 flex-1 gap-0.5 overflow-hidden">
                {Array.from({ length: Math.max(5, (marks[uid] ?? []).length) }).map((_, i) => {
                  const m = (marks[uid] ?? [])[i];
                  return <span key={i} className={cn("size-2.5 shrink-0 rounded-full", m === 1 ? "bg-signal" : m === 0 ? "bg-rose-500" : "border border-white/35")} />;
                })}
              </span>
              <span className="font-display text-sm leading-none font-extrabold tabular-nums">{goals[uid] ?? 0}</span>
            </span>
          ))}
        </span>
      </>
    );
  }
  if (game.type === "behind") {
    const score = game.score ?? {};
    return (
      <>
        <span className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-end gap-3">
          {[["?", "from-slate-600 to-slate-900", -6], ["?", "from-fuchsia-500 to-violet-800", 6]].map(([q, bg, rot], i) => (
            <span key={i} className={cn("grid h-20 w-16 place-items-center rounded-2xl bg-gradient-to-b font-display text-3xl font-extrabold text-white/90 shadow-lg ring-2 ring-white/25", bg)} style={{ transform: `rotate(${rot}deg)` }}>
              {q}
            </span>
          ))}
        </span>
        <span className="absolute inset-x-2 bottom-2 flex justify-between text-[10px] font-semibold">
          <span className="rounded-full bg-black/55 px-2 py-0.5">You · {score[me] ?? 0}</span>
          <span className="rounded-full bg-black/55 px-2 py-0.5">Round {Math.min(game.round ?? 1, 3)} of 3</span>
          <span className="rounded-full bg-black/55 px-2 py-0.5">{peer?.name ?? "Them"} · {score[other(score)] ?? 0}</span>
        </span>
      </>
    );
  }
  // word swipe
  const scores = game.scores ?? {};
  const mine = scores[me];
  return (
    <>
      <span className="absolute top-1/2 left-1/2 grid -translate-x-1/2 -translate-y-1/2 grid-cols-4 gap-1">
        {"WORDSWIPEGAME?!?".split("").map((c, i) => (
          <span key={i} className={cn("grid size-6 place-items-center rounded-md font-display text-[11px] font-extrabold", [0, 5, 10, 15].includes(i) ? "bg-signal text-ink-950" : "bg-white/15 text-white")}>
            {c}
          </span>
        ))}
      </span>
      {mine != null && (
        <span className="absolute inset-x-2 bottom-2 flex justify-center">
          <span className="rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-bold">You scored {mine.toLocaleString()}</span>
        </span>
      )}
    </>
  );
}

/** On a finished game's bubble, like iMessage games: a floating crown if you won, a red ✕ if you lost. */
function ResultBadge({ game, me, side }) {
  if (game.status !== "done" || !game.winner) return null;
  const pos = side === "left" ? "-top-4 -left-3" : "-top-4 -right-3";
  if (game.winner === "draw") {
    return (
      <span className={cn("absolute grid size-9 place-items-center rounded-full bg-mist-300 text-ink-950 shadow-lg ring-2 ring-ink-900", pos)} title="Draw" aria-label="Draw">
        <Equal className="size-5" strokeWidth={3} />
      </span>
    );
  }
  if (game.winner === me) {
    return (
      <motion.span
        className={cn("absolute grid size-11 place-items-center rounded-full bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-[0_6px_20px_-4px_rgba(251,191,36,.8)] ring-2 ring-ink-900", pos)}
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: [-8, 8, -8], y: [0, -5, 0] }}
        transition={{ scale: { type: "spring", stiffness: 400, damping: 14 }, rotate: { duration: 2.4, repeat: Infinity, ease: "easeInOut" }, y: { duration: 2.4, repeat: Infinity, ease: "easeInOut" } }}
        title="You won"
        aria-label="You won"
      >
        <Crown className="size-6" fill="currentColor" strokeWidth={1.5} />
      </motion.span>
    );
  }
  return (
    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 15 }} className={cn("absolute grid size-10 place-items-center rounded-full bg-live text-white shadow-[0_6px_18px_-4px_rgba(239,68,68,.7)] ring-2 ring-ink-900", pos)} title="You lost" aria-label="You lost">
      <X className="size-6" strokeWidth={3.2} />
    </motion.span>
  );
}
