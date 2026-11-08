import { cn } from "@/lib/utils";

export function Logo({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-forest-500 shadow-[0_8px_22px_rgba(37,99,235,.24)]", light && "bg-white")}>
        <svg viewBox="0 0 32 32" className={cn("h-5 w-5 text-white", light && "text-forest-800")} fill="none" aria-hidden="true">
          <path d="M7 23.5 15.9 7l3.3 6.2L14 23.5H7Z" fill="currentColor" opacity=".95" />
          <path d="m18.8 15 6.2 8.5h-9.9L18.8 15Z" fill="currentColor" opacity=".62" />
        </svg>
      </div>
      {!compact ? (
        <div className="leading-none">
          <span className={cn("block font-display text-[17px] font-extrabold tracking-[-0.03em] text-white", light && "text-slate-950")}>AXON</span>
          <span className={cn("mt-1 block text-[9px] font-bold uppercase tracking-[0.23em] text-forest-200", light && "text-forest-700")}>Mobile ERP</span>
        </div>
      ) : null}
    </div>
  );
}
