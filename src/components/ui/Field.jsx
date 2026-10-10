import { cn } from "@/lib/cn";

export function Field({ label, icon: Icon, trailing, className, id, ...props }) {
  return (
    <label htmlFor={id} className="block">
      {label && <span className="mb-1.5 block text-[13px] font-medium text-mist-300">{label}</span>}
      <span
        className={cn(
          "flex h-12 items-center gap-3 rounded-2xl bg-white/[.04] px-4 ring-1 ring-white/[.08] transition",
          "focus-within:bg-white/[.06] focus-within:ring-2 focus-within:ring-signal/70",
          className,
        )}
      >
        {Icon && <Icon className="size-[18px] shrink-0 text-mist-500" />}
        <input
          id={id}
          className="h-full w-full min-w-0 bg-transparent text-[15px] text-mist-100 outline-none placeholder:text-mist-700"
          {...props}
        />
        {trailing}
      </span>
    </label>
  );
}
