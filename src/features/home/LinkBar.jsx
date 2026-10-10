import { AnimatePresence, motion } from "motion/react";
import { ClipboardPaste, Link2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/** The big paste-a-link bar (Home and Live). */
export function LinkBar({ detector, placeholder, label, actionLabel, busyLabel, actionIcon: ActionIcon, className }) {
  const { url, setUrl, status, setStatus, error, detect, reset, inputRef } = detector;

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {
      /* clipboard blocked: the field is focused so the user can paste */
    }
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={detect} className={cn("relative", className)}>
      <div
        className={cn(
          "group glass-strong relative flex flex-col gap-2 rounded-[26px] p-2 transition sm:flex-row sm:items-center sm:rounded-full",
          "focus-within:shadow-[0_0_0_1px_rgb(198_255_61/.5),0_20px_60px_-20px_rgb(198_255_61/.35)]",
          status === "error" && "shadow-[0_0_0_1px_rgb(255_90_78/.55)]",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 pr-2 pl-4">
          <Link2 className="size-5 shrink-0 text-mist-500 transition group-focus-within:text-signal" />
          <input
            ref={inputRef}
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (status === "error") setStatus("idle");
            }}
            placeholder={placeholder}
            className="h-12 w-full min-w-0 bg-transparent text-[15px] text-mist-100 outline-none placeholder:text-mist-700"
            aria-label={label}
          />
          {url ? (
            <button type="button" onClick={reset} className="text-mist-500 hover:text-mist-100" aria-label="Clear">
              <X className="size-[18px]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={pasteFromClipboard}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[.06] px-3 py-1.5 text-xs font-semibold text-mist-300 ring-1 ring-white/10 transition hover:text-mist-100"
            >
              <ClipboardPaste className="size-3.5" /> Paste
            </button>
          )}
        </div>
        <Button type="submit" size="lg" loading={status === "detecting"} className="w-full sm:w-auto">
          {status !== "detecting" && <ActionIcon className="size-[18px]" />}
          {status === "detecting" ? busyLabel : actionLabel}
        </Button>
      </div>

      <AnimatePresence>
        {status === "error" && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="mt-3 pl-5 text-[13px] text-live">
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}
