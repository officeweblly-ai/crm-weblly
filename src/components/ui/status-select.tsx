"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Loader2 } from "lucide-react";
import type { ActionResult } from "@/lib/actions/result";
import type { Tone } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

const toneCls: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2 border-line-strong",
  accent: "bg-accent-soft text-accent-ink border-accent/25",
  ok: "bg-ok-soft text-ok border-ok/25",
  warn: "bg-warn-soft text-warn border-warn/25",
  danger: "bg-danger-soft text-danger border-danger/25",
  info: "bg-info-soft text-info border-info/25",
};

/** Inline status changer — a native select styled as a badge. */
export function StatusSelect<T extends string>({
  value,
  options,
  toneOf,
  onChange,
  label,
  disabledValues = [],
}: {
  value: T;
  options: { value: T; label: string }[];
  toneOf: (v: T) => Tone;
  onChange: (v: T) => Promise<ActionResult<unknown>>;
  label: string;
  disabledValues?: T[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(value);

  return (
    <div className="relative inline-flex">
      <select
        aria-label={label}
        value={optimistic}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as T;
          start(async () => {
            setOptimistic(next);
            const r = await onChange(next);
            if (r.ok) {
              if (r.message) toast.success(r.message);
              router.refresh();
            } else {
              toast.error(r.error);
            }
          });
        }}
        className={cn(
          "h-8 appearance-none rounded-full border ps-3 pe-8 text-sm font-medium focus:outline-none focus:ring-3 focus:ring-accent/20",
          toneCls[toneOf(optimistic)],
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={disabledValues.includes(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      {pending ? (
        <Loader2 className="pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin" aria-hidden />
      ) : (
        <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 opacity-60" aria-hidden />
      )}
    </div>
  );
}
