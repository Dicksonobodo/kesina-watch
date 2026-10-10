import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { AlertTriangle, Check, ExternalLink, MonitorSmartphone, Pause, Play, RotateCcw, ScanSearch, X } from "lucide-react";
import { formatBytes, formatEta, formatSpeed } from "@/lib/format";
import { Poster } from "@/components/ui/Poster";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { deviceName } from "@/lib/userData";
import { useDownloads } from "./DownloadsProvider";

const STATUS_LABEL = {
  preparing: "Preparing",
  downloading: "Downloading",
  paused: "Paused",
  finishing: "Saving file",
  done: "Saved",
  handed: "In your browser's downloads",
  error: "Failed",
  canceled: "Canceled",
  interrupted: "Interrupted: the tab was closed",
  remote: "Downloading",
};

const FINISHED = new Set(["done", "handed", "error", "canceled", "interrupted", "remote"]);

/**
 * One download. In the tray (place="tray") the X only hides it from this session;
 * in the library (place="library") it deletes it from the synced history.
 */
export function JobCard({ job, place = "library" }) {
  const { pause, resume, cancel, dismiss, forget, retry, canRetry } = useDownloads();
  const navigate = useNavigate();
  const pct = Math.round((job.progress || 0) * 100);
  const running = job.status === "downloading" || job.status === "preparing";
  const finished = FINISHED.has(job.status);
  const broken = job.status === "error" || job.status === "interrupted";
  const retryable = broken && canRetry(job.id);
  const redetectable = broken && !retryable && job.pageUrl;
  const elsewhere = job.device && job.device !== deviceName();

  let line;
  if (job.status === "error") line = job.error;
  else if (running) line = `${pct}% · ${formatSpeed(job.speed)}${job.eta ? ` · ${formatEta(job.eta)}` : ""}`;
  else if (job.status === "remote") line = `Downloading ${elsewhere ? `on ${job.device}` : "in another tab"} · ${pct}%`;
  else if (job.status === "done") line = `Saved · ${formatBytes(job.bytes)}${job.fileName?.endsWith(".ts") ? " · .ts file (plays in VLC)" : ""}`;
  else line = `${STATUS_LABEL[job.status] ?? job.status}${job.status === "paused" || job.status === "interrupted" ? ` · ${pct}%` : ""}`;

  let detail = null;
  if (!finished) {
    detail = [
      formatBytes(job.bytes) + (job.total ? ` / ${job.type === "hls" ? "~" : ""}${formatBytes(job.total)}` : ""),
      job.piecesTotal ? `${job.piecesDone}/${job.piecesTotal} pieces` : null,
      job.via === "relay" ? "via Dixon server" : null,
    ];
  } else if (place === "library") {
    detail = [timeAgo(job.finishedAt || job.startedAt), job.site, elsewhere && job.status !== "remote" ? `on ${job.device}` : null];
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className={cn("flex items-center gap-3.5 rounded-2xl bg-white/[.03] p-3 ring-1 ring-white/[.06]", place === "library" && "sm:p-4")}
    >
      <ProgressRing job={job} pct={pct}>
        <Poster src={job.poster} title="" palette={job.palette} className="size-full rounded-[10px] ring-0" />
      </ProgressRing>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[14px] font-semibold">{job.title}</p>
          <span className="shrink-0 rounded-md bg-white/[.06] px-1.5 py-0.5 font-mono text-[10px] text-mist-300">{job.quality}</span>
        </div>
        <p
          className={cn(
            "mt-0.5 truncate font-mono text-[11px]",
            job.status === "error" ? "text-live" : job.status === "done" ? "text-signal" : "text-mist-500",
          )}
        >
          {line}
        </p>
        {detail && <p className="mt-0.5 truncate font-mono text-[10.5px] text-mist-700">{detail.filter(Boolean).join(" · ")}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {running && <IconButton label="Pause" onClick={() => pause(job.id)} icon={Pause} />}
        {job.status === "paused" && <IconButton label="Resume" onClick={() => resume(job.id)} icon={Play} accent />}
        {retryable && <IconButton label="Retry" onClick={() => retry(job.id)} icon={RotateCcw} accent />}
        {redetectable && (
          <IconButton label="Detect again" onClick={() => navigate(`/?u=${encodeURIComponent(job.pageUrl)}`)} icon={ScanSearch} accent />
        )}
        {job.status === "handed" && job.pageUrl && (
          <a
            href={job.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open original page"
            className="grid size-9 place-items-center rounded-full text-mist-500 transition hover:bg-white/[.06] hover:text-mist-100"
          >
            <ExternalLink className="size-4" />
          </a>
        )}
        {job.status !== "remote" && (
          <IconButton
            label={!finished ? "Cancel download" : place === "tray" ? "Hide" : "Delete from library"}
            onClick={() => (!finished ? cancel(job.id) : place === "tray" ? dismiss(job.id) : forget(job.id))}
            icon={X}
          />
        )}
      </div>
    </motion.div>
  );
}

function timeAgo(ms) {
  if (!ms) return "";
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString();
}

function IconButton({ label, onClick, icon: Icon, accent }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-9 place-items-center rounded-full transition",
        accent ? "bg-signal/10 text-signal hover:bg-signal/20" : "text-mist-500 hover:bg-white/[.06] hover:text-mist-100",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

function ProgressRing({ job, pct, children }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const color =
    job.status === "error"
      ? "var(--color-live)"
      : job.status === "paused" || job.status === "interrupted"
        ? "var(--color-mist-500)"
        : "var(--color-signal)";
  return (
    <div className="relative size-14 shrink-0">
      <svg viewBox="0 0 60 60" className="absolute inset-0 -rotate-90">
        <circle cx="30" cy="30" r={r} fill="none" stroke="rgb(255 255 255 / .08)" strokeWidth="3" />
        <motion.circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-[7px] overflow-hidden rounded-[10px]">
        {children}
        <div className="absolute inset-0 grid place-items-center bg-black/45">
          {job.status === "done" || job.status === "handed" ? (
            <Check className="size-4 text-signal" strokeWidth={3} />
          ) : job.status === "error" || job.status === "interrupted" ? (
            <AlertTriangle className={cn("size-4", job.status === "error" ? "text-live" : "text-mist-300")} />
          ) : job.status === "remote" ? (
            <MonitorSmartphone className="size-4 text-mist-100" />
          ) : job.status === "finishing" || job.status === "preparing" ? (
            <Spinner className="size-3.5 text-mist-100" />
          ) : (
            <span className="font-mono text-[10px] font-medium text-white">{pct}</span>
          )}
        </div>
      </div>
    </div>
  );
}
