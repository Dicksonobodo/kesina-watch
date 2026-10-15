import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, Copy, Download, Hand, Move, Plus, RotateCcw, Save, Shirt, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { gamesApi } from "@/lib/games";
import { cn } from "@/lib/cn";
import { Card, ErrorNote, Eyebrow } from "@/features/games/ui";
import { GameArt } from "@/features/games/art";

/*
 * Line-up creator: pick a formation, put your players on the pitch (name and shirt number), drag
 * anyone anywhere to make your own shape, add subs and kit colours, then save, share or download
 * the line-up as a picture.
 */

export const FORMATIONS = ["4-3-3", "4-4-2", "4-2-3-1", "4-1-4-1", "4-4-1-1", "4-3-2-1", "4-1-2-1-2", "4-5-1", "4-2-2-2", "3-5-2", "3-4-3", "3-4-2-1", "5-3-2", "5-4-1"];
const KITS = [
  ["#c6ff3d", "#0a0a0f"], ["#e11d48", "#ffffff"], ["#2563eb", "#ffffff"], ["#f8fafc", "#111827"], ["#facc15", "#111827"], ["#16a34a", "#ffffff"], ["#111827", "#facc15"], ["#7c3aed", "#ffffff"], ["#f97316", "#111827"], ["#0ea5e9", "#0a0a0f"],
];

/** Where the players stand in a formation: the keeper at the bottom, attackers at the top (x, y in %). */
export function formationSpots(formation) {
  const lines = formation.split("-").map(Number);
  const spots = [{ x: 50, y: 90 }];
  lines.forEach((count, i) => {
    const y = lines.length === 1 ? 45 : 72 - (i * 54) / (lines.length - 1);
    const width = Math.min(76, 22 * (count - 1));
    for (let j = 0; j < count; j++) spots.push({ x: count === 1 ? 50 : 50 - width / 2 + (j * width) / (count - 1), y });
  });
  return spots;
}

const blankLineup = (formation = "4-3-3") => ({
  v: 1,
  team: "",
  formation,
  custom: false,
  kit: { shirt: KITS[0][0], text: KITS[0][1] },
  players: formationSpots(formation).map((s, i) => ({ ...s, name: i === 0 ? "Keeper" : `Player ${i + 1}`, number: i + 1 })),
  subs: [],
});

/* ---------- the list ---------- */

