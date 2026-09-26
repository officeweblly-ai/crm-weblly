import type { ReactNode } from "react";
import type { Tone } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2 border-line",
  accent: "bg-accent-soft text-accent-ink border-accent/15",
  ok: "bg-ok-soft text-ok border-ok/15",
  warn: "bg-warn-soft text-warn border-warn/15",
  danger: "bg-danger-soft text-danger border-danger/15",
  info: "bg-info-soft text-info border-info/15",
};

const dots: Record<Tone, string> = {
  neutral: "bg-ink-3",
  accent: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  info: "bg-info",
};

export function Badge({ tone = "neutral", children, className, dot = true }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 shrink-0 rounded-full", dots[tone])} aria-hidden />}
      <span className="truncate">{children}</span>
    </span>
  );
}
