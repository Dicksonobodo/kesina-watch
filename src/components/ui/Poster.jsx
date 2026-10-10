import { useState } from "react";
import { cn } from "@/lib/cn";

// Real poster when we have one; otherwise generated cinematic art from a palette.
export function Poster({ src, title, year, palette = ["#c6ff3d", "#0f7b5f", "#04140f"], className }) {
  const [failed, setFailed] = useState(false);
  const [a, b, c] = palette;
  const showImage = src && !failed;

  return (
    <div className={cn("relative aspect-[2/3] overflow-hidden rounded-2xl bg-ink-800 ring-1 ring-white/10", className)}>
      {showImage ? (
        <img
          src={src}
          alt={title}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(120% 80% at 80% 10%, ${a} 0%, transparent 55%),
                           radial-gradient(90% 70% at 10% 60%, ${b} 0%, transparent 60%),
                           linear-gradient(180deg, ${c} 0%, #050507 100%)`,
            }}
          />
          <div
            className="absolute -right-1/4 top-1/4 aspect-square w-[110%] rounded-full border opacity-30"
            style={{ borderColor: a }}
          />
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-[9%]">
            {year && <p className="mb-1 font-mono text-[10px] tracking-[.25em] text-white/60">{year}</p>}
            <p className="font-display text-[clamp(14px,2.2vw,22px)] leading-[1.05] font-bold text-balance text-white uppercase">
              {title}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
