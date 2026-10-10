export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="font-mono text-[11px] font-medium tracking-[.22em] text-mist-500 uppercase">{eyebrow}</p>}
        <h1 className="mt-2 font-display text-[clamp(32px,5vw,52px)] leading-none font-extrabold tracking-[-0.03em]">{title}</h1>
        {description && <p className="mt-3 max-w-lg text-[15px] text-mist-500">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ art, title, body, action }) {
  return (
    <div className="flex flex-col items-center rounded-[28px] border border-dashed border-white/[.08] px-6 py-16 text-center">
      {art}
      <h2 className="mt-7 font-display text-xl font-bold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-mist-500">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
