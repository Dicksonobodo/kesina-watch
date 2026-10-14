import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw, Share2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { gamesApi } from "@/lib/games";
import { useGames } from "./GamesProvider";
import { GameArt } from "./art";
import { Card, ErrorNote, Eyebrow, RewardCard, shareResult } from "./ui";

/*
 * Keepie-uppie: tap the ball as it falls to keep it in the air. Where you tap decides where it
 * goes (tap the left side to send it right), and it gets faster and smaller the longer you last.
 * The game runs in the browser; the server times the run and only accepts believable scores.
 */

const W = 360;
const H = 540;

export function Keepy() {
  const { rewarded, profile } = useGames();
  const canvas = useRef(null);
  const game = useRef(null);
  const raf = useRef(0);
  const sessionRef = useRef(null);
  const [phase, setPhase] = useState("intro"); // intro | play | over
  const [score, setScore] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [shared, setShared] = useState("");

  const stop = useCallback(() => cancelAnimationFrame(raf.current), []);
  useEffect(() => stop, [stop]);

  async function finish(hits) {
    stop();
    setPhase("over");
    setScore(hits);
    setResult(null);
    try {
      const r = await gamesApi("keepy.finish", { session: sessionRef.current, score: hits });
      setResult(r);
      rewarded(r.reward);
    } catch (err) {
      setError(err.message);
    }
  }

  async function start() {
    setError("");
    setStarting(true);
    try {
      sessionRef.current = (await gamesApi("keepy.start")).session;
    } catch (err) {
      setError(err.message);
      setStarting(false);
      return;
    }
    setStarting(false);
    setScore(0);
    setResult(null);
    setShared("");
    setPhase("play");
  }

  // The game loop runs while a round is being played.
  useEffect(() => {
    if (phase !== "play") return;
    const cv = canvas.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr;
    cv.height = H * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    const accent = getComputedStyle(cv).getPropertyValue("--color-signal").trim() || "#c6ff3d";

    const g = (game.current = { x: W / 2, y: 170, vx: 0, vy: 0, rot: 0, hits: 0, started: false, over: false, floaters: [], last: performance.now(), bob: 0 });
    const radius = () => Math.max(22, 36 - g.hits * 0.12);

    const tap = (e) => {
      if (g.over) return;
      const rect = cv.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const py = ((e.clientY - rect.top) / rect.height) * H;
      const r = radius();
      const dist = Math.hypot(px - g.x, py - g.y);
      if (dist > r + 26) return;
      if (!g.started) {
        g.started = true;
      } else if (g.vy <= 0) {
        return; // the ball is still on its way up: wait for it to come back down
      }
      g.hits += 1;
      g.vy = -(10.8 + Math.min(g.hits, 60) * 0.025);
      g.vx = Math.max(-7, Math.min(7, g.vx * 0.3 + ((g.x - px) / r) * 5.2));
      g.floaters.push({ x: g.x, y: g.y - r, life: 1, text: `+1` });
      setScore(g.hits);
    };
    cv.addEventListener("pointerdown", tap);

    function frame(now) {
      const dt = Math.min((now - g.last) / 16.67, 2.5);
      g.last = now;
      const r = radius();
      const gravity = 0.42 + Math.min(g.hits, 80) * 0.0028;
      if (g.started) {
        g.vy += gravity * dt;
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        g.rot += g.vx * 0.04 * dt;
        if (g.x < r) ((g.x = r), (g.vx = Math.abs(g.vx) * 0.8));
        if (g.x > W - r) ((g.x = W - r), (g.vx = -Math.abs(g.vx) * 0.8));
        if (g.y < r) ((g.y = r), (g.vy = Math.abs(g.vy) * 0.4));
        if (g.y > H - r - 14) {
          g.over = true;
          draw(r);
          finish(g.hits);
          return;
        }
      } else {
        g.bob += 0.06 * dt;
        g.y = 170 + Math.sin(g.bob) * 8;
      }
      draw(r);
      raf.current = requestAnimationFrame(frame);
    }

    function draw(r) {
      // grass
      const grass = ctx.createLinearGradient(0, 0, 0, H);
      grass.addColorStop(0, "#0d3b27");
      grass.addColorStop(1, "#14532d");
      ctx.fillStyle = grass;
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.05)";
        ctx.fillRect(0, i * (H / 8), W, H / 8);
      }
      // ground line
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, H - 14);
      ctx.lineTo(W, H - 14);
      ctx.stroke();
      // shadow gets smaller the higher the ball is
      const height = Math.max(0, Math.min(1, (H - 14 - g.y) / H));
      ctx.fillStyle = `rgba(0,0,0,${0.35 - height * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(g.x, H - 8, r * (1.1 - height * 0.5), 6 * (1.1 - height * 0.5), 0, 0, Math.PI * 2);
      ctx.fill();
      // ball
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.rot);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#15151c";
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#15151c";
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36);
        ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
        ctx.stroke();
      }
      ctx.restore();
      // "+1"
      g.floaters = g.floaters.filter((f) => f.life > 0);
      ctx.font = "800 22px system-ui, sans-serif";
      ctx.textAlign = "center";
      for (const f of g.floaters) {
        ctx.fillStyle = accent;
        ctx.globalAlpha = f.life;
        ctx.fillText(f.text, f.x, f.y - (1 - f.life) * 40);
        f.life -= 0.04;
      }
      ctx.globalAlpha = 1;
      // score
      ctx.fillStyle = "rgba(255,255,255,.95)";
      ctx.font = "800 64px system-ui, sans-serif";
      ctx.fillText(String(g.hits), W / 2, 78);
      if (!g.started) {
        ctx.fillStyle = accent;
        ctx.font = "700 16px system-ui, sans-serif";
        ctx.fillText("Tap the ball to start", W / 2, 260);
      }
    }

    g.last = performance.now();
    raf.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf.current);
      cv.removeEventListener("pointerdown", tap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function share() {
    setShared(await shareResult(`🤹 ${score} touches in Keepie-Uppie on Dixon Watch. Think you can beat me?\n${window.location.origin}/games/keepy`));
  }

  const best = profile?.stats?.keepyBest ?? 0;

  return (
    <div className="mx-auto max-w-md">
      <Link to="/games" className="mb-6 inline-flex items-center gap-2 text-sm text-mist-500 transition hover:text-mist-100">
        <ArrowLeft className="size-4" /> Games
      </Link>

      {phase === "intro" && (
        <Card className="overflow-hidden text-center">
          <GameArt id="keepy" fit="meet" className="-mx-5 -mt-5 mb-6 h-56 sm:-mx-6 sm:-mt-6" />
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Keepie-Uppie</h1>
          <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-mist-500">
            Pure skill, no questions. Tap the ball as it falls to keep it up. Where you tap decides where it flies: hit the left side to send it right. It gets faster and smaller as you go.
          </p>
          {best > 0 && <p className="mt-4 text-sm text-mist-300">Your best: <span className="font-bold text-signal">{best}</span> touches</p>}
          <div className="mt-7">
            <Button size="lg" onClick={start} loading={starting}>
              Kick off
            </Button>
          </div>
          <Link to="/games/leaderboard?board=keepyWeekly" className="mt-5 inline-block text-sm font-semibold text-signal">
            See the best freestylers →
          </Link>
          <div className="mt-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
        </Card>
      )}

      {phase !== "intro" && (
        <div className="space-y-4">
          <div className="relative mx-auto overflow-hidden rounded-3xl ring-1 ring-white/10" style={{ maxWidth: "min(100%, 48vh)" }}>
            <canvas ref={canvas} className="block w-full touch-none select-none" style={{ aspectRatio: `${W} / ${H}`, background: "#0d3b27" }} />
          </div>

          {phase === "over" && (
            <>
              <Card className="text-center">
                <Eyebrow>{result?.record && score > 0 ? "New personal best!" : "Full time"}</Eyebrow>
                <p className="mt-3 font-display text-6xl font-extrabold text-signal tabular-nums">{result?.score ?? score}</p>
                <p className="text-sm text-mist-500">touches{result ? ` · best ${result.best}` : ""}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Button onClick={start} loading={starting}>
                    <RotateCcw className="size-4" /> Again
                  </Button>
                  <Button variant="ghost" onClick={share}>
                    <Share2 className="size-4" /> {shared === "copied" ? "Copied!" : "Share"}
                  </Button>
                  <Link to="/games/leaderboard?board=keepyWeekly">
                    <Button variant="subtle">
                      <Trophy className="size-4" /> Board
                    </Button>
                  </Link>
                </div>
              </Card>
              <RewardCard reward={result?.reward} />
            </>
          )}
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </div>
  );
}