export function Lineups() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    gamesApi("create.list", { kind: "lineup" })
      .then((r) => setItems(r.items))
      .catch((e) => (setError(e.message), setItems([])));
  }, []);
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/games" className="mb-6 inline-flex items-center gap-2 text-sm text-mist-500 transition hover:text-mist-100">
        <ArrowLeft className="size-4" /> Games
      </Link>
      <Card className="overflow-hidden">
        <GameArt id="lineup" fit="meet" className="-mx-5 -mt-5 mb-5 h-40 sm:-mx-6 sm:-mt-6" />
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Line-up creator</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-mist-500">Pick a formation, add your players, and drag anyone anywhere to make it your own. Save it, share it, or download it as a picture for the group chat.</p>
        <Link to="/games/lineups/new">
          <Button size="lg" className="mt-5">
            <Plus className="size-4" /> New line-up
          </Button>
        </Link>
      </Card>
      <div className="mt-6">
        <Eyebrow className="mb-3">Your line-ups</Eyebrow>
        <ErrorNote>{error}</ErrorNote>
        {items === null && <div className="skeleton h-20 rounded-3xl" />}
        {items?.length === 0 && <p className="rounded-3xl border border-dashed border-white/[.1] px-5 py-8 text-center text-sm text-mist-500">No line-ups yet.</p>}
        <div className="grid gap-2.5 sm:grid-cols-2">
          {items?.map((it) => (
            <Link key={it.id} to={`/games/lineups/${it.id}`} className="flex items-center gap-4 rounded-3xl bg-white/[.03] p-4 ring-1 ring-white/[.07] transition hover:bg-white/[.05] hover:ring-signal/40">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/25">
                <Shirt className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{it.name}</span>
                <span className="block truncate text-xs text-mist-500">{it.info}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- the editor ---------- */

export function LineupEditor() {
  const { id } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const [lineup, setLineup] = useState(isNew ? blankLineup() : null);
  const [mine, setMine] = useState(isNew);
  const [savedId, setSavedId] = useState(isNew ? null : id);
  const [selected, setSelected] = useState(null); // player index being edited
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hand, setHand] = useState(false); // "Edit by hand": players can be dragged anywhere
  const pitch = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    if (isNew) return;
    gamesApi("create.get", { id })
      .then((r) => {
        setLineup(r.data);
        setMine(r.mine);
      })
      .catch((e) => setError(e.message));
  }, [id, isNew]);

  const change = (fn) => {
    setLineup((l) => fn(structuredClone(l)));
    setDirty(true);
  };

  function pickFormation(f) {
    change((l) => {
      const spots = formationSpots(f);
      l.players = l.players.map((p, i) => ({ ...p, ...spots[i] }));
      l.formation = f;
      l.custom = false;
      return l;
    });
  }

  /* dragging a player: a short press without moving opens the name editor */
  function down(e, i) {
    if (!mine) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* fine */
    }
    drag.current = { i, x: e.clientX, y: e.clientY, moved: false, tapOnly: !hand };
  }
  function move(e) {
    const d = drag.current;
    if (!d) return;
    const far = Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 6;
    if (d.tapOnly) {
      if (far) d.cancelled = true; // outside "Edit by hand" players don't move, and a drag isn't a tap
      return;
    }
    if (!d.moved && !far) return;
    d.moved = true;
    const r = pitch.current.getBoundingClientRect();
    const x = Math.max(4, Math.min(96, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.max(4, Math.min(96, ((e.clientY - r.top) / r.height) * 100));
    setLineup((l) => {
      const next = structuredClone(l);
      next.players[d.i].x = x;
      next.players[d.i].y = y;
      next.custom = true;
      return next;
    });
    setDirty(true);
  }
  function up() {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && !d.cancelled) setSelected(d.i);
  }

  async function save() {
    if (!lineup.team.trim()) return setError("Give your team a name first.");
    setSaving(true);
    setError("");
    try {
      const info = `${lineup.custom ? `Custom (from ${lineup.formation})` : lineup.formation} · ${lineup.subs.length} subs`;
      const r = await gamesApi("create.save", { id: savedId ?? undefined, kind: "lineup", name: lineup.team.trim(), data: lineup, info });
      setDirty(false);
      if (!savedId) {
        setSavedId(r.id);
        navigate(`/games/lineups/${r.id}`, { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function share() {
    if (!savedId) return setError("Save it first, then you can share the link.");
    const url = `${location.origin}/games/lineups/${savedId}`;
    try {
      if (navigator.share) await navigator.share({ title: lineup.team, text: `${lineup.team} line-up`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* cancelled */
    }
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    await gamesApi("create.delete", { id: savedId }).catch(() => {});
    navigate("/games/lineups");
  }

  if (error && !lineup) return (
    <div className="mx-auto max-w-3xl">
      <Link to="/games/lineups" className="mb-6 inline-flex items-center gap-2 text-sm text-mist-500">
        <ArrowLeft className="size-4" /> Line-ups
      </Link>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
  if (!lineup) return (
    <div className="grid place-items-center py-24">
      <Spinner className="size-6 text-signal" />
    </div>
  );

  const kit = lineup.kit;
  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/games/lineups" className="mb-5 inline-flex items-center gap-2 text-sm text-mist-500 transition hover:text-mist-100">
        <ArrowLeft className="size-4" /> Line-ups
      </Link>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* the pitch */}
        <div>
          {mine ? (
            <input value={lineup.team} onChange={(e) => change((l) => ((l.team = e.target.value.slice(0, 40)), l))} placeholder="Team name" className="w-full bg-transparent font-display text-3xl font-extrabold tracking-tight outline-none placeholder:text-mist-700" />
          ) : (
            <h1 className="font-display text-3xl font-extrabold tracking-tight">{lineup.team}</h1>
          )}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-mist-500">{lineup.custom ? `Custom shape (started from ${lineup.formation})` : lineup.formation}</p>
            {mine && (
              <button
                onClick={() => setHand((h) => !h)}
                aria-pressed={hand}
                className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ring-1 transition", hand ? "bg-signal text-ink-950 ring-signal" : "bg-white/[.05] text-mist-100 ring-white/15 hover:bg-white/[.09]")}
              >
                {hand ? <Check className="size-4" /> : <Hand className="size-4" />} {hand ? "Done moving" : "Edit by hand"}
              </button>
            )}
          </div>
          {hand && <p className="mt-2 rounded-2xl bg-signal/10 px-3.5 py-2 text-[13px] text-signal ring-1 ring-signal/30">Drag any player to a new spot to make your own shape. Tap Done moving when you're happy.</p>}

          <div ref={pitch} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className={cn("relative mx-auto mt-4 aspect-[68/100] w-full max-w-[min(100%,62vh)] touch-none overflow-hidden rounded-3xl transition select-none", hand && "ring-4 ring-signal/70")} style={{ background: "repeating-linear-gradient(180deg,#15803d 0 10%,#16a34a 10% 20%)" }}>
            <PitchLines />
            {lineup.players.map((p, i) => (
              <button
                key={i}
                onPointerDown={(e) => down(e, i)}
                className={cn("absolute flex -translate-x-1/2 -translate-y-1/2 touch-none flex-col items-center [-webkit-touch-callout:none]", mine && hand ? "cursor-grab active:cursor-grabbing" : mine ? "cursor-pointer" : "cursor-default")}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                aria-label={`${p.name}, number ${p.number}`}
              >
                <span className={cn("grid size-10 place-items-center rounded-full font-display text-[15px] font-extrabold shadow-[0_4px_10px_rgba(0,0,0,.45)] ring-2 ring-white/80 sm:size-11", hand && "animate-pulse ring-4")} style={{ background: i === 0 ? "#f59e0b" : kit.shirt, color: i === 0 ? "#111827" : kit.text }}>
                  {p.number}
                </span>
                <span className="mt-1 max-w-24 truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] leading-tight font-semibold text-white">{p.name}</span>
              </button>
            ))}
          </div>
          {mine && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-mist-500">
              <Move className="size-3.5" /> {hand ? "Drag to move · tap Done moving when finished" : "Tap a player to change the name or number · Edit by hand to move them"}
            </p>
          )}
        </div>

        {/* the controls */}
        <div className="space-y-3">
          {mine && (
            <Card className="!p-4">
              <Eyebrow>Formation</Eyebrow>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {FORMATIONS.map((f) => (
                  <button key={f} onClick={() => pickFormation(f)} className={cn("rounded-xl px-2.5 py-1.5 font-mono text-[12.5px] font-semibold ring-1 transition", !lineup.custom && lineup.formation === f ? "bg-signal text-ink-950 ring-signal" : "bg-white/[.04] text-mist-300 ring-white/10 hover:bg-white/[.08]")}>
                    {f}
                  </button>
                ))}
              </div>
              {lineup.custom && (
                <button onClick={() => pickFormation(lineup.formation)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-signal">
                  <RotateCcw className="size-3.5" /> Back to a standard {lineup.formation}
                </button>
              )}
            </Card>
          )}

          {mine && (
            <Card className="!p-4">
              <Eyebrow>Kit</Eyebrow>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {KITS.map(([shirt, text]) => (
                  <button key={shirt + text} onClick={() => change((l) => ((l.kit = { shirt, text }), l))} aria-label={`Kit ${shirt}`} className={cn("grid size-9 place-items-center rounded-full ring-2 transition", kit.shirt === shirt && kit.text === text ? "ring-white" : "ring-white/15")} style={{ background: shirt, color: text }}>
                    <span className="font-display text-xs font-extrabold">9</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card className="!p-4">
            <div className="flex items-center justify-between">
              <Eyebrow>Substitutes ({lineup.subs.length})</Eyebrow>
              {mine && lineup.subs.length < 12 && (
                <button onClick={() => change((l) => (l.subs.push({ name: `Sub ${l.subs.length + 1}`, number: 12 + l.subs.length }), l))} className="inline-flex items-center gap-1 text-xs font-semibold text-signal">
                  <UserPlus className="size-3.5" /> Add
                </button>
              )}
            </div>
            <div className="mt-2 space-y-1.5">
              {lineup.subs.length === 0 && <p className="text-xs text-mist-500">No subs yet.</p>}
              {lineup.subs.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  {mine ? (
                    <>
                      <input value={s.number} inputMode="numeric" onChange={(e) => change((l) => ((l.subs[i].number = Number(e.target.value.replace(/\D/g, "").slice(0, 2)) || ""), l))} className="h-9 w-12 rounded-xl bg-white/[.05] text-center font-mono text-sm ring-1 ring-white/10 outline-none focus:ring-signal/50" aria-label="Shirt number" />
                      <input value={s.name} onChange={(e) => change((l) => ((l.subs[i].name = e.target.value.slice(0, 24)), l))} className="h-9 min-w-0 flex-1 rounded-xl bg-white/[.05] px-3 text-sm ring-1 ring-white/10 outline-none focus:ring-signal/50" aria-label="Name" />
                      <button onClick={() => change((l) => (l.subs.splice(i, 1), l))} aria-label="Remove" className="grid size-8 place-items-center rounded-full text-mist-500 hover:bg-white/10 hover:text-white">
                        <X className="size-4" />
                      </button>
                    </>
                  ) : (
                    <p className="text-sm">
                      <span className="mr-2 font-mono text-mist-500">{s.number}</span>
                      {s.name}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <ErrorNote>{error}</ErrorNote>
          <div className="flex flex-wrap gap-2">
            {mine && (
              <Button onClick={save} loading={saving} disabled={!dirty && Boolean(savedId)}>
                {!dirty && savedId ? <Check className="size-4" /> : <Save className="size-4" />} {!dirty && savedId ? "Saved" : "Save"}
              </Button>
            )}
            <Button variant="ghost" onClick={() => downloadLineup(lineup)}>
              <Download className="size-4" /> Image
            </Button>
            <Button variant="ghost" onClick={share}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Share"}
            </Button>
            {mine && savedId && (
              <Button variant="subtle" onClick={remove} onMouseLeave={() => setConfirmDelete(false)} className={confirmDelete ? "!text-live" : ""}>
                <Trash2 className="size-4" /> {confirmDelete ? "Tap again" : "Delete"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selected !== null && mine && (
          <PlayerSheet
            player={lineup.players[selected]}
            keeper={selected === 0}
            onClose={() => setSelected(null)}
            onChange={(patch) => change((l) => ((l.players[selected] = { ...l.players[selected], ...patch }), l))}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PlayerSheet({ player, keeper, onClose, onChange }) {
  // The tap that opened this box also sends a click a moment later; don't let it close the box.
  const openedAt = useRef(Date.now());
  const backdrop = () => Date.now() - openedAt.current > 400 && onClose();
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[120] grid place-items-end bg-black/60 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:place-items-center" onClick={backdrop}>
      <motion.form
        initial={{ y: 30 }}
        animate={{ y: 0 }}
        onSubmit={(e) => (e.preventDefault(), onClose())}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-[28px] bg-ink-900 p-5 ring-1 ring-white/10"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">{keeper ? "Goalkeeper" : "Player"}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full bg-white/[.06]">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <input value={player.number} inputMode="numeric" onChange={(e) => onChange({ number: Number(e.target.value.replace(/\D/g, "").slice(0, 2)) || "" })} aria-label="Shirt number" className="h-12 w-16 rounded-2xl bg-white/[.05] text-center font-display text-xl font-bold ring-1 ring-white/10 outline-none focus:ring-signal/50" />
          <input value={player.name} onChange={(e) => onChange({ name: e.target.value.slice(0, 24) })} autoFocus aria-label="Name" placeholder="Name" className="h-12 min-w-0 flex-1 rounded-2xl bg-white/[.05] px-4 text-[15px] ring-1 ring-white/10 outline-none focus:ring-signal/50" />
        </div>
        <Button type="submit" className="mt-4 w-full">
          Done
        </Button>
      </motion.form>
    </motion.div>
  );
}

function PitchLines() {
  return (
    <svg viewBox="0 0 68 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
      <g fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth=".35">
        <rect x="3" y="3" width="62" height="94" />
        <line x1="3" y1="50" x2="65" y2="50" />
        <circle cx="34" cy="50" r="8" />
        <rect x="16" y="3" width="36" height="14" />
        <rect x="25" y="3" width="18" height="5" />
        <rect x="16" y="83" width="36" height="14" />
        <rect x="25" y="92" width="18" height="5" />
        <path d="M27 17 A8 8 0 0 0 41 17" />
        <path d="M27 83 A8 8 0 0 1 41 83" />
      </g>
    </svg>
  );
}

/* ---------- the picture ---------- */

function downloadLineup(l) {
  const W = 1080;
  const pitchH = (W - 120) * (100 / 68);
  const H = Math.round(200 + pitchH + (l.subs.length ? 110 : 60));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#0a0a0f";
  g.fillRect(0, 0, W, H);
  // header
  g.fillStyle = "#fff";
  g.font = "800 64px system-ui, sans-serif";
  g.fillText(l.team || "My team", 60, 105);
  g.fillStyle = "rgba(255,255,255,.6)";
  g.font = "600 32px system-ui, sans-serif";
  g.fillText(l.custom ? `Custom (from ${l.formation})` : l.formation, 60, 155);
  // pitch
  const px = 60;
  const py = 200;
  const pw = W - 120;
  const ph = pw * (100 / 68);
  for (let i = 0; i < 10; i++) {
    g.fillStyle = i % 2 ? "#16a34a" : "#15803d";
    g.fillRect(px, py + (ph / 10) * i, pw, ph / 10 + 1);
  }
  g.strokeStyle = "rgba(255,255,255,.6)";
  g.lineWidth = 4;
  const X = (v) => px + (v / 68) * pw;
  const Y = (v) => py + (v / 100) * ph;
  g.strokeRect(X(3), Y(3), X(65) - X(3), Y(97) - Y(3));
  g.beginPath();
  g.moveTo(X(3), Y(50));
  g.lineTo(X(65), Y(50));
  g.stroke();
  g.beginPath();
  g.arc(X(34), Y(50), (8 / 68) * pw, 0, Math.PI * 2);
  g.stroke();
  g.strokeRect(X(16), Y(3), X(52) - X(16), Y(17) - Y(3));
  g.strokeRect(X(16), Y(83), X(52) - X(16), Y(97) - Y(83));
  // players
  l.players.forEach((p, i) => {
    const cx = px + (p.x / 100) * pw;
    const cy = py + (p.y / 100) * ph;
    g.beginPath();
    g.arc(cx, cy, 40, 0, Math.PI * 2);
    g.fillStyle = i === 0 ? "#f59e0b" : l.kit.shirt;
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = "#fff";
    g.stroke();
    g.fillStyle = i === 0 ? "#111827" : l.kit.text;
    g.font = "800 36px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(p.number ?? ""), cx, cy + 2);
    g.font = "700 26px system-ui, sans-serif";
    const tw = g.measureText(p.name).width + 20;
    g.fillStyle = "rgba(0,0,0,.6)";
    g.fillRect(cx - tw / 2, cy + 48, tw, 38);
    g.fillStyle = "#fff";
    g.fillText(p.name, cx, cy + 68);
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
  });
  // subs
  if (l.subs.length) {
    g.fillStyle = "rgba(255,255,255,.6)";
    g.font = "600 28px system-ui, sans-serif";
    const text = "Subs: " + l.subs.map((s) => `${s.number} ${s.name}`).join(" · ");
    g.fillText(text.length > 80 ? text.slice(0, 78) + "…" : text, 60, Math.min(H - 40, py + ph + 50));
  }
  const a = document.createElement("a");
  a.download = `${(l.team || "lineup").replace(/[^\w-]+/g, "-")}.png`;
  a.href = c.toDataURL("image/png");
  a.click();
}
