import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { gamesApi } from "@/lib/games";
import { useGames } from "../GamesProvider";

/*
 * Chat state for the whole Game Zone: the conversation list, the open conversation, unread
 * count, and the game being played full screen. The server is polled: very rarely while the chat is
 * closed (one tiny request), quickly while a conversation is open.
 */

const ChatContext = createContext(null);

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}

const sortMessages = (list) => [...list].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));

function mergeMessages(current, incoming) {
  if (!incoming.length) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  // a temporary (sending) message is replaced once the real one arrives
  return sortMessages([...byId.values()]);
}

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const { profile, toast } = useGames();
  const meUid = profile?.uid ?? null; // the id the server knows this player by
  const meRef = useRef(null);
  const toastRef = useRef(toast);
  const seenRef = useRef(null); // chat → lastAt already seen (for "new message" notifications)
  const openThreadRef = useRef(null);
  meRef.current = meUid;
  toastRef.current = toast;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("list"); // list | thread
  const [inbox, setInbox] = useState([]);
  const [unread, setUnread] = useState(0);
  const [peer, setPeer] = useState(null); // the person whose conversation is open
  const [thread, setThread] = useState({ chat: null, messages: [], readAt: 0, typing: false, loading: false, blocked: false });
  const [gameId, setGameId] = useState(null); // game open full screen
  const [pendingInvite, setPendingInvite] = useState(null); // a battle invite waiting for someone to be picked
  const [error, setError] = useState("");

  const vRef = useRef(-1);
  const sinceRef = useRef(0);
  const chatRef = useRef(null);
  const typingRef = useRef({ want: false, sentAt: 0 });
  const timer = useRef(0);
  const alive = useRef(true);
  const busy = useRef(false);
  const openRef = useRef(false);
  const viewRef = useRef("list");

  openRef.current = open;
  viewRef.current = view;
  chatRef.current = thread.chat;

  const sync = useCallback(async () => {
    if (busy.current || !alive.current) return;
    busy.current = true;
    try {
      const wantTyping = typingRef.current.want && Date.now() - typingRef.current.sentAt > 3500;
      if (wantTyping) typingRef.current.sentAt = Date.now();
      const r = await gamesApi("chat.sync", { v: vRef.current, chat: openRef.current && viewRef.current === "thread" ? chatRef.current : null, since: sinceRef.current, typing: wantTyping });
      if (!alive.current) return;
      setUnread(r.unread);
      if (r.inbox) {
        setInbox(r.inbox);
        vRef.current = r.v;
        // A pop-up for anything new that arrived while you weren't looking at that conversation.
        const seen = seenRef.current;
        seenRef.current = new Map(r.inbox.map((c) => [c.chat, c.lastAt]));
        if (seen) {
          for (const c of r.inbox) {
            const fresh = c.lastAt > (seen.get(c.chat) ?? 0) && c.last.from !== meRef.current && c.unread > 0;
            const watching = openRef.current && viewRef.current === "thread" && chatRef.current === c.chat;
            if (fresh && !watching) toastRef.current?.({ title: c.peer.name, body: c.last.text, icon: c.peer.avatar, onClick: () => openThreadRef.current?.(c.peer) });
          }
        }
      }
      if (r.thread && r.thread.chat === chatRef.current) {
        const max = r.thread.messages.reduce((n, m) => Math.max(n, m.upd ?? m.at), sinceRef.current);
        sinceRef.current = max;
        setThread((t) => ({ ...t, messages: mergeMessages(t.messages.filter((m) => !m.pending || !r.thread.messages.some((x) => x.from === m.from && x.text === m.text && x.type === m.type)), r.thread.messages), readAt: r.thread.readAt, typing: r.thread.typing }));
      }
    } catch {
      /* offline or the server hiccuped: the next poll tries again */
    } finally {
      busy.current = false;
    }
  }, []);

  // The polling loop: fast with a conversation open, slow otherwise, slower still when the tab is hidden.
  useEffect(() => {
    if (!user) return;
    alive.current = true;
    const loop = async () => {
      await sync();
      if (!alive.current) return;
      const hidden = document.hidden;
      const delay = hidden ? 60_000 : open && view === "thread" ? 2_000 : open ? 5_000 : 8_000;
      timer.current = setTimeout(loop, delay);
    };
    clearTimeout(timer.current);
    loop();
    const wake = () => !document.hidden && (clearTimeout(timer.current), loop());
    document.addEventListener("visibilitychange", wake);
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [user?.uid, open, view, sync]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- actions ----- */

  const openPanel = useCallback(() => {
    setOpen(true);
    vRef.current = -1; // refresh the list
  }, []);
  const closePanel = useCallback(() => setOpen(false), []);

  const showList = useCallback(() => {
    setView("list");
    setPeer(null);
    setThread((t) => ({ ...t, chat: null, messages: [], typing: false }));
    chatRef.current = null;
    vRef.current = -1;
    sync();
  }, [sync]);

  const openThread = useCallback(async (person) => {
    setOpen(true);
    setView("thread");
    setPeer(person);
    setError("");
    setThread({ chat: null, messages: [], readAt: 0, typing: false, loading: true, blocked: false });
    try {
      const r = await gamesApi("chat.open", { peer: person.uid });
      chatRef.current = r.chat;
      sinceRef.current = r.since;
      setPeer(r.peer);
      setThread({ chat: r.chat, messages: r.messages, readAt: r.readAt, typing: false, loading: false, blocked: r.blocked });
      vRef.current = -1;
      sync();
    } catch (err) {
      setError(err.message);
      setThread((t) => ({ ...t, loading: false }));
    }
  }, [sync]);

  openThreadRef.current = openThread;

  const send = useCallback(
    async (body) => {
      const target = peer?.uid;
      if (!target) return null;
      const tmp = { id: `tmp-${Date.now()}`, from: meUid ?? "me", at: Date.now(), upd: Date.now(), type: body.kind === "invite" ? "invite" : "text", text: body.text ?? "", invite: null, game: null, reactions: {}, pending: true };
      if (body.kind !== "invite") setThread((t) => ({ ...t, messages: mergeMessages(t.messages, [tmp]) }));
      typingRef.current.want = false;
      try {
        const r = await gamesApi("chat.send", { peer: target, ...body });
        sinceRef.current = Math.max(sinceRef.current, r.message.upd);
        setThread((t) => ({ ...t, chat: t.chat ?? r.chat, messages: mergeMessages(t.messages.filter((m) => m.id !== tmp.id), [r.message]) }));
        chatRef.current = chatRef.current ?? r.chat;
        return r;
      } catch (err) {
        setThread((t) => ({ ...t, messages: t.messages.filter((m) => m.id !== tmp.id) }));
        setError(err.message);
        throw err;
      }
    },
    [peer, meUid],
  );

  const react = useCallback(async (msg, emoji) => {
    const chat = chatRef.current;
    if (!chat) return;
    // show it straight away, the server confirms on the next poll
    setThread((t) => ({ ...t, messages: t.messages.map((m) => (m.id === msg.id ? { ...m, reactions: m.reactions?.[meUid] === emoji ? Object.fromEntries(Object.entries(m.reactions).filter(([k]) => k !== meUid)) : { ...m.reactions, [meUid]: emoji } } : m)) }));
    await gamesApi("chat.react", { chat, msg: msg.id, emoji }).catch((e) => setError(e.message));
  }, [meUid]);

  const unsend = useCallback(async (msg) => {
    const chat = chatRef.current;
    if (!chat) return;
    setThread((t) => ({ ...t, messages: t.messages.map((m) => (m.id === msg.id ? { ...m, deleted: true, text: "", invite: null, game: null } : m)) }));
    await gamesApi("chat.unsend", { chat, msg: msg.id }).catch((e) => setError(e.message));
  }, []);

  const editMessage = useCallback(async (msg, text) => {
    const chat = chatRef.current;
    if (!chat) return;
    const before = msg.text;
    setThread((t) => ({ ...t, messages: t.messages.map((m) => (m.id === msg.id ? { ...m, text, edited: true } : m)) }));
    try {
      const r = await gamesApi("chat.edit", { chat, msg: msg.id, text });
      setThread((t) => ({ ...t, messages: mergeMessages(t.messages, [r.message]) }));
    } catch (err) {
      setThread((t) => ({ ...t, messages: t.messages.map((m) => (m.id === msg.id ? { ...m, text: before, edited: msg.edited } : m)) }));
      setError(err.message);
      throw err;
    }
  }, []);

  const setTyping = useCallback((on) => {
    typingRef.current.want = on;
  }, []);

  const block = useCallback(async (blocked) => {
    if (!peer) return;
    await gamesApi("chat.block", { uid: peer.uid, blocked });
    setThread((t) => ({ ...t, blocked }));
  }, [peer]);

  const report = useCallback(async (reason) => {
    if (!chatRef.current) return;
    await gamesApi("chat.report", { chat: chatRef.current, reason });
  }, []);

  /** Starts a game with the person in the open conversation: you play first, then it's sent. */
  const startGame = useCallback(async (type) => {
    if (!peer) return;
    const r = await gamesApi("cg.create", { peer: peer.uid, type });
    chatRef.current = chatRef.current ?? r.chat;
    setThread((t) => ({ ...t, chat: t.chat ?? r.chat }));
    setGameId(r.game.id);
    return r;
  }, [peer]);

  /** After you send your turn: close the game and show the conversation with the new bubble. */
  const backToChat = useCallback(() => {
    setGameId(null);
    setOpen(true);
    vRef.current = -1;
    setTimeout(() => sync(), 50);
  }, [sync]);

  /** Another page (the battle waiting room) asks to send a join code to a friend. */
  const shareInvite = useCallback((invite) => {
    setPendingInvite(invite);
    setView("list");
    setOpen(true);
    vRef.current = -1;
  }, []);

  const value = useMemo(
    () => ({ open, view, inbox, unread, peer, thread, gameId, setGameId, pendingInvite, setPendingInvite, error, setError, openPanel, closePanel, showList, openThread, send, react, unsend, editMessage, setTyping, block, report, startGame, backToChat, shareInvite, me: meUid }),
    [open, view, inbox, unread, peer, thread, gameId, pendingInvite, error, openPanel, closePanel, showList, openThread, send, react, unsend, editMessage, setTyping, block, report, startGame, backToChat, shareInvite, meUid],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
